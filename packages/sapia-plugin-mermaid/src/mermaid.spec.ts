import { describe, expect, it } from 'vitest';
import { createSapia } from '@sapia/core';
import type { CompletionResult } from '@sapia/core';
import { plantUmlPlugin } from '@sapia/plugin-plantuml';
import {
  completeMermaid,
  detectMermaid,
  generateClass,
  generateSequence,
  locateMermaid,
  mermaidPlugin,
  mermaidSymbols,
  mermaidTokenizer,
  parseClass,
  parseMindmap,
  parseSequence,
  parseState,
  toDiagnostic,
} from './index';

const t = (key: string) => key;
const noWarn = () => {
  throw new Error('unexpected warning');
};

function complete(text: string, explicit = true): CompletionResult | null {
  const offset = text.indexOf('§');
  const source = text.replace('§', '');
  return completeMermaid({ source, offset, diagramType: detectMermaid(source)?.diagramType ?? 'unknown', explicit }, t);
}
const labels = (r: CompletionResult | null) => r?.items.map((i) => i.label) ?? [];

describe('detection', () => {
  const cases: [string, string][] = [
    ['sequenceDiagram\n A->>B: hi', 'sequence'],
    ['classDiagram\n class A', 'class'],
    ['stateDiagram-v2\n [*] --> A', 'state'],
    ['flowchart LR\n A --> B', 'flowchart'],
    ['graph TD\n A --> B', 'flowchart'],
    ['erDiagram\n A ||--o{ B : has', 'er'],
    ['mindmap\n root', 'mindmap'],
    ['gantt\n title x', 'gantt'],
    ['pie title x\n "a": 1', 'pie'],
    ['gitGraph\n commit', 'gitgraph'],
    ['C4Context\n title x', 'c4'],
  ];
  for (const [source, type] of cases) {
    it(`detects ${type}`, () => expect(detectMermaid(source)).toMatchObject({ diagramType: type }));
  }
  it('skips front matter, directives and comments', () => {
    expect(detectMermaid('---\ntitle: x\n---\n%% note\n%%{init: {"theme":"dark"}}%%\nsequenceDiagram\n A->>B: x')?.diagramType).toBe('sequence');
  });
  it('does not claim PlantUML or prose', () => {
    expect(detectMermaid('@startuml\nA -> B\n@enduml')).toBeNull();
    expect(detectMermaid('Alice -> Bob : hi')).toBeNull();
    expect(detectMermaid('')).toBeNull();
  });
});

describe('symbols', () => {
  it('finds flowchart nodes but not label words', () => {
    const symbols = mermaidSymbols('flowchart LR\n  A[Start here] -- some text --> B{Choice}\n  B -->|yes please| C\n  subgraph grp [My Group]\n    D --> A\n  end\n  class A highlighted');
    expect(symbols.map((s) => [s.name, s.label])).toEqual([
      ['A', 'Start here'], ['B', 'Choice'], ['C', undefined], ['grp', 'My Group'], ['D', undefined],
    ]);
  });
  it('finds sequence participants', () => {
    const symbols = mermaidSymbols('sequenceDiagram\n  participant App as Web App\n  actor Bob\n  App->>Carol: hi');
    expect(symbols.map((s) => [s.name, s.label, s.detail])).toEqual([
      ['App', 'Web App', 'participant'], ['Bob', undefined, 'actor'], ['Carol', undefined, 'implicit'],
    ]);
  });
  it('finds classes, states and entities', () => {
    expect(mermaidSymbols('classDiagram\n  class A {\n    +x\n  }\n  A <|-- B').map((s) => s.name)).toEqual(['A', 'B']);
    expect(mermaidSymbols('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run: go').map((s) => s.name)).toEqual(['Idle', 'Run']);
    expect(mermaidSymbols('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ITEM {\n    int id\n  }').map((s) => s.name)).toEqual(['CUSTOMER', 'ORDER', 'ITEM']);
  });
});

describe('completion', () => {
  it('offers diagram types in an empty document', () => {
    expect(labels(complete('§'))).toContain('sequenceDiagram');
    expect(labels(complete('flow§'))).toContain('flowchart');
  });
  it('offers directions after flowchart', () => {
    expect(labels(complete('flowchart §'))).toEqual(['TB', 'TD', 'BT', 'LR', 'RL']);
  });
  it('offers nodes after a flowchart link, and only nodes', () => {
    const r = complete('flowchart LR\n  A[Start] --> B\n  B --> §');
    expect(labels(r)).toEqual(['A', 'B']);
    expect(r!.items.every((i) => i.kind === 'entity')).toBe(true);
  });
  it('offers nothing inside node text and edge labels', () => {
    expect(complete('flowchart LR\n  A[Start] --> B\n  C[some §')).toBeNull();
    expect(complete('flowchart LR\n  A[Start] --> B\n  A -->|la§|')).toBeNull();
  });
  it('offers participants after a sequence arrow and nothing in the message', () => {
    expect(labels(complete('sequenceDiagram\n  participant App\n  actor Bob\n  App->>§'))).toEqual(['App', 'Bob']);
    expect(complete('sequenceDiagram\n  participant App\n  App->>Bob: he§')).toBeNull();
  });
  it('offers arrows after a known participant', () => {
    const r = complete('sequenceDiagram\n  participant App\n  App §');
    expect(labels(r)).toContain('->>');
  });
  it('offers participants after activate / Note over', () => {
    expect(labels(complete('sequenceDiagram\n  participant App\n  activate §'))).toEqual(['App']);
    expect(labels(complete('sequenceDiagram\n  participant App\n  Note over §'))).toEqual(['App']);
  });
  it('offers statement keywords and snippets', () => {
    const r = complete('sequenceDiagram\n  participant App\n  §');
    expect(labels(r)).toEqual(expect.arrayContaining(['App', 'alt', 'participant', 'activate']));
    expect(complete('sequenceDiagram\n  participant App\n  §', false)).toBeNull();
  });
  it('offers class relations and state targets', () => {
    expect(labels(complete('classDiagram\n  class A\n  class B\n  A <|-- §'))).toEqual(['A', 'B']);
    expect(labels(complete('stateDiagram-v2\n  [*] --> Idle\n  Idle --> §'))).toEqual(['[*]', 'Idle']);
  });
  it('offers member helpers inside a class body', () => {
    expect(labels(complete('classDiagram\n  class A {\n    §\n  }'))).toContain('<<interface>>');
  });
});

describe('tokenizer', () => {
  const run = (lines: string[]) => {
    let state = mermaidTokenizer.startState();
    return lines.map((line) => {
      const r = mermaidTokenizer.tokenizeLine(line, state);
      state = r.state;
      return r.tokens.map((tk) => `${tk.type}:${line.slice(tk.from, tk.to)}`);
    });
  };
  it('highlights sequence diagrams', () => {
    const [header, decl, msg] = run(['sequenceDiagram', '  participant App as Web', '  App->>Bob: Hello']);
    expect(header).toEqual(['definitionKeyword:sequenceDiagram']);
    expect(decl).toEqual(['definitionKeyword:participant', 'definition:App', 'keyword:as', 'definition:Web']);
    expect(msg).toEqual(['name:App', 'arrow:->>', 'name:Bob', 'label:: Hello']);
  });
  it('highlights flowcharts', () => {
    const [, line] = run(['flowchart LR', '  A[Start] -->|yes| B %% note']);
    expect(line).toEqual(['name:A', 'bracket:[', 'label:Start', 'bracket:]', 'arrow:-->', 'label:|yes|', 'name:B', 'comment:%% note']);
  });
});

describe('diagnostics and locate', () => {
  it('maps jison errors to the right line, honouring front matter', () => {
    const source = '---\ntitle: x\n---\nsequenceDiagram\n  A->>B: hi\n  garbage here';
    const d = toDiagnostic({ message: 'Parse error on line 3:\n...garbage here\n-----^\nExpecting \'SOLID_ARROW\', got \'NEWLINE\'', hash: { loc: { first_line: 3 } } }, source, t);
    expect(source.slice(d.from, d.to)).toBe('garbage here');
    expect(d.message).toBe("Expecting 'SOLID_ARROW', got 'NEWLINE'");
  });
  it('falls back to the last line without location', () => {
    const source = 'pie\n  "a" : x';
    const d = toDiagnostic(new Error('Something odd'), source, t);
    expect(source.slice(d.from, d.to)).toBe('"a" : x');
  });
  it('locates nodes by svg id, name attribute and text', () => {
    const flow = 'flowchart LR\n  A[Start] --> B[End]';
    const el = (id: string | undefined, attributes: Record<string, string> = {}, text?: string) => ({ tag: 'g', id, classes: [], attributes, text });
    const r1 = locateMermaid({ source: flow, diagramType: 'flowchart', path: [el(undefined, {}, 'End'), el('mermaid-1-flowchart-B-3')] })!;
    expect(flow.slice(r1.from, r1.to)).toBe('B');
    const seq = 'sequenceDiagram\n  participant App as Web App\n  App->>Bob: hi';
    const r2 = locateMermaid({ source: seq, diagramType: 'sequence', path: [el(undefined, { name: 'Bob' })] })!;
    expect(seq.slice(r2.from, r2.to)).toBe('Bob');
    const r3 = locateMermaid({ source: seq, diagramType: 'sequence', path: [el(undefined, {}, 'Web App')] })!;
    expect(seq.slice(r3.from, r3.to)).toBe('App');
  });
});

describe('metamodel mappers', () => {
  it('parses sequence diagrams', () => {
    const model = parseSequence(
      'sequenceDiagram\n  autonumber\n  actor User\n  participant App as Web App\n  User->>+App: Sign in\n  App-->>-User: Welcome\n  par a\n    App-)User: push\n  and b\n    App-xUser: lost\n  end\n  Note over User,App: shared<br/>note',
      noWarn,
    );
    expect(model.autonumber).toBe(true);
    expect(model.participants).toEqual([{ id: 'User', type: 'actor' }, { id: 'App', type: 'participant', label: 'Web App' }]);
    expect(model.elements[0]).toMatchObject({ from: 'User', to: 'App', arrow: 'filled', line: 'solid', activate: true });
    expect(model.elements[1]).toMatchObject({ line: 'dotted', deactivate: true });
    const par = model.elements[2];
    expect(par.type === 'block' && par.branches.map((b) => b.elements[0])).toMatchObject([{ arrow: 'open' }, { arrow: 'cross' }]);
    expect(model.elements[3]).toMatchObject({ type: 'note', position: 'over', participants: ['User', 'App'], text: 'shared\nnote' });
  });
  it('parses class diagrams', () => {
    const model = parseClass(
      'classDiagram\n  class Shape {\n    <<interface>>\n    +area() double\n  }\n  class List~T~\n  class Circle {\n    -double radius\n    +unit() Circle$\n  }\n  Shape <|.. Circle\n  Canvas "1" o-- "0..*" Shape : shapes\n  Circle : +draw() void',
      noWarn,
    );
    expect(model.classes.map((c) => [c.id, c.kind])).toEqual([['Shape', 'interface'], ['List', 'class'], ['Circle', 'class'], ['Canvas', 'class']]);
    expect(model.classes[1].generic).toBe('T');
    expect(model.classes[2].members).toEqual([
      { text: 'double radius', isMethod: false, visibility: 'private' },
      { text: 'unit(): Circle', isMethod: true, visibility: 'public', static: true },
      { text: 'draw(): void', isMethod: true, visibility: 'public' },
    ]);
    expect(model.relations[0]).toMatchObject({ from: 'Circle', to: 'Shape', type: 'realization' });
    expect(model.relations[1]).toMatchObject({ from: 'Canvas', to: 'Shape', type: 'aggregation', fromCardinality: '1', toCardinality: '0..*', label: 'shapes' });
    const once = generateClass(model);
    expect(generateClass(parseClass(once, noWarn))).toBe(once);
  });
  it('parses state diagrams', () => {
    const model = parseState('stateDiagram-v2\n  direction LR\n  [*] --> Idle\n  state "Long name" as L\n  Idle --> L: go\n  state L {\n    [*] --> Inner\n  }\n  state c <<choice>>', noWarn);
    expect(model.direction).toBe('LR');
    expect(model.states.map((s) => [s.id, s.label, s.type])).toEqual([['Idle', undefined, undefined], ['L', 'Long name', undefined], ['c', undefined, 'choice']]);
    expect(model.states[1].states?.[0].id).toBe('Inner');
  });
  it('parses mind maps with shapes', () => {
    const model = parseMindmap('mindmap\n  root((Topic))\n    A\n      A1[Box]\n    B(Rounded)\n    ::icon(fa fa-book)', noWarn);
    expect(model.root).toMatchObject({ text: 'Topic', shape: 'circle' });
    expect(model.root.children.map((c) => [c.text, c.shape])).toEqual([['A', undefined], ['Rounded', 'rounded']]);
    expect(model.root.children[0].children[0]).toMatchObject({ text: 'Box', shape: 'box' });
  });
  it('round-trips sequence diagrams', () => {
    const source = 'sequenceDiagram\n  actor User\n  participant App as Web App\n  User->>App: Sign in\n  loop retry\n    App-->>User: Again\n  end\n';
    expect(generateSequence(parseSequence(source, noWarn))).toBe(source);
  });
});

describe('cross-language conversion', () => {
  async function setup() {
    const sapia = createSapia();
    await sapia.plugins.activate(plantUmlPlugin);
    await sapia.plugins.activate(mermaidPlugin);
    return sapia;
  }
  it('lists conversion targets per diagram type', async () => {
    const sapia = await setup();
    for (const type of ['sequence', 'class', 'state', 'mindmap']) {
      expect(sapia.conversion.targetsFor('plantuml', type)).toEqual(['mermaid']);
      expect(sapia.conversion.targetsFor('mermaid', type)).toEqual(['plantuml']);
    }
    expect(sapia.conversion.targetsFor('mermaid', 'flowchart')).toEqual([]);
  });
  it('converts a PlantUML sequence diagram to Mermaid', async () => {
    const sapia = await setup();
    const source = '@startuml\nactor User\nparticipant "Web App" as App\ndatabase "User DB" as DB\nUser -> App : Sign in\nactivate App\nApp -> DB : Find user\nDB --> App : Record\nalt valid\n  App --> User : Welcome\nelse invalid\n  App ->x User : Error\nend\ndeactivate App\nnote right of App : done\n@enduml';
    const result = sapia.conversion.convert({ source, from: 'plantuml', to: 'mermaid', diagramType: 'sequence' });
    expect(result.warnings).toEqual([]);
    expect(result.source).toBe(
      'sequenceDiagram\n  actor User\n  participant App as Web App\n  participant DB@{ "type": "database" } as User DB\n  User->>App: Sign in\n  activate App\n  App->>DB: Find user\n  DB-->>App: Record\n  alt valid\n    App-->>User: Welcome\n  else invalid\n    App-xUser: Error\n  end\n  deactivate App\n  Note right of App: done\n',
    );
    expect(sapia.languages.detect(result.source)).toMatchObject({ languageId: 'mermaid', diagramType: 'sequence' });
  });
  it('converts a Mermaid class diagram to PlantUML', async () => {
    const sapia = await setup();
    const source = 'classDiagram\n  class Shape {\n    <<interface>>\n    +area() double\n  }\n  class Circle {\n    -double radius\n    +scale(double f) Circle\n  }\n  Shape <|.. Circle\n';
    const result = sapia.conversion.convert({ source, from: 'mermaid', to: 'plantuml', diagramType: 'class' });
    expect(result.source).toBe('@startuml\ninterface Shape {\n  +area(): double\n}\nclass Circle {\n  -double radius\n  +scale(double f): Circle\n}\n\nShape <|.. Circle\n@enduml\n');
    expect(sapia.languages.detect(result.source)).toMatchObject({ languageId: 'plantuml', diagramType: 'class' });
  });
  it('survives a full round trip without losing structure', async () => {
    const sapia = await setup();
    const samples: [string, string][] = [
      ['state', '@startuml\n[*] --> Draft\nDraft --> Review : submit\nstate Review {\n  [*] --> Waiting\n}\nReview --> [*]\n@enduml\n'],
      ['mindmap', '@startmindmap\n* Launch\n** Marketing\n*** Newsletter\n** Engineering\n@endmindmap\n'],
    ];
    for (const [diagramType, source] of samples) {
      const there = sapia.conversion.convert({ source, from: 'plantuml', to: 'mermaid', diagramType });
      const back = sapia.conversion.convert({ source: there.source, from: 'mermaid', to: 'plantuml', diagramType });
      expect(there.warnings.concat(back.warnings)).toEqual([]);
      // Shapes have no PlantUML equivalent and the order of state declarations is not significant.
      const strip = (m: unknown) =>
        JSON.parse(JSON.stringify(m, (k, v) => (k === 'shape' ? undefined : k === 'states' && Array.isArray(v) ? [...v].sort((a, b) => a.id.localeCompare(b.id)) : v)));
      expect(strip(back.model)).toEqual(strip(there.model));
    }
  });
});
