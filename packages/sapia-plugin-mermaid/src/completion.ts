import type { CompletionItem, CompletionRequest, CompletionResult } from '@sapia/core';
import { analyzeMermaid } from './analysis';
import type { MermaidEntity } from './analysis';
import { HEADER_SNIPPETS } from './templates';

type Translate = (key: string) => string;

interface TypeVocabulary {
  arrows: { arrow: string; key: string }[];
  keywords: string[];
  snippets: { label: string; key: string; snippet: string }[];
  /** Matches `entity arrow |` – group 1 is the partial target. */
  afterArrow: RegExp;
  /** Matches `entity |` – group 1 is the entity, group 2 the partial arrow. */
  afterEntity: RegExp;
  /** Statements followed by an entity reference; group 1 is the partial name. */
  entityStatement?: RegExp;
}

const ID = String.raw`[A-Za-z_]\w*(?:[-.]\w+)*`;

const VOCABULARY: Record<string, TypeVocabulary> = {
  flowchart: {
    arrows: [
      { arrow: '-->', key: 'arrow' },
      { arrow: '---', key: 'line' },
      { arrow: '-.->', key: 'dotted' },
      { arrow: '==>', key: 'thick' },
      { arrow: '--o', key: 'circleEnd' },
      { arrow: '--x', key: 'crossEnd' },
      { arrow: '<-->', key: 'bidirectional' },
      { arrow: '~~~', key: 'invisible' },
    ],
    keywords: ['subgraph', 'end', 'direction TB', 'direction LR', 'classDef', 'class', 'style', 'linkStyle', 'click'],
    snippets: [
      { label: 'subgraph', key: 'subgraph', snippet: 'subgraph ${1:id} [${2:Title}]\n  ${3}\nend' },
      { label: 'node [rectangle]', key: 'nodeRect', snippet: '${1:id}[${2:Text}]' },
      { label: 'node (rounded)', key: 'nodeRound', snippet: '${1:id}(${2:Text})' },
      { label: 'node {decision}', key: 'nodeDecision', snippet: '${1:id}{${2:Text}}' },
      { label: 'node ([stadium])', key: 'nodeStadium', snippet: '${1:id}([${2:Text}])' },
      { label: 'node [(database)]', key: 'nodeDatabase', snippet: '${1:id}[(${2:Text})]' },
      { label: 'node ((circle))', key: 'nodeCircle', snippet: '${1:id}((${2:Text}))' },
    ],
    afterArrow: new RegExp(String.raw`(?:--+|==+|-\.+-|~~~+)[>ox]?\s*(?:\|[^|]*\|\s*)?(${ID})?$`),
    afterEntity: new RegExp(String.raw`(?:^|\s|[\])}])(${ID})?(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?\s+([-=.~<ox]*)$`),
    entityStatement: new RegExp(String.raw`^\s*(?:class|style|click)\s+(?:${ID}\s*,\s*)*(${ID})?$`),
  },
  sequence: {
    arrows: [
      { arrow: '->>', key: 'sync' },
      { arrow: '-->>', key: 'reply' },
      { arrow: '-)', key: 'async' },
      { arrow: '--)', key: 'asyncReply' },
      { arrow: '-x', key: 'lost' },
      { arrow: '->', key: 'solidLine' },
      { arrow: '-->', key: 'dottedLine' },
      { arrow: '<<->>', key: 'bidirectional' },
    ],
    keywords: ['participant', 'actor', 'activate', 'deactivate', 'autonumber', 'else', 'and', 'option', 'end', 'Note over', 'Note right of', 'Note left of', 'create participant', 'destroy'],
    snippets: [
      { label: 'alt', key: 'alt', snippet: 'alt ${1:condition}\n  ${2}\nelse ${3:otherwise}\n  ${4}\nend' },
      { label: 'opt', key: 'opt', snippet: 'opt ${1:condition}\n  ${2}\nend' },
      { label: 'loop', key: 'loop', snippet: 'loop ${1:condition}\n  ${2}\nend' },
      { label: 'par', key: 'par', snippet: 'par ${1:label}\n  ${2}\nand ${3:label}\n  ${4}\nend' },
      { label: 'critical', key: 'critical', snippet: 'critical ${1:label}\n  ${2}\noption ${3:label}\n  ${4}\nend' },
      { label: 'break', key: 'break', snippet: 'break ${1:condition}\n  ${2}\nend' },
      { label: 'rect', key: 'rect', snippet: 'rect rgb(${1:200, 220, 255})\n  ${2}\nend' },
      { label: 'box', key: 'box', snippet: 'box ${1:Title}\n  participant ${2:A}\nend' },
    ],
    afterArrow: new RegExp(String.raw`^\s*[^:]+?(?:<<-{1,2}>>|-{1,2}>>|-{1,2}[x)]|-{1,2}>)\s*[+-]?(${ID})?$`),
    afterEntity: new RegExp(String.raw`^\s*(${ID})\s*([-<>x)]*)$`),
    entityStatement: new RegExp(String.raw`^\s*(?:activate|deactivate|destroy|[Nn]ote\s+(?:right of|left of|over)(?:\s+${ID}\s*,)?)\s+(${ID})?$`),
  },
  class: {
    arrows: [
      { arrow: '<|--', key: 'inheritance' },
      { arrow: '--|>', key: 'inheritanceRight' },
      { arrow: '<|..', key: 'realization' },
      { arrow: '..|>', key: 'realizationRight' },
      { arrow: '*--', key: 'composition' },
      { arrow: 'o--', key: 'aggregation' },
      { arrow: '-->', key: 'association' },
      { arrow: '..>', key: 'dependency' },
      { arrow: '--', key: 'link' },
      { arrow: '..', key: 'dashedLink' },
    ],
    keywords: ['class', 'namespace', 'direction TB', 'direction LR', 'note', 'note for'],
    snippets: [
      { label: 'class { }', key: 'classBody', snippet: 'class ${1:Name} {\n  ${2:+String field}\n  ${3:+method() void}\n}' },
      { label: 'interface', key: 'interfaceBody', snippet: 'class ${1:Name} {\n  <<interface>>\n  ${2:+method() void}\n}' },
      { label: 'enumeration', key: 'enumBody', snippet: 'class ${1:Name} {\n  <<enumeration>>\n  ${2:VALUE}\n}' },
    ],
    afterArrow: new RegExp(String.raw`^\s*${ID}(?:~[^~]+~)?\s*(?:"[^"]*"\s*)?(?:<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|-->|<--|\.\.>|<\.\.|--|\.\.)\s*(?:"[^"]*"\s*)?(${ID})?$`),
    afterEntity: new RegExp(String.raw`^\s*(${ID})\s+([-.<|*o>]*)$`),
    entityStatement: new RegExp(String.raw`^\s*note\s+for\s+(${ID})?$`),
  },
  state: {
    arrows: [{ arrow: '-->', key: 'transition' }],
    keywords: ['state', 'direction TB', 'direction LR', 'note right of', 'note left of', '[*]'],
    snippets: [
      { label: 'state { }', key: 'compositeState', snippet: 'state ${1:Name} {\n  [*] --> ${2:Inner}\n}' },
      { label: 'state "…" as', key: 'stateAlias', snippet: 'state "${1:Description}" as ${2:id}' },
      { label: 'choice', key: 'choice', snippet: 'state ${1:name} <<choice>>' },
      { label: 'fork', key: 'fork', snippet: 'state ${1:name} <<fork>>' },
    ],
    afterArrow: new RegExp(String.raw`^\s*(?:\[\*\]|${ID})\s*-->\s*(\[?\*?\]?|${ID})?$`),
    afterEntity: new RegExp(String.raw`^\s*(\[\*\]|${ID})\s+([->]*)$`),
    entityStatement: new RegExp(String.raw`^\s*note\s+(?:right|left)\s+of\s+(${ID})?$`),
  },
  er: {
    arrows: [
      { arrow: '||--o{', key: 'oneToMany' },
      { arrow: '||--||', key: 'oneToOne' },
      { arrow: '}o--o{', key: 'manyToMany' },
      { arrow: '||--|{', key: 'oneToOneOrMany' },
      { arrow: '|o--o{', key: 'zeroOrOneToMany' },
      { arrow: '}|..|{', key: 'nonIdentifying' },
    ],
    keywords: [],
    snippets: [{ label: 'entity { }', key: 'entityBody', snippet: '${1:ENTITY} {\n  ${2:int} ${3:id} PK\n  ${4:string} ${5:name}\n}' }],
    afterArrow: new RegExp(String.raw`^\s*${ID}\s*[|}][o|]?(?:--|\.\.)[o|]?[|{]\s*(${ID})?$`),
    afterEntity: new RegExp(String.raw`^\s*(${ID})\s+([|}o.{-]*)$`),
  },
};

const BODY_ITEMS: Record<string, CompletionItem[]> = {
  class: [
    { label: '+', kind: 'keyword', detail: 'public' },
    { label: '-', kind: 'keyword', detail: 'private' },
    { label: '#', kind: 'keyword', detail: 'protected' },
    { label: '~', kind: 'keyword', detail: 'package' },
    { label: '<<interface>>', kind: 'keyword' },
    { label: '<<abstract>>', kind: 'keyword' },
    { label: '<<enumeration>>', kind: 'keyword' },
    { label: '<<service>>', kind: 'keyword' },
    { label: 'field', kind: 'snippet', snippet: '${1:+}${2:Type} ${3:name}' },
    { label: 'method', kind: 'snippet', snippet: '${1:+}${2:name}(${3}) ${4:void}' },
  ],
  er: ['string', 'int', 'float', 'boolean', 'date', 'datetime', 'uuid', 'text'].map((label) => ({ label, kind: 'type' as const })),
};

function entityItems(entities: MermaidEntity[], t: Translate): CompletionItem[] {
  return entities.map((e) => ({
    label: e.id,
    kind: 'entity' as const,
    detail: e.keyword === 'implicit' ? t('mermaid.completion.implicit') : e.keyword,
    info: e.label,
    boost: 20,
  }));
}

export function completeMermaid(request: CompletionRequest, t: Translate): CompletionResult | null {
  const { source, offset } = request;
  const analysis = analyzeMermaid(source, request.diagramType);
  const { line, column } = analysis.index.positionAt(offset);
  const before = analysis.index.lines[line].slice(0, column);

  if (/%%/.test(before)) return null;
  if (((before.match(/"/g) ?? []).length & 1) === 1) return null;

  // No header yet: offer the diagram types.
  if (analysis.headerLine < 0 || line === analysis.headerLine) {
    const word = /[\w-]*$/.exec(before)![0];
    if (before.trim() !== word) {
      const dir = /^\s*(?:flowchart|graph)\s+(\w*)$/.exec(before);
      if (dir) return { from: offset - dir[1].length, items: ['TB', 'TD', 'BT', 'LR', 'RL'].map((label) => ({ label, kind: 'value' as const, detail: t(`mermaid.direction.${label}`) })) };
      return null;
    }
    if (!word && !request.explicit && source.trim()) return null;
    return {
      from: offset - word.length,
      items: HEADER_SNIPPETS.map((h) => ({ label: h.label, kind: 'snippet' as const, detail: t(`diagramType.${h.type}`), snippet: h.snippet })),
    };
  }

  const vocab = VOCABULARY[analysis.diagramType];
  if (!vocab) return null;

  const body = analysis.bodyOf[line];
  if (body) {
    const word = /[\w<]*$/.exec(before)![0];
    if (before.trim() !== word) return null;
    const items = BODY_ITEMS[analysis.diagramType];
    return items ? { from: offset - word.length, items } : null;
  }

  // Message / relation / transition labels are free text.
  if (analysis.diagramType !== 'flowchart' && /:/.test(before.replace(/"[^"]*"/g, '')) && !/^\s*[Nn]ote\b[^:]*$/.test(before)) return null;
  // Inside a flowchart node shape or edge label.
  if (analysis.diagramType === 'flowchart') {
    const open = (before.match(/[\[({]/g) ?? []).length - (before.match(/[\])}]/g) ?? []).length;
    if (open > 0 || ((before.match(/\|/g) ?? []).length & 1) === 1) return null;
  }

  const entities = analysis.entities.filter((e) => !(analysis.diagramType === 'class' && e.container));

  const stmt = vocab.entityStatement?.exec(before);
  if (stmt) return { from: offset - (stmt[1]?.length ?? 0), items: entityItems(entities, t) };

  const afterArrow = vocab.afterArrow.exec(before);
  if (afterArrow) {
    const items = entityItems(entities, t);
    if (analysis.diagramType === 'state') items.unshift({ label: '[*]', kind: 'entity', detail: t('mermaid.completion.startEnd'), boost: 10 });
    return { from: offset - (afterArrow[1]?.length ?? 0), items };
  }

  const afterEntity = vocab.afterEntity.exec(before);
  if (afterEntity && afterEntity[1] && /\s$/.test(before.slice(0, before.length - afterEntity[2].length))) {
    const known = afterEntity[1] === '[*]' || analysis.entities.some((e) => e.id === afterEntity[1]);
    const isKeyword = vocab.keywords.some((k) => k.split(' ')[0] === afterEntity[1]) || ['subgraph', 'participant', 'actor', 'class', 'state', 'note', 'Note'].includes(afterEntity[1]);
    if (isKeyword) return null;
    if (known || analysis.diagramType === 'flowchart') {
      return {
        from: offset - afterEntity[2].length,
        items: vocab.arrows.map((a, i) => ({
          label: a.arrow,
          kind: 'arrow' as const,
          detail: t(`mermaid.arrow.${a.key}`),
          insertText: analysis.diagramType === 'sequence' ? a.arrow : `${a.arrow} `,
          boost: 30 - i,
        })),
      };
    }
    return null;
  }

  // Start of a statement.
  const word = /[\w\[*-]*$/.exec(before)![0];
  if (before.trim() !== word) return null;
  if (!word && !request.explicit) return null;
  const items: CompletionItem[] = [
    ...entityItems(entities.filter((e) => !e.container), t).map((i) => ({ ...i, boost: 6 })),
    ...vocab.snippets.map((s) => ({ label: s.label, kind: 'snippet' as const, detail: t(`mermaid.snippet.${s.key}`), snippet: s.snippet, boost: 8 })),
    ...vocab.keywords.map((label) => ({ label, kind: 'keyword' as const, insertText: /^(end|else|and|option|autonumber|\[\*\])$|direction/.test(label) ? label : `${label} `, boost: 10 })),
  ];
  return { from: offset - word.length, items };
}
