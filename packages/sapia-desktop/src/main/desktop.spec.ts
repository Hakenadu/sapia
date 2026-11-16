import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AiStreamEvent } from '@sapia/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore } from './config-store';
import { FileDiagramStore } from './diagram-store';
import { HostService } from './host-service';
import { expandPath, sapiaPaths } from './paths';
import { packageEntries, resolvePlugins } from './plugins';
import { contentSecurityPolicy, resolveRequest, serveStatic } from './protocol';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sapia-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('paths', () => {
  it('uses SAPIA_HOME when set', () => {
    const paths = sapiaPaths({ SAPIA_HOME: dir });
    expect(paths.config).toBe(join(dir, 'config.json'));
    expect(paths.diagrams).toBe(join(dir, 'diagrams'));
  });

  it('expands relative paths against a base', () => {
    expect(expandPath('./plugins/x', dir)).toBe(join(dir, 'plugins', 'x'));
    expect(expandPath('/abs/x', dir)).toBe('/abs/x');
    expect(expandPath('~/x', dir)).not.toContain('~');
  });
});

describe('ConfigStore', () => {
  it('reports a missing config so the first-run flow can start', async () => {
    const store = new ConfigStore(join(dir, 'config.json'));
    const loaded = await store.load();
    expect(loaded.exists).toBe(false);
    expect(loaded.config.theme).toBe('system');
  });

  it('writes the onboarding answers with sensible defaults', async () => {
    const store = new ConfigStore(join(dir, 'nested', 'config.json'));
    await store.load();
    const loaded = await store.createFromOnboarding({
      locale: 'de',
      theme: 'dark',
      ai: { id: 'default', provider: { type: 'openai-responses', model: 'gpt-x', apiKey: 'sk-1', baseUrl: undefined } },
    });
    expect(loaded.exists).toBe(true);
    expect(loaded.issues).toEqual([]);
    expect(loaded.config.locale).toBe('de');
    expect(loaded.config.ai.enabled).toBe(true);
    expect(loaded.config.ai.providers['default']).toMatchObject({ type: 'openai-responses', model: 'gpt-x', apiKey: 'sk-1' });
    const raw = JSON.parse(await readFile(store.path, 'utf8'));
    expect(raw.keybindings.aiAssistant).toBe('Mod-k');
    expect('baseUrl' in raw.ai.providers.default).toBe(false);
    if (process.platform !== 'win32') expect((await stat(store.path)).mode & 0o077).toBe(0);
  });

  it('writes a config without AI when the step is skipped', async () => {
    const store = new ConfigStore(join(dir, 'config.json'));
    await store.load();
    const loaded = await store.createFromOnboarding({ locale: 'en', theme: 'system' });
    expect(loaded.config.ai.enabled).toBe(false);
  });

  it('keeps unknown keys when preferences change', async () => {
    const path = join(dir, 'config.json');
    await writeFile(path, JSON.stringify({ theme: 'light', custom: { keep: true }, plugins: ['x'] }));
    const store = new ConfigStore(path);
    await store.load();
    await store.updatePreferences({ theme: 'dark', locale: 'de', diagramTheme: 'static' });
    const raw = JSON.parse(await readFile(path, 'utf8'));
    expect(raw).toMatchObject({ theme: 'dark', locale: 'de', diagramTheme: 'static', custom: { keep: true }, plugins: ['x'] });
  });

  it('never overwrites a config it could not parse', async () => {
    const path = join(dir, 'config.json');
    await writeFile(path, '{ "theme": ');
    const store = new ConfigStore(path);
    const loaded = await store.load();
    expect(loaded.exists).toBe(true);
    expect(loaded.issues[0]).toContain('not valid JSON');
    await store.updatePreferences({ theme: 'dark' });
    expect(await readFile(path, 'utf8')).toBe('{ "theme": ');
  });
});

describe('FileDiagramStore', () => {
  it('saves, lists, updates and deletes diagrams as files', async () => {
    const store = new FileDiagramStore(join(dir, 'diagrams'));
    expect(await store.list()).toEqual([]);
    const saved = await store.save({ name: 'Login', source: '@startuml\n@enduml', languageId: 'plantuml', diagramType: 'sequence' });
    expect((await store.get(saved.id))?.source).toBe('@startuml\n@enduml');
    const updated = await store.save({ id: saved.id, name: 'Login v2', source: 'A -> B' });
    expect(updated.id).toBe(saved.id);
    expect(updated.createdAt).toBe(saved.createdAt);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Login v2' });
    expect('source' in list[0]).toBe(false);
    await store.delete(saved.id);
    expect(await store.list()).toEqual([]);
  });

  it('rejects ids that would leave the directory', async () => {
    const store = new FileDiagramStore(join(dir, 'diagrams'));
    expect(await store.get('../config')).toBeNull();
    await expect(store.save({ id: '../evil', name: 'x', source: 'y' })).rejects.toThrow(/Invalid diagram id/);
  });
});

describe('plugin resolution', () => {
  async function pkg(root: string, name: string, manifest: object, files: Record<string, string>): Promise<string> {
    const base = join(root, name);
    await mkdir(base, { recursive: true });
    await writeFile(join(base, 'package.json'), JSON.stringify({ name, ...manifest }));
    for (const [file, content] of Object.entries(files)) {
      await mkdir(join(base, file, '..'), { recursive: true });
      await writeFile(join(base, file), content);
    }
    return base;
  }

  it('prefers the "sapia.plugin" entry of a package', async () => {
    const base = await pkg(dir, 'a', { main: 'cjs.js', sapia: { plugin: './dist/plugin.js', main: './main.cjs' } }, { 'dist/plugin.js': '', 'cjs.js': '', 'main.cjs': '' });
    expect(await packageEntries(base)).toEqual({ entry: 'dist/plugin.js', mainEntry: join(base, 'main.cjs') });
  });

  it('falls back to exports, module and main', async () => {
    const a = await pkg(dir, 'a', { exports: { '.': { import: './esm/index.js', require: './cjs/index.js' } } }, { 'esm/index.js': '', 'cjs/index.js': '' });
    expect((await packageEntries(a)).entry).toBe('esm/index.js');
    const b = await pkg(dir, 'b', { main: 'lib.js' }, { 'lib.js': '' });
    expect((await packageEntries(b)).entry).toBe('lib.js');
  });

  it('refuses entries outside the package', async () => {
    const base = await pkg(dir, 'a', { sapia: { plugin: '../outside.js' } }, {});
    await writeFile(join(dir, 'outside.js'), '');
    await expect(packageEntries(base)).rejects.toThrow(/No plugin entry/);
  });

  it('finds npm packages, local folders, single files and URLs', async () => {
    const modules = join(dir, 'plugins', 'node_modules');
    await pkg(modules, '@acme/sapia-d2', { sapia: { plugin: 'index.js' } }, { 'index.js': '' });
    await pkg(join(dir, 'local'), 'folder', { module: 'plugin.mjs' }, { 'plugin.mjs': '' });
    await writeFile(join(dir, 'single.js'), '');

    const result = await resolvePlugins(
      ['@acme/sapia-d2', './local/folder', { path: 'single.js', options: { a: 1 } }, 'https://example.org/p/plugin.js', 'missing-one', { package: 'off', enabled: false }],
      { baseDir: dir, moduleDirs: [modules] },
    );
    expect(result.plugins.map((p) => [p.origin, p.root, p.entry])).toEqual([
      ['@acme/sapia-d2', join(modules, '@acme/sapia-d2'), 'index.js'],
      ['./local/folder', join(dir, 'local', 'folder'), 'plugin.mjs'],
      ['single.js', dir, 'single.js'],
      ['https://example.org/p/plugin.js', undefined, 'https://example.org/p/plugin.js'],
    ]);
    expect(result.plugins[2].options).toEqual({ a: 1 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ origin: 'missing-one' });
    expect(result.errors[0].error).toContain('npm install --prefix');
  });

  it('asks for further module directories only when needed', async () => {
    const globalRoot = join(dir, 'global');
    await pkg(globalRoot, 'sapia-plugin-x', {}, { 'index.js': '' });
    let asked = 0;
    const result = await resolvePlugins(['sapia-plugin-x'], {
      baseDir: dir,
      moduleDirs: [],
      lazyModuleDirs: async () => {
        asked++;
        return [globalRoot];
      },
    });
    expect(asked).toBe(1);
    expect(result.plugins[0].root).toBe(join(globalRoot, 'sapia-plugin-x'));
  });
});

describe('static protocol', () => {
  it('maps app and plugin hosts to their roots and blocks traversal', () => {
    const roots = { web: '/srv/web', plugins: new Map([['plugin-0', '/srv/p0']]), remoteOrigins: [] };
    expect(resolveRequest('sapia://app/main.js', roots)?.file).toBe('/srv/web/main.js');
    expect(resolveRequest('sapia://app/', roots)).toMatchObject({ spaFallback: true });
    expect(resolveRequest('sapia://plugin-0/dist/a.js', roots)?.file).toBe('/srv/p0/dist/a.js');
    expect(resolveRequest('sapia://plugin-9/a.js', roots)).toBeNull();
    // Dot segments are resolved by the URL parser and can never climb above the root.
    expect(resolveRequest('sapia://plugin-0/%2e%2e/%2e%2e/etc/passwd', roots)?.file).toBe('/srv/p0/etc/passwd');
    expect(resolveRequest('sapia://plugin-0/..%2f..%2fetc/passwd', roots)).toBeNull();
    expect(resolveRequest('sapia://plugin-0/a/..%5c..%5c..%5cetc', roots)?.file.startsWith('/srv/p0/')).toBe(true);
    expect(resolveRequest('https://app/main.js', roots)).toBeNull();
  });

  it('serves files with a type and the page with a CSP', async () => {
    await writeFile(join(dir, 'index.html'), '<html></html>');
    await writeFile(join(dir, 'main.js'), 'export {}');
    const roots = { web: dir, plugins: new Map<string, string>(), remoteOrigins: ['https://cdn.example.org'] };
    const page = await serveStatic('sapia://app/', roots);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain('https://cdn.example.org');
    const script = await serveStatic('sapia://app/main.js', roots);
    expect(script.headers.get('content-type')).toContain('text/javascript');
    expect((await serveStatic('sapia://app/missing.js', roots)).status).toBe(404);
  });

  it('does not allow eval or inline scripts', () => {
    const csp = contentSecurityPolicy([]);
    const script = csp.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toMatch(/'unsafe-eval'/);
  });
});

describe('HostService with a fake OpenAI compatible server', () => {
  let server: Server;
  let baseUrl: string;
  const requests: { url: string; auth?: string; body: any }[] = [];

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      let text = '';
      for await (const chunk of req) text += chunk;
      const body = text ? JSON.parse(text) : null;
      requests.push({ url: req.url ?? '', auth: req.headers.authorization, body });
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (req.headers.authorization !== 'Bearer sk-good') return json(401, { error: { message: 'Incorrect API key provided' } });
      if (req.url === '/v1/models') return json(200, { data: [{ id: 'model-a' }, { id: 'model-b' }] });
      if (req.url !== '/v1/chat/completions') return json(404, { error: { message: 'not found' } });
      if (!body.stream) {
        return json(200, {
          id: 'c',
          object: 'chat.completion',
          created: 1,
          model: body.model,
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (choice: object) =>
        res.write(`data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, ...choice }] })}\n\n`);
      const toolAnswered = body.messages.some((m: { role: string }) => m.role === 'tool');
      if (!toolAnswered) {
        chunk({ delta: { role: 'assistant', content: null, tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'add_to_diagram', arguments: '{"content":' } }] }, finish_reason: null });
        chunk({ delta: { tool_calls: [{ index: 0, function: { arguments: '"A -> B"}' } }] }, finish_reason: null });
        chunk({ delta: {}, finish_reason: 'tool_calls' });
      } else {
        chunk({ delta: { role: 'assistant', content: 'Added ' }, finish_reason: null });
        chunk({ delta: { content: 'the arrow.' }, finish_reason: null });
        chunk({ delta: {}, finish_reason: 'stop' });
      }
      res.end('data: [DONE]\n\n');
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });
  afterAll(() => server.close());
  beforeEach(() => {
    requests.length = 0;
  });

  async function hostWith(config: object | null, env: NodeJS.ProcessEnv = {}): Promise<HostService> {
    if (config) await writeFile(join(dir, 'config.json'), JSON.stringify(config));
    const host = new HostService({ paths: sapiaPaths({ SAPIA_HOME: dir }), webRoot: dir, appVersion: '0.0.0-test', systemLocales: () => ['de-DE'], env });
    await host.initialise();
    return host;
  }

  const tools = [{ name: 'add_to_diagram', description: 'Adds lines', inputSchema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] }, mutating: true }];

  it('runs the first-run flow and never exposes the API key to the UI', async () => {
    const host = await hostWith(null);
    expect(host.bootstrap().configExists).toBe(false);
    expect(host.bootstrap().aiProviderTypes.map((t) => t.id)).toEqual(['openai-responses', 'openai-chat']);
    const bootstrap = await host.completeOnboarding({ locale: 'de', theme: 'dark', ai: { id: 'default', provider: { type: 'openai-chat', model: 'model-a', baseUrl, apiKey: 'sk-good' } } });
    expect(bootstrap.configExists).toBe(true);
    expect(bootstrap.systemLocales).toEqual(['de-DE']);
    expect(JSON.stringify(bootstrap)).not.toContain('sk-good');
    expect(host.config.ai.providers['default'].apiKey).toBe('sk-good');
    // A second run must not replace the existing file.
    await host.completeOnboarding({ locale: 'en', theme: 'light' });
    expect(host.config.locale).toBe('de');
  });

  it('tests a provider: wrong key, unknown model, success', async () => {
    const host = await hostWith(null);
    const bad = await host.ai.testProvider({ type: 'openai-chat', model: 'model-a', baseUrl, apiKey: 'sk-bad' });
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('401');
    const unknown = await host.ai.testProvider({ type: 'openai-chat', model: 'nope', baseUrl, apiKey: 'sk-good' });
    expect(unknown).toMatchObject({ ok: false, reason: 'model-not-listed', models: ['model-a', 'model-b'] });
    const good = await host.ai.testProvider({ type: 'openai-chat', model: 'model-a', baseUrl, apiKey: 'sk-good' });
    expect(good).toMatchObject({ ok: true, models: ['model-a', 'model-b'] });
    const type = await host.ai.testProvider({ type: 'made-up', model: 'x' });
    expect(type.message).toContain('Unknown AI provider type');
  });

  it('streams a chat, runs tools through the UI callback and keeps the history', async () => {
    const host = await hostWith({ ai: { provider: 'local', providers: { local: { type: 'openai-chat', model: 'model-a', baseUrl, apiKeyEnv: 'MY_KEY' } } } }, { MY_KEY: 'sk-good' });
    const events: AiStreamEvent[] = [];
    const calls: [string, unknown][] = [];
    await host.ai.chat(
      { sessionId: 's1', message: 'add an arrow', system: 'You are a test.', tools },
      {
        onEvent: (event) => events.push(event),
        executeTool: async (name, input) => {
          calls.push([name, input]);
          return { ok: true };
        },
      },
    );
    expect(calls).toEqual([['add_to_diagram', { content: 'A -> B' }]]);
    expect(events.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text).join('')).toBe('Added the arrow.');
    expect(events.map((e) => e.type)).toContain('tool-call');
    expect(events.at(-1)).toEqual({ type: 'finish' });
    expect(events.some((e) => e.type === 'error')).toBe(false);

    const first = requests.find((r) => r.body?.stream)!;
    expect(first.auth).toBe('Bearer sk-good');
    expect(first.body.messages[0]).toMatchObject({ role: 'system', content: 'You are a test.' });
    expect(first.body.tools[0].function.name).toBe('add_to_diagram');

    // The follow-up question carries the earlier exchange, including the tool call.
    requests.length = 0;
    await host.ai.chat({ sessionId: 's1', message: 'thanks', system: 'You are a test.', tools }, { onEvent: () => undefined, executeTool: async () => null });
    const roles = requests[0].body.messages.map((m: { role: string }) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'tool', 'assistant', 'user']);

    await host.ai.reset('s1');
    requests.length = 0;
    await host.ai.chat({ sessionId: 's1', message: 'again', system: 'You are a test.', tools: [] }, { onEvent: () => undefined, executeTool: async () => null });
    expect(requests[0].body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user']);
  });

  it('reports provider errors as an error event', async () => {
    const host = await hostWith({ ai: { provider: 'local', providers: { local: { type: 'openai-chat', model: 'model-a', baseUrl, apiKey: 'sk-bad' } } } });
    const events: AiStreamEvent[] = [];
    await host.ai.chat({ sessionId: 's2', message: 'hi', system: '', tools: [] }, { onEvent: (e) => events.push(e), executeTool: async () => null });
    const error = events.find((e) => e.type === 'error') as { message: string } | undefined;
    expect(error?.message).toMatch(/Incorrect API key|401/);
    expect(events.at(-1)).toEqual({ type: 'finish' });
  });

  it('fails clearly without a provider', async () => {
    const host = await hostWith({});
    await expect(host.ai.chat({ sessionId: 's', message: 'hi', system: '', tools: [] }, { onEvent: () => undefined, executeTool: async () => null })).rejects.toThrow(/No AI provider/);
  });

  it('serves plugins under their own host and lets a main entry add provider types', async () => {
    const plugin = join(dir, 'my-plugin');
    await mkdir(plugin, { recursive: true });
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'my-plugin', sapia: { plugin: 'ui.js', main: 'main.cjs' } }));
    await writeFile(join(plugin, 'ui.js'), 'export default {}');
    await writeFile(
      join(plugin, 'main.cjs'),
      `exports.activate = (ctx) => ctx.registerAiProvider({ info: { id: 'echo', name: 'Echo ' + ctx.options.suffix }, createModel: () => { throw new Error('not needed'); } });`,
    );
    const host = await hostWith({ plugins: [{ path: './my-plugin', options: { suffix: 'AI' } }, 'https://example.org/x/plugin.js', 'ghost'] });
    const bootstrap = host.bootstrap();
    expect(bootstrap.plugins).toEqual([
      { origin: './my-plugin', url: 'sapia://plugin-0/ui.js', assetBase: 'sapia://plugin-0/', options: { suffix: 'AI' } },
      { origin: 'https://example.org/x/plugin.js', url: 'https://example.org/x/plugin.js', assetBase: 'https://example.org/x/', options: {} },
    ]);
    expect(bootstrap.pluginErrors.map((e) => e.origin)).toEqual(['ghost']);
    expect(bootstrap.aiProviderTypes.at(-1)).toEqual({ id: 'echo', name: 'Echo AI' });
    expect(host.roots.plugins.get('plugin-0')).toBe(plugin);
    expect(host.roots.remoteOrigins).toEqual(['https://example.org']);
  });
});
