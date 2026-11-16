import { createRuleTokenizer } from '@sapia/core';
import type { TokenRule } from '@sapia/core';

export const DECLARATION_KEYWORDS = [
  'participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue',
  'class', 'interface', 'enum', 'abstract', 'annotation', 'struct', 'exception', 'protocol',
  'component', 'node', 'cloud', 'package', 'rectangle', 'frame', 'folder', 'artifact', 'storage',
  'usecase', 'state', 'object', 'map', 'agent', 'card', 'file', 'stack', 'person', 'hexagon',
  'circle', 'label', 'namespace', 'together', 'partition', 'robust', 'concise', 'clock', 'binary', 'json',
];

export const CONTROL_KEYWORDS = [
  'alt', 'else', 'opt', 'loop', 'par', 'break', 'critical', 'group', 'end', 'ref',
  'if', 'then', 'elseif', 'endif', 'while', 'endwhile', 'repeat', 'backward', 'fork', 'again',
  'split', 'switch', 'case', 'endswitch', 'start', 'stop', 'detach', 'kill', 'return',
  'activate', 'deactivate', 'destroy', 'create', 'autonumber', 'newpage', 'is', 'not',
];

export const OTHER_KEYWORDS = [
  'as', 'of', 'on', 'over', 'left', 'right', 'top', 'bottom', 'up', 'down', 'to', 'direction',
  'note', 'title', 'header', 'footer', 'caption', 'legend', 'endlegend', 'skinparam', 'hide', 'show',
  'remove', 'scale', 'extends', 'implements', 'order', 'link', 'across', 'side', 'footbox', 'members',
  'stereotype', 'empty', 'fields', 'methods', 'attributes', 'circle', 'box', 'allowmixing', 'mainframe',
  'lasts', 'starts', 'ends', 'requires', 'happens', 'at', 'days', 'day', 'weeks', 'week', 'and', 'with',
];

const words = (list: string[]) => new RegExp(String.raw`(?:${list.join('|')})\b`, 'i');

const common: TokenRule[] = [
  { match: /\/'/, token: 'comment', next: 'blockComment' },
  { match: /'.*/, token: 'comment', lineStart: true },
  { match: /@(?:start|end)\w+/, token: 'meta', lineStart: true },
  { match: /!\w+/, token: 'meta', lineStart: true },
  { match: /"(?:[^"\\]|\\.)*"?/, token: 'string' },
  { match: /<<[^>]*>>/, token: 'tag' },
  { match: /#(?:[0-9a-fA-F]{6,8}|[0-9a-fA-F]{3}|[A-Za-z]+)\b/, token: 'color' },
];

export const plantUmlTokenizer = createRuleTokenizer({
  transient: ['afterArrow', 'afterKeyword'],
  onLineStart(line, state) {
    if (/^\s*@start(mindmap|wbs)\b/i.test(line)) return 'tree';
    if (/^\s*@startuml\b/i.test(line) && state === 'tree') return 'root';
    return undefined;
  },
  states: {
    root: [
      ...common,
      { match: /==.*==\s*$/, token: 'heading', lineStart: true },
      { match: /:[^:]*[;|<>/\]}]\s*$/, token: 'string', lineStart: true },
      { match: /\[\*\]/, token: 'definitionKeyword' },
      { match: /\[[^\]\n]+\]/, token: 'definition' },
      { match: /\((?!\*\))[^()\n]+\)/, token: 'definition' },
      {
        match: /(?:<\|?|[ox*#+^])?[-.=~]+(?:\[[^\]]*\])?(?:(?:up|down|left|right|[udlr])[-.=~]+)?(?:\|?>{1,2}|[ox*#+^\\/])?/,
        token: 'arrow',
        next: 'afterArrow',
      },
      { match: /<\|?|\|>/, token: 'arrow' },
      { match: words(DECLARATION_KEYWORDS), token: 'definitionKeyword', lineStart: true, next: 'afterKeyword' },
      { match: /note\b/i, token: 'keyword', lineStart: true, next: 'afterArrow' },
      { match: words(CONTROL_KEYWORDS), token: 'controlKeyword', lineStart: true },
      { match: words(OTHER_KEYWORDS), token: 'keyword', lineStart: true },
      { match: /(?:as|of|over|extends|implements|order|on|link)\b/, token: 'keyword' },
      { match: /\{(?:static|abstract|field|method|classifier)\}/, token: 'meta' },
      { match: /[+\-#~](?=\s*\w)/, token: 'operator', lineStart: true },
      { match: /\d+(?:\.\d+)?\b/, token: 'number' },
      { match: /[\w.@]+/, token: 'name' },
      { match: /[{}()[\]]/, token: 'bracket' },
      { match: /[:,;]/, token: 'punctuation' },
    ],
    afterKeyword: [
      ...common,
      { match: /as\b/, token: 'keyword' },
      { match: /(?:extends|implements|order)\b/, token: 'keyword' },
      { match: /\[[^\]\n]+\]/, token: 'definition' },
      { match: /[\w.@]+/, token: 'definition' },
      { match: /[{}()[\]]/, token: 'bracket' },
      { match: /:\s?.*$/, token: 'label' },
    ],
    afterArrow: [
      ...common,
      { match: /:\s?.*$/, token: 'label' },
      { match: /\[\*\]/, token: 'definitionKeyword' },
      { match: /\[[^\]\n]+\]/, token: 'definition' },
      { match: /\([^()\n]+\)/, token: 'definition' },
      { match: /(?:left|right|top|bottom|of|over|on|link|as)\b/, token: 'keyword' },
      { match: /\+\+|--|\*\*|!!/, token: 'operator' },
      { match: /[\w.@]+/, token: 'name' },
      { match: /[{}()[\]]/, token: 'bracket' },
      { match: /,/, token: 'punctuation' },
    ],
    tree: [
      ...common,
      { match: /([*+-]+_?)(\[#\w+\])?(\s.*)$/, token: ['operator', 'color', 'heading'], lineStart: true },
      { match: /(?:left|right)\s+side\b/, token: 'keyword', lineStart: true },
      { match: /(?:title|header|footer|caption|skinparam)\b/, token: 'keyword', lineStart: true },
    ],
    blockComment: [
      { match: /.*?'\//, token: 'comment', next: '@pop' },
      { match: /.+/, token: 'comment' },
    ],
  },
});
