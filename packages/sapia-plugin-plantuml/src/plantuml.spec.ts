import { describe, expect, it } from 'vitest';
import { createSapia } from '@sapia/core';
import type { CompletionResult } from '@sapia/core';
import {
  completePlantUml,
  detectPlantUml,
  generateClass,
  generateSequence,
  locatePlantUml,
  parseClass,
  parseErrorSvg,
  parseMindmap,
  parseSequence,
  parseState,
  plantUmlPlugin,
  plantUmlSymbols,
  plantUmlTokenizer,
  validatePlantUml,
} from './index';

const t = (key: string) => key;
const noWarn = () => {
  throw new Error('unexpected warning');
};
const uml = (body: string) => `@startuml\n${body}\n@enduml`;

/** Runs completion at the `|` marker. */
function complete(text: string, diagramType: string, explicit = true): CompletionResult | null {
  const offset = text.indexOf('|');
  return completePlantUml({ source: text.replace('|', ''), offset, diagramType, explicit }, t);
}
const labels = (r: CompletionResult | null) => r?.items.map((i) => i.label) ?? [];

describe('detection', () => {
  const cases: [string, string][] = [
    ['participant A\nA -> B : hi', 'sequence'],
    ['Alice -> Bob : hello\nBob --> Alice : hi', 'sequence'],
    ['class Foo {\n +bar()\n}\nFoo <|-- Baz', 'class'],
    ['[*] --> Idle\nIdle --> Done', 'state'],
    ['[Web] --> [Api]\ndatabase DB', 'component'],
    ['actor User\n(Login) as UC1\nUser --> UC1', 'usecase'],
    ['start\n:Step one;\nif (ok?) then (yes)\n:Go;\nendif\nstop', 'activity'],
    ['object user\nuser : name = "x"', 'object'],
    ['node Server\nartifact app.war', 'deployment'],
    ['entity User {\n *id\n}\nUser ||--o{ Order', 'er'],
    ['skinparam monochrome true', 'unknown'],
  ];
  for (const [body, type] of cases) {
    it(`detects ${type}`, () => expect(detectPlantUml(uml(body))).toMatchObject({ diagramType: type, confidence: 0.98 }));
  }
  it('uses the start tag', () => {
    expect(detectPlantUml('@startmindmap\n* a\n@endmindmap')?.diagramType).toBe('mindmap');
    expect(detectPlantUml('@startgantt\n[T] lasts 3 days\n@endgantt')?.diagramType).toBe('gantt');
  });
  it('recognises PlantUML without start tag, with lower confidence', () => {
    const r = detectPlantUml('Alice -> Bob : hi');
    expect(r?.diagramType).toBe('sequence');
    expect(r!.confidence).toBeLessThan(0.9);
  });
  it('does not claim Mermaid or prose', () => {
    expect(detectPlantUml('sequenceDiagram\n  A->>B: hi')).toBeNull();
    expect(detectPlantUml('flowchart LR\n  A --> B')).toBeNull();
    expect(detectPlantUml('hello world')).toBeNull();
    expect(detectPlantUml('')).toBeNull();
  });
});

describe('symbols', () => {
  it('finds declared and implicit entities with aliases', () => {
    const symbols = plantUmlSymbols(uml('participant "Web App" as App\nactor Bob\nApp -> Carol : x\n[Billing Service] as billing\n[Plain]'));
    expect(symbols.map((s) => [s.name, s.label, s.detail])).toEqual([
      ['App', 'Web App', 'participant'],
      ['Bob', undefined, 'actor'],
      ['Carol', undefined, 'implicit'],
      ['billing', 'Billing Service', 'component'],
      ['Plain', undefined, 'component'],
    ]);
  });
  it('ignores comments and notes', () => {
    const symbols = plantUmlSymbols(uml("' Ghost -> Other\nnote left of A\n  Fake -> Thing\nend note\nA -> B"));
    expect(symbols.map((s) => s.name)).toEqual(['A', 'B']);
  });
});

describe('completion', () => {
  const seq = 'participant "Web App" as App\nactor Bob\ndatabase DB\n';
  it('offers entities after an arrow, and only entities', () => {
    const r = complete(uml(`${seq}App -> |`), 'sequence');
    expect(labels(r)).toEqual(['App', 'Bob', 'DB']);
    expect(r!.items.every((i) => i.kind === 'entity')).toBe(true);
  });
  it('filters by position of the partial word', () => {
    const text = uml(`${seq}App -> Bo|`);
    const r = complete(text, 'sequence');
    expect(text.replace('|', '').slice(r!.from, r!.from + 2)).toBe('Bo');
  });
  it('offers arrows after a known entity', () => {
    const r = complete(uml(`${seq}App |`), 'sequence');
    expect(labels(r)).toContain('->');
    expect(r!.items.every((i) => i.kind === 'arrow')).toBe(true);
  });
  it('offers nothing in message text, comments and new names', () => {
    expect(complete(uml(`${seq}App -> Bob : hello |`), 'sequence')).toBeNull();
    expect(complete(uml(`${seq}' App -> |`), 'sequence')).toBeNull();
    expect(complete(uml(`${seq}participant |`), 'sequence')).toBeNull();
  });
  it('offers entities after activate / note over', () => {
    expect(labels(complete(uml(`${seq}activate |`), 'sequence'))).toEqual(['App', 'Bob', 'DB']);
    expect(labels(complete(uml(`${seq}note over |`), 'sequence'))).toEqual(['App', 'Bob', 'DB']);
  });
  it('offers keywords, snippets and entities at statement start', () => {
    const r = complete(uml(`${seq}|`), 'sequence');
    expect(labels(r)).toEqual(expect.arrayContaining(['participant', 'alt', 'App', 'activate']));
    expect(complete(uml(`${seq}|`), 'sequence', false)).toBeNull();
  });
  it('uses class arrows and bracket references by diagram type', () => {
    expect(labels(complete(uml('class A\nclass B\nA |'), 'class'))).toContain('<|--');
    expect(labels(complete(uml('[Web App] as web\n[Api]\nweb --> |'), 'component'))).toEqual(['web', '[Api]']);
  });
  it('offers member helpers inside a class body', () => {
    expect(labels(complete(uml('class A {\n  |\n}'), 'class'))).toContain('{static}');
  });
  it('offers skinparams, themes and templates', () => {
    expect(labels(complete(uml('skinparam back|'), 'sequence'))).toContain('backgroundColor');
    expect(labels(complete(uml('!theme |'), 'sequence'))).toContain('cerulean');
    expect(complete('@sta|', 'unknown')!.items[0].kind).toBe('snippet');
  });
  it('offers the pseudo state in state diagrams', () => {
    expect(labels(complete(uml('[*] --> Idle\nIdle --> |'), 'state'))).toEqual(['[*]', 'Idle']);
  });
});

describe('validation', () => {
  const validate = (source: string, diagramType = 'sequence') => validatePlantUml({ source, diagramType }, t).map((d) => d.message);
  it('accepts well-formed diagrams', () => {
    expect(validate(uml('A -> B\nalt x\n A -> B\nelse y\n B -> A\nend\nnote over A\n text {\nend note'))).toEqual([]);
    expect(validate(uml('class A {\n +x\n}'), 'class')).toEqual([]);
  });
  it('reports structural problems', () => {
    expect(validate('@startuml\nA -> B')).toEqual(['plantuml.error.missingEnd']);
    expect(validate(uml('alt x\nA -> B'))).toEqual(['plantuml.error.unclosedBlock']);
    expect(validate(uml('end'))).toEqual(['plantuml.error.endWithoutBlock']);
    expect(validate(uml('class A {'), 'class')).toEqual(['plantuml.error.unclosedBrace']);
    expect(validate('@startuml\nA -> B\n@endmindmap')).toEqual(['plantuml.error.endMismatch']);
  });
  it('points at the offending line', () => {
    const source = uml('A -> B\nalt x');
    const [d] = validatePlantUml({ source, diagramType: 'sequence' }, t);
    expect(source.slice(d.from, d.to)).toBe('alt x');
  });
});

describe('tokenizer', () => {
  const types = (line: string, state = plantUmlTokenizer.startState()) => {
    const r = plantUmlTokenizer.tokenizeLine(line, state);
    return r.tokens.map((tk) => `${tk.type}:${line.slice(tk.from, tk.to)}`);
  };
  it('highlights messages', () => {
    expect(types('Alice -> Bob : Hello there')).toEqual(['name:Alice', 'arrow:->', 'name:Bob', 'label:: Hello there']);
  });
  it('highlights declarations, strings and stereotypes', () => {
    expect(types('participant "Web App" as App <<service>> #red')).toEqual([
      'definitionKeyword:participant', 'string:"Web App"', 'keyword:as', 'definition:App', 'tag:<<service>>', 'color:#red',
    ]);
  });
  it('handles comments and directives', () => {
    expect(types("' a comment")).toEqual(["comment:' a comment"]);
    expect(types('@startuml')).toEqual(['meta:@startuml']);
    const open = plantUmlTokenizer.tokenizeLine("/' start", plantUmlTokenizer.startState());
    expect(types("still '/ A", open.state)).toEqual(["comment:still '/", 'name:A']);
  });
  it('switches grammar for mind maps', () => {
    const s = plantUmlTokenizer.tokenizeLine('@startmindmap', plantUmlTokenizer.startState()).state;
    expect(types('** Branch', s)).toEqual(['operator:**', 'heading: Branch']);
  });
});

describe('rendering helpers', () => {
  it('recognises the error picture', () => {
    const svg = '<svg><text fill="#000000">[From textarea (line 3) ]</text><text fill="#FF0000"> Syntax Error? (Assumed diagram type: sequence)</text></svg>';
    const source = '@startuml\nA -> B\ngarbage ((\n@enduml';
    const d = parseErrorSvg(svg, source, t)!;
    expect(source.slice(d.from, d.to)).toBe('garbage ((');
    expect(d.message).toContain('Syntax Error?');
    expect(parseErrorSvg('<svg><text fill="#000000">Alice</text></svg>', source, t)).toBeNull();
  });
  it('locates elements by recorded source line', () => {
    const source = '@startuml\nparticipant Alice\nAlice -> Bob : hi\n@enduml';
    const el = (attributes: Record<string, string>, text?: string) => ({ tag: 'g', classes: [], attributes, text });
    const r1 = locatePlantUml({ source, diagramType: 'sequence', path: [el({}, 'Alice'), el({ 'data-source-line': '1', 'data-qualified-name': 'Alice' })] })!;
    expect(source.slice(r1.from, r1.to)).toBe('Alice');
    const r2 = locatePlantUml({ source, diagramType: 'sequence', path: [el({ 'data-source-line': '2' })] })!;
    expect(source.slice(r2.from, r2.to)).toBe('Alice -> Bob : hi');
    const r3 = locatePlantUml({ source, diagramType: 'sequence', path: [el({}, 'Bob')] })!;
    expect(source.slice(r3.from, r3.to)).toBe('Bob');
  });
});

describe('metamodel mappers', () => {
  it('parses sequence diagrams', () => {
    const model = parseSequence(
      uml('title Login\nactor User\nparticipant "Web App" as App\nUser -> App : Sign in\nactivate App\nApp <-- User : late\nalt ok\n App --> User : Welcome\nelse failed\n App ->x User : Error\nend\nnote over User, App : shared\n== Done =='),
      noWarn,
    );
    expect(model.title).toBe('Login');
    expect(model.participants).toEqual([
      { id: 'User', type: 'actor', label: undefined },
      { id: 'App', type: 'participant', label: 'Web App' },
    ]);
    expect(model.elements.map((e) => e.type)).toEqual(['message', 'activate', 'message', 'block', 'note', 'divider']);
    expect(model.elements[2]).toMatchObject({ from: 'User', to: 'App', line: 'dotted' });
    const block = model.elements[3];
    expect(block.type === 'block' && block.branches.map((b) => b.label)).toEqual(['ok', 'failed']);
    expect(block.type === 'block' && block.branches[1].elements[0]).toMatchObject({ arrow: 'cross' });
  });
  it('round-trips sequence diagrams', () => {
    const source = uml('actor User\nparticipant "Web App" as App\n\nUser -> App : Sign in\nloop retry\n  App --> User : Again\nend');
    const once = generateSequence(parseSequence(source, noWarn));
    expect(generateSequence(parseSequence(once, noWarn))).toBe(once);
    expect(once).toContain('participant "Web App" as App');
  });
  it('parses class diagrams and normalises relation direction', () => {
    const model = parseClass(
      uml('interface Shape {\n +area(): double\n}\nabstract class Base\nclass Circle {\n -radius: double\n {static} +unit(): Circle\n}\nShape <|.. Base\nCircle --|> Base\nCanvas "1" o-- "0..*" Shape : shapes\nclass Dog extends Animal implements Pet'),
      noWarn,
    );
    expect(model.classes.map((c) => [c.id, c.kind])).toEqual([
      ['Shape', 'interface'], ['Base', 'abstract'], ['Circle', 'class'], ['Canvas', 'class'], ['Dog', 'class'], ['Animal', 'class'], ['Pet', 'interface'],
    ]);
    expect(model.classes[2].members).toEqual([
      { text: 'radius: double', isMethod: false, visibility: 'private' },
      { text: 'unit(): Circle', isMethod: true, visibility: 'public', static: true },
    ]);
    expect(model.relations).toEqual([
      { from: 'Base', to: 'Shape', type: 'realization', label: undefined, fromCardinality: undefined, toCardinality: undefined },
      { from: 'Circle', to: 'Base', type: 'inheritance', label: undefined, fromCardinality: undefined, toCardinality: undefined },
      { from: 'Canvas', to: 'Shape', type: 'aggregation', label: 'shapes', fromCardinality: '1', toCardinality: '0..*' },
      { from: 'Dog', to: 'Animal', type: 'inheritance' },
      { from: 'Dog', to: 'Pet', type: 'realization' },
    ]);
    const once = generateClass(model);
    expect(generateClass(parseClass(once, noWarn))).toBe(once);
  });
  it('parses state diagrams with composites', () => {
    const model = parseState(uml('[*] --> Idle\nIdle --> Running : start\nstate Running {\n  [*] --> Fast\n}\nRunning : busy\nstate "Long name" as L\nRunning -> [*]'), noWarn);
    expect(model.states.map((s) => s.id)).toEqual(['Idle', 'Running', 'L']);
    expect(model.states[1].descriptions).toEqual(['busy']);
    expect(model.states[1].states?.map((s) => s.id)).toEqual(['Fast']);
    expect(model.transitions).toHaveLength(3);
  });
  it('parses mind maps', () => {
    const model = parseMindmap('@startmindmap\n* Root\n** A\n*** A1\n** B\nleft side\n** C\n@endmindmap', noWarn);
    expect(model.root.text).toBe('Root');
    expect(model.root.children.map((c) => [c.text, c.side])).toEqual([['A', undefined], ['B', undefined], ['C', 'left']]);
    expect(model.root.children[0].children[0].text).toBe('A1');
  });
  it('reports lines it cannot convert', () => {
    const warnings: string[] = [];
    parseSequence(uml('A -> B\n??? what'), (_l, text) => warnings.push(text));
    expect(warnings).toEqual(['??? what']);
  });
});

describe('plugin', () => {
  it('registers the language and its mappers', async () => {
    const sapia = createSapia();
    expect((await sapia.plugins.activate(plantUmlPlugin)).status).toBe('active');
    expect(sapia.languages.get('plantuml')?.name).toBe('PlantUML');
    expect(sapia.conversion.getMapper('plantuml', 'sequence')).toBeDefined();
    sapia.i18n.setLocale('de');
    expect(sapia.i18n.t('plantuml.error.missingEnd', { tag: 'uml' })).toBe('@enduml fehlt.');
  });
});
