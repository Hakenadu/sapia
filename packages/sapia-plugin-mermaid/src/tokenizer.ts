import { createRuleTokenizer } from '@sapia/core';
import type { TokenRule } from '@sapia/core';
import { HEADERS } from './detect';

const header = new RegExp(HEADERS.map(([re]) => re.source.replace(/^\^/, '')).join('|'));

const common: TokenRule[] = [
  { match: /%%\{.*?\}%%/, token: 'meta' },
  { match: /%%.*/, token: 'comment' },
  { match: /---\s*$/, token: 'meta', lineStart: true },
  { match: /"(?:[^"\\]|\\.)*"?/, token: 'string' },
  { match: /`[^`]*`?/, token: 'string' },
];

const names: TokenRule[] = [
  { match: /\d+(?:\.\d+)?\b/, token: 'number' },
  { match: /[A-Za-z_]\w*(?:-\w+)*/, token: 'name' },
  { match: /[{}()[\]]/, token: 'bracket' },
  { match: /[:,;&|]/, token: 'punctuation' },
];

const kw = (list: string, token: 'keyword' | 'controlKeyword' | 'definitionKeyword' = 'keyword', next?: string): TokenRule => ({
  match: new RegExp(String.raw`(?:${list})\b`),
  token,
  lineStart: true,
  next,
});

const TYPE_STATE: Record<string, string> = {
  sequence: 'sequence',
  class: 'class',
  state: 'state',
  er: 'er',
  flowchart: 'flowchart',
  mindmap: 'tree',
  timeline: 'tree',
  kanban: 'tree',
};

export const mermaidTokenizer = createRuleTokenizer({
  transient: ['label', 'afterKeyword'],
  onLineStart(line) {
    const trimmed = line.trim();
    for (const [re, type] of HEADERS) {
      if (re.test(trimmed)) return TYPE_STATE[type] ?? 'generic';
    }
    return undefined;
  },
  states: {
    root: [...common, { match: header, token: 'definitionKeyword', lineStart: true }, { match: /[\w-]+(?=\s*:)/, token: 'keyword', lineStart: true }, { match: /:.*$/, token: 'string' }, ...names],
    flowchart: [
      ...common,
      { match: header, token: 'definitionKeyword', lineStart: true },
      { match: /(?:TB|TD|BT|RL|LR)\b/, token: 'keyword' },
      kw('subgraph', 'definitionKeyword', 'afterKeyword'),
      kw('end', 'controlKeyword'),
      kw('direction|classDef|class|style|linkStyle|click|accTitle|accDescr'),
      { match: /\|[^|\n]*\|/, token: 'label' },
      { match: /:::[\w-]+/, token: 'tag' },
      { match: /[<ox]?(?:--+|==+|-\.+-?|~~~+)(?:[>ox]|(?=\s|\||[A-Za-z_"]))/, token: 'arrow' },
      { match: /\.->|\.-|-->|---/, token: 'arrow' },
      { match: /(\[\[|\[\(|\(\(\(|\(\(|\(\[|\{\{|\[\/|\[\\|\[|\(|\{|>)([^\[\](){}"\n]+)(\]\]|\)\]|\)\)\)|\)\)|\]\)|\}\}|\/\]|\\\]|\]|\)|\})/, token: ['bracket', 'label', 'bracket'] },
      { match: /@\{/, token: 'bracket' },
      { match: /#[0-9a-fA-F]{3,8}\b/, token: 'color' },
      ...names,
    ],
    sequence: [
      ...common,
      { match: header, token: 'definitionKeyword', lineStart: true },
      kw('participant|actor|create participant|create actor|destroy', 'definitionKeyword', 'afterKeyword'),
      kw('alt|else|opt|loop|par|and|critical|option|break|end|rect|box', 'controlKeyword'),
      kw('activate|deactivate|autonumber|title|links?|properties|accTitle|accDescr'),
      { match: /(Note|note)(\s+)(right of|left of|over)\b/, token: ['keyword', null, 'keyword'], lineStart: true },
      { match: /<<-{1,2}>>|-{1,2}>>|-{1,2}[x)]|-{1,2}>/, token: 'arrow' },
      { match: /[+-](?=[A-Za-z_"])/, token: 'operator' },
      { match: /:.*$/, token: 'label' },
      { match: /[A-Za-z_]\w*/, token: 'name' },
      ...names,
    ],
    class: [
      ...common,
      { match: header, token: 'definitionKeyword', lineStart: true },
      kw('class|namespace', 'definitionKeyword', 'afterKeyword'),
      kw('direction|note for|note|link|click|callback|style|classDef|cssClass|accTitle|accDescr'),
      { match: /<<[^>]*>>/, token: 'tag' },
      { match: /<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|-->|<--|\.\.>|<\.\.|--|\.\./, token: 'arrow', next: 'label' },
      { match: /[+\-#~](?=\s*[\w~])/, token: 'operator', lineStart: true },
      { match: /~[^~\n]+~/, token: 'type' },
      ...names,
    ],
    state: [
      ...common,
      { match: header, token: 'definitionKeyword', lineStart: true },
      kw('state', 'definitionKeyword', 'afterKeyword'),
      kw('direction|note right of|note left of|note|end note|classDef|class|accTitle|accDescr'),
      { match: /\[\*\]/, token: 'definitionKeyword' },
      { match: /<<[^>]*>>/, token: 'tag' },
      { match: /-->/, token: 'arrow', next: 'label' },
      { match: /--\s*$/, token: 'operator' },
      { match: /:.*$/, token: 'label' },
      ...names,
    ],
    er: [
      ...common,
      { match: header, token: 'definitionKeyword', lineStart: true },
      { match: /[|}][o|]?(?:--|\.\.)[o|]?[|{]/, token: 'arrow', next: 'label' },
      { match: /(?:PK|FK|UK)\b/, token: 'keyword' },
      { match: /[A-Z][\w-]*(?=\s*\{)/, token: 'definition' },
      { match: /:.*$/, token: 'label' },
      ...names,
    ],
    tree: [
      ...common,
      { match: header, token: 'definitionKeyword', lineStart: true },
      kw('title|section'),
      { match: /::icon\([^)]*\)/, token: 'meta' },
      { match: /:::[\w -]+/, token: 'tag' },
      { match: /(\(\(|\)\)|\{\{|\[|\(|\))([^\[\](){}\n]+)(\)\)|\(\(|\}\}|\]|\)|\()/, token: ['bracket', 'heading', 'bracket'] },
      { match: /[^\s\[\](){}:][^\[\](){}:]*/, token: 'heading' },
    ],
    generic: [
      ...common,
      { match: header, token: 'definitionKeyword', lineStart: true },
      kw('title|section|dateFormat|axisFormat|excludes|todayMarker|tickInterval|commit|branch|checkout|switch|merge|cherry-pick|x-axis|y-axis|quadrant-[1-4]|line|bar|showData|columns|group|service|junction|accTitle|accDescr'),
      { match: /:.*$/, token: 'label' },
      { match: /-->|--|->/, token: 'arrow' },
      ...names,
    ],
    afterKeyword: [
      ...common,
      { match: /as\b/, token: 'keyword' },
      { match: /<<[^>]*>>/, token: 'tag' },
      { match: /~[^~\n]+~/, token: 'type' },
      { match: /[A-Za-z_][\w-]*/, token: 'definition' },
      { match: /[{}()[\]]/, token: 'bracket' },
      { match: /:.*$/, token: 'label' },
    ],
    label: [
      ...common,
      { match: /:.*$/, token: 'label' },
      { match: /[A-Za-z_]\w*(?:-\w+)*/, token: 'name' },
      { match: /[{}()[\]]/, token: 'bracket' },
    ],
  },
});
