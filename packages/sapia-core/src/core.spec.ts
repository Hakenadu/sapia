import { describe, expect, it, vi } from 'vitest';
import {
  AiToolRegistry,
  ConversionService,
  I18n,
  KeyValueDiagramStore,
  LineIndex,
  MemoryStorage,
  appendToSource,
  createCoreAiTools,
  createRuleTokenizer,
  createSapia,
  definePlugin,
  normalizeConfig,
  pluginFromModule,
  redactConfig,
  isValidHeaderName,
  isValidHeaderValue,
  resolveHeaderValue,
  resolveLocale,
  resolvePluginReference,
  toIdentifier,
} from './index';
import type { AiWorkspace, DiagramSnapshot, MindmapModel } from './index';

describe('LineIndex', () => {
  it('converts between offsets and positions', () => {
    const index = new LineIndex('ab\ncde\r\n\nf');
    expect(index.lineCount).toBe(4);
    expect(index.positionAt(4)).toEqual({ line: 1, column: 1 });
    expect(index.offsetAt({ line: 3, column: 1 })).toBe(10);
    expect(index.lineRange(1)).toEqual({ from: 3, to: 6 });
  });
  it('trims line ranges', () => {
    expect(new LineIndex('  ab  ').lineRange(0, true)).toEqual({ from: 2, to: 4 });
  });
});

describe('toIdentifier', () => {
  it('sanitises and de-duplicates', () => {
    const taken = new Set<string>();
    expect(toIdentifier('Web App', taken)).toBe('Web_App');
    expect(toIdentifier('Web-App', taken)).toBe('Web_App_2');
    expect(toIdentifier('1st', taken, 'p')).toBe('p1st');
    expect(toIdentifier('Über', taken)).toBe('Uber');
  });
});

describe('rule tokenizer', () => {
  const tokenizer = createRuleTokenizer({
    transient: ['label'],
    states: {
      root: [
        { match: /\/\*/, token: 'comment', next: 'comment' },
        { match: /(key)(\s+)(\w+)/, token: ['keyword', null, 'definition'], lineStart: true },
        { match: /->/, token: 'arrow', next: 'label' },
        { match: /\w+/, token: 'name' },
      ],
      label: [{ match: /:.*$/, token: 'label' }, { match: /\w+/, token: 'name' }],
      comment: [{ match: /.*?\*\//, token: 'comment', next: '@pop' }, { match: /.+/, token: 'comment' }],
    },
  });
  it('tokenizes with capture groups and line-start rules', () => {
    const { tokens } = tokenizer.tokenizeLine('  key Foo key', tokenizer.startState());
    expect(tokens.map((t) => t.type)).toEqual(['keyword', 'definition', 'name']);
  });
  it('keeps multi-line state and drops transient state', () => {
    let r = tokenizer.tokenizeLine('a /* x', tokenizer.startState());
    expect(r.state).toBe('root>comment');
    r = tokenizer.tokenizeLine('y */ b', r.state);
    expect(r.state).toBe('root');
    r = tokenizer.tokenizeLine('a -> b : text', r.state);
    expect(r.tokens.at(-1)?.type).toBe('label');
    expect(tokenizer.tokenizeLine('a', r.state).state).toBe('root');
  });
});

describe('i18n', () => {
  it('resolves locales with English as fallback', () => {
    expect(resolveLocale(['de-AT', 'en'], ['en', 'de'])).toBe('de');
    expect(resolveLocale(['fr-FR'], ['en', 'de'])).toBe('en');
    expect(resolveLocale(undefined, ['en', 'de'])).toBe('en');
  });
  it('translates, interpolates and falls back', () => {
    const i18n = new I18n();
    i18n.addMessages('en', { hi: 'Hello {name}', only: 'English', n: '{count} items', n_one: 'One item' });
    i18n.addMessages('de', { hi: 'Hallo {name}' });
    i18n.setLocale('de-DE');
    expect(i18n.t('hi', { name: 'Ada' })).toBe('Hallo Ada');
    expect(i18n.t('only')).toBe('English');
    expect(i18n.t('missing')).toBe('missing');
    expect(i18n.t('n', { count: 1 })).toBe('One item');
    expect(i18n.t('n', { count: 3 })).toBe('3 items');
    expect(i18n.setLocale('xx')).toBe('en');
  });
});

describe('config', () => {
  it('fills defaults for missing config', () => {
    const { config, issues } = normalizeConfig(undefined);
    expect(issues).toEqual([]);
    expect(config.theme).toBe('system');
    expect(config.diagramTheme).toBe('adaptive');
    expect(config.ai.enabled).toBe(false);
  });
  it('reads the diagram theme mode', () => {
    expect(normalizeConfig({ diagramTheme: 'static' }).config.diagramTheme).toBe('static');
    const { config, issues } = normalizeConfig({ diagramTheme: 'sepia' });
    expect(config.diagramTheme).toBe('adaptive');
    expect(issues).toEqual(['diagramTheme must be "adaptive" or "static"']);
  });
  it('validates and reports issues without throwing', () => {
    const { config, issues } = normalizeConfig({
      theme: 'pink',
      editor: { fontSize: 'big', tabSize: 99 },
      plugins: ['@acme/sapia-d2', { path: './local' }, 42],
      ai: { provider: 'nope', providers: { main: { type: 'openai-chat', model: 'm', apiKey: 'sk-1' }, bad: {} } },
    });
    expect(config.theme).toBe('system');
    expect(config.editor.fontSize).toBe(14);
    expect(config.editor.tabSize).toBe(8);
    expect(config.plugins).toHaveLength(2);
    expect(config.ai.provider).toBe('main');
    expect(config.ai.enabled).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });
  it('classifies plugin references', () => {
    expect(resolvePluginReference('@acme/plugin')?.kind).toBe('package');
    expect(resolvePluginReference('./plugins/x')?.kind).toBe('path');
    expect(resolvePluginReference('~/x')?.kind).toBe('path');
    expect(resolvePluginReference('C:\\x')?.kind).toBe('path');
    expect(resolvePluginReference('https://x.dev/p.js')?.kind).toBe('url');
    expect(resolvePluginReference({ package: 'p', enabled: false })?.enabled).toBe(false);
  });
  it('redacts secrets', () => {
    const { config } = normalizeConfig({ ai: { providers: { a: { type: 'openai-chat', model: 'm', apiKey: 'sk-secret', headers: { 'X-Token': 'hdr-secret' } } } } });
    const redacted = redactConfig(config);
    expect(JSON.stringify(redacted)).not.toContain('sk-secret');
    expect(JSON.stringify(redacted)).not.toContain('hdr-secret');
    expect(Object.keys(redacted.ai.providers['a'].headers!)).toEqual(['X-Token']);
    expect(config.ai.providers['a'].apiKey).toBe('sk-secret');
    expect(config.ai.providers['a'].headers).toEqual({ 'X-Token': 'hdr-secret' });
  });
  it('validates custom provider headers and expands environment references', () => {
    const { config, issues } = normalizeConfig({
      ai: { providers: { a: { type: 'openai-chat', model: 'm', headers: { 'X-Ok': 'v', 'bad name': 'v', 'X-Num': 1, 'X-Break': 'a\r\nb' } } } },
    });
    expect(config.ai.providers['a'].headers).toEqual({ 'X-Ok': 'v' });
    expect(issues).toHaveLength(3);
    expect(isValidHeaderName('X-Api-Key')).toBe(true);
    expect(isValidHeaderName('X Api')).toBe(false);
    expect(isValidHeaderValue('a\tb')).toBe(true);
    expect(isValidHeaderValue('a\nb')).toBe(false);
    expect(resolveHeaderValue('Bearer ${env:T}-${env:MISSING}', { T: 'x' })).toBe('Bearer x-');
  });
});

describe('storage', () => {
  it('saves, lists, updates and deletes diagrams', async () => {
    const store = new KeyValueDiagramStore(new MemoryStorage());
    const a = await store.save({ name: 'A', source: 'x' });
    await store.save({ name: 'B', source: 'y' });
    const updated = await store.save({ id: a.id, name: 'A2', source: 'z' });
    expect(updated.createdAt).toBe(a.createdAt);
    expect((await store.list()).map((d) => d.name).sort()).toEqual(['A2', 'B']);
    expect((await store.get(a.id))?.source).toBe('z');
    await store.delete(a.id);
    expect(await store.get(a.id)).toBeNull();
    expect(await store.list()).toHaveLength(1);
  });
});

describe('plugins', () => {
  it('activates plugins and rolls back failing ones', async () => {
    const sapia = createSapia({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
    const good = definePlugin({
      id: 'test.good',
      name: 'Good',
      activate(ctx) {
        ctx.languages.register({ id: 'x', name: 'X', diagramTypes: [], detect: (s) => (s.startsWith('x') ? { confidence: 1, diagramType: 'sequence' } : null) });
        ctx.i18n.addMessages('en', { 'x.hello': 'hi' });
      },
    });
    const bad = definePlugin({
      id: 'test.bad',
      name: 'Bad',
      activate(ctx) {
        ctx.languages.register({ id: 'y', name: 'Y', diagramTypes: [], detect: () => null });
        throw new Error('boom');
      },
    });
    expect((await sapia.plugins.activate(good)).status).toBe('active');
    const info = await sapia.plugins.activate(bad);
    expect(info.status).toBe('failed');
    expect(info.error).toBe('boom');
    expect(sapia.languages.get('y')).toBeUndefined();
    expect(sapia.languages.detect('xyz')).toMatchObject({ languageId: 'x', diagramType: 'sequence' });
    expect(sapia.languages.detect('abc')).toBeNull();
    sapia.plugins.deactivate('test.good');
    expect(sapia.languages.get('x')).toBeUndefined();
  });
  it('honours disabled plugins', async () => {
    const sapia = createSapia({ disabledPlugins: ['p'] });
    const activate = vi.fn();
    expect((await sapia.plugins.activate({ id: 'p', name: 'P', activate })).status).toBe('disabled');
    expect(activate).not.toHaveBeenCalled();
  });
  it('finds plugins in module shapes', () => {
    const plugin = { id: 'a', name: 'A', activate() {} };
    expect(pluginFromModule({ default: plugin })).toBe(plugin);
    expect(pluginFromModule({ plugin })).toBe(plugin);
    expect(pluginFromModule({ default: () => plugin })).toBe(plugin);
    expect(pluginFromModule({ default: { default: plugin } })).toBe(plugin);
    expect(pluginFromModule({})).toBeNull();
  });
});

describe('conversion', () => {
  it('converts through the metamodel', () => {
    const service = new ConversionService();
    const model: MindmapModel = { kind: 'mindmap', root: { text: 'r', children: [] } };
    service.registerMapper<MindmapModel>({ languageId: 'a', diagramType: 'mindmap', parse: () => ({ model, warnings: ['w'] }), generate: () => 'A' });
    service.registerMapper<MindmapModel>({ languageId: 'b', diagramType: 'mindmap', parse: () => ({ model, warnings: [] }), generate: (m) => `B:${m.root.text}` });
    expect(service.targetsFor('a', 'mindmap')).toEqual(['b']);
    expect(service.targetsFor('a', 'class')).toEqual([]);
    expect(service.canConvert('a', 'a', 'mindmap')).toBe(false);
    expect(service.convert({ source: '', from: 'a', to: 'b', diagramType: 'mindmap' })).toMatchObject({ source: 'B:r', warnings: ['w'] });
    expect(() => service.convert({ source: '', from: 'a', to: 'c', diagramType: 'mindmap' })).toThrow(/No mapper/);
  });
});

describe('AI tools', () => {
  const snapshot = (source: string): DiagramSnapshot => ({ id: '1', name: 'D', source, languageId: 'plantuml', diagramType: 'sequence', diagnostics: [], conversionTargets: ['mermaid'] });
  const workspace = (initial: string) => {
    let source = initial;
    const ws = {
      getActiveDiagram: async () => snapshot(source),
      setActiveSource: async (s: string) => snapshot((source = s)),
    } as Partial<AiWorkspace> as AiWorkspace;
    return { ws, get: () => source };
  };
  const registry = new AiToolRegistry();
  for (const tool of createCoreAiTools()) registry.register(tool);

  it('appends before closing directives', () => {
    expect(appendToSource('@startuml\nA -> B\n@enduml\n', 'B -> C')).toBe('@startuml\nA -> B\nB -> C\n@enduml\n');
    expect(appendToSource('flowchart LR\n  A --> B', '  B --> C')).toBe('flowchart LR\n  A --> B\n  B --> C\n');
  });
  it('applies unique edits and rejects ambiguous ones', async () => {
    const { ws, get } = workspace('A -> B\nB -> C\n');
    const ok = await registry.execute('edit_diagram', { edits: [{ find: 'B -> C', replace: 'B -> D' }] }, { workspace: ws });
    expect(ok.isError).toBe(false);
    expect(get()).toBe('A -> B\nB -> D\n');
    const bad = await registry.execute('edit_diagram', { edits: [{ find: 'B', replace: 'X' }] }, { workspace: ws });
    expect(bad.isError).toBe(true);
    expect(get()).toBe('A -> B\nB -> D\n');
  });
  it('reports unknown tools as errors', async () => {
    expect((await registry.execute('nope', {}, { workspace: {} as AiWorkspace })).isError).toBe(true);
  });
  it('exposes serializable specs', () => {
    const specs = registry.specs();
    expect(specs.length).toBeGreaterThan(8);
    expect(() => JSON.stringify(specs)).not.toThrow();
    expect(specs.every((s) => s.inputSchema.type === 'object')).toBe(true);
  });
});
