import { LineIndex } from '@sapia/core';
import type { DocumentSymbol, TextRange } from '@sapia/core';

export interface PlantUmlEntity {
  /** Identifier (alias when declared with `as`). */
  id: string;
  /** Text to type when referencing the entity, e.g. `web`, `[Web App]` or `"My Class"`. */
  ref: string;
  label?: string;
  /** Declaration keyword or `implicit`. */
  keyword: string;
  line: number;
  range: TextRange;
  selectionRange: TextRange;
  container: boolean;
}

export interface PlantUmlAnalysis {
  index: LineIndex;
  entities: PlantUmlEntity[];
  /** Mind map / WBS node texts. */
  texts: { text: string; line: number; range: TextRange }[];
  /** For each line: true when inside a comment, a multi-line note or a similar free-text region. */
  freeText: boolean[];
  /** For each line: name of the enclosing `class X {` style body, if any. */
  bodyOf: (string | null)[];
}

const DECL = [
  'participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue',
  'abstract class', 'class', 'interface', 'enum', 'abstract', 'annotation', 'struct', 'exception', 'protocol',
  'component', 'node', 'cloud', 'package', 'rectangle', 'frame', 'folder', 'artifact', 'storage',
  'usecase', 'state', 'object', 'map', 'agent', 'card', 'file', 'stack', 'person', 'hexagon', 'circle',
  'label', 'namespace', 'partition', 'robust', 'concise', 'clock', 'binary',
];
const CONTAINERS = new Set(['package', 'rectangle', 'frame', 'folder', 'namespace', 'node', 'cloud', 'partition']);
const BODY_KEYWORDS = new Set(['class', 'abstract class', 'abstract', 'interface', 'enum', 'annotation', 'struct', 'entity', 'object', 'map', 'exception', 'protocol']);

const NAME = String.raw`"[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:]+:|[\w.@]+`;
const DECL_RE = new RegExp(
  String.raw`^(\s*)(${DECL.join('|')})\s+(${NAME})(?:\s+as\s+(${NAME}))?`,
  'i',
);
const BRACKET_DECL_RE = new RegExp(String.raw`^(\s*)(\[[^\]]+\]|\([^)*][^)]*\)|:[^:]+:|\(\)\s*(?:"[^"]+"|[\w.]+))(?:\s+as\s+([\w.]+))?`);
const ENTITY_TOKEN = String.raw`"[^"]+"|\[\*\]|\[[^\]]+\]|\([^)*][^)]*\)|:[^:]+:|[\w.@]+`;
const ARROW = String.raw`(?:<\|?|[ox*#+^}|]{1,2})?[-.=~]+(?:\[[^\]]*\])?(?:(?:up|down|left|right|[udlr])[-.=~]+)?(?:\|?>{1,2}|[ox*#+^\\/{|]{1,2})?`;
export const RELATION_RE = new RegExp(
  String.raw`^\s*(${ENTITY_TOKEN})\s*(?:"[^"]*"\s*)?(${ARROW})\s*(?:"[^"]*"\s*)?(${ENTITY_TOKEN})`,
);

const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1');
const isQuoted = (s: string) => /^".*"$/.test(s);
const isWrapped = (s: string) => /^(\[.*\]|\(.*\)|:.*:)$/.test(s);
const unwrap = (s: string) => (isWrapped(s) ? s.slice(1, -1).trim() : unquote(s));

const KEYWORDS_NOT_ENTITIES = new Set([
  'note', 'end', 'else', 'alt', 'opt', 'loop', 'par', 'group', 'break', 'critical', 'title', 'skinparam',
  'hide', 'show', 'activate', 'deactivate', 'destroy', 'return', 'autonumber', 'legend', 'header', 'footer',
  'left', 'right', 'top', 'bottom', 'if', 'while', 'start', 'stop', 'ref', 'create', 'scale', 'caption',
]);

/** Extracts the entities a PlantUML document declares or implicitly introduces. */
export function analyzePlantUml(source: string): PlantUmlAnalysis {
  const index = new LineIndex(source);
  const entities: PlantUmlEntity[] = [];
  const texts: PlantUmlAnalysis['texts'] = [];
  const byRef = new Map<string, PlantUmlEntity>();
  const freeText: boolean[] = [];
  const bodyOf: (string | null)[] = [];

  let blockComment = false;
  let multiNote = false;
  let tree = false;
  let body: { name: string; depth: number } | null = null;
  let depth = 0;

  const add = (e: Omit<PlantUmlEntity, 'range'>, line: number) => {
    const key = e.ref.toLowerCase();
    const existing = byRef.get(key) ?? byRef.get(e.id.toLowerCase());
    if (existing) {
      // An explicit declaration after implicit use upgrades the entry.
      if (existing.keyword === 'implicit' && e.keyword !== 'implicit') Object.assign(existing, e, { range: index.lineRange(line, true) });
      return;
    }
    const entity: PlantUmlEntity = { ...e, range: index.lineRange(line, true) };
    entities.push(entity);
    byRef.set(key, entity);
    byRef.set(e.id.toLowerCase(), entity);
  };

  const sel = (line: number, text: string, token: string, fromCol = 0): TextRange => {
    const col = text.indexOf(token, fromCol);
    const start = index.lineStart(line) + Math.max(0, col);
    return { from: start, to: start + token.length };
  };

  index.lines.forEach((text, line) => {
    const trimmed = text.trim();
    bodyOf[line] = body?.name ?? null;
    freeText[line] = blockComment || multiNote;

    if (blockComment) {
      if (trimmed.includes("'/")) blockComment = false;
      return;
    }
    if (trimmed.startsWith("/'")) {
      freeText[line] = true;
      blockComment = !trimmed.includes("'/");
      return;
    }
    if (trimmed.startsWith("'")) {
      freeText[line] = true;
      return;
    }
    if (multiNote) {
      if (/^end\s*(note|legend|title|header|footer|ref)\b|^endlegend\b/i.test(trimmed)) {
        multiNote = false;
        freeText[line] = false;
      }
      return;
    }
    if (/^@start(mindmap|wbs)\b/i.test(trimmed)) tree = true;
    else if (/^@start\w+/i.test(trimmed)) tree = false;
    if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('!')) return;

    if (tree) {
      const m = /^([*+-]+_?)(?:\[#\w+\])?\s+(.*)$/.exec(trimmed);
      if (m) {
        const start = index.lineStart(line) + text.indexOf(m[2]);
        texts.push({ text: m[2].trim(), line, range: { from: start, to: start + m[2].trimEnd().length } });
      }
      return;
    }

    if (/^(note|legend|title|header|footer|ref)\b/i.test(trimmed) && !/:/.test(trimmed.replace(/"[^"]*"/g, '')) && !/^(title|header|footer)\s+\S/i.test(trimmed)) {
      if (!/^note\s+"[^"]*"\s+as\s+\w+/i.test(trimmed)) multiNote = true;
    }

    if (body) {
      for (const ch of trimmed) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth < body.depth) body = null;
      return;
    }

    const decl = DECL_RE.exec(text);
    if (decl) {
      const keyword = decl[2].toLowerCase();
      const first = decl[3];
      const second = decl[4];
      let id: string;
      let label: string | undefined;
      let ref: string;
      if (second) {
        // `X as "Label"` or `"Label" as X`: the unquoted, unwrapped side is the id.
        const firstIsLabel = isQuoted(first) || isWrapped(first) || !(isQuoted(second) || isWrapped(second));
        const idToken = firstIsLabel ? second : first;
        const labelToken = firstIsLabel ? first : second;
        id = unwrap(idToken);
        label = unwrap(labelToken);
        ref = idToken;
      } else {
        id = unwrap(first);
        ref = first;
        if (/^(component)$/.test(keyword) && !isWrapped(first) && !isQuoted(first)) ref = first;
      }
      const selToken = second ?? first;
      add(
        {
          id,
          ref,
          label: label && label !== id ? label : undefined,
          keyword,
          line,
          selectionRange: sel(line, text, selToken, second ? text.indexOf(first) + first.length : 0),
          container: CONTAINERS.has(keyword) || /\{\s*$/.test(trimmed) && !BODY_KEYWORDS.has(keyword),
        },
        line,
      );
      const opens = (trimmed.match(/\{/g) ?? []).length;
      const closes = (trimmed.match(/\}/g) ?? []).length;
      if (BODY_KEYWORDS.has(keyword) && opens > closes) {
        depth += opens - closes;
        body = { name: id, depth };
      } else {
        depth += opens - closes;
      }
      return;
    }

    depth += (trimmed.match(/\{/g) ?? []).length - (trimmed.match(/\}/g) ?? []).length;

    const rel = RELATION_RE.exec(text);
    if (rel && /[-.=~]/.test(rel[2])) {
      let col = 0;
      for (const token of [rel[1], rel[3]]) {
        const at = text.indexOf(token, col);
        col = at + token.length;
        if (token === '[*]' || token === '(*)' || /^\[|\]$/.test(token) && token.length < 3) continue;
        const id = unwrap(token);
        if (!isWrapped(token) && !isQuoted(token) && KEYWORDS_NOT_ENTITIES.has(id.toLowerCase())) continue;
        const start = index.lineStart(line) + at;
        add(
          { id, ref: token, keyword: 'implicit', line, selectionRange: { from: start, to: start + token.length }, container: false },
          line,
        );
      }
      return;
    }

    const bracket = BRACKET_DECL_RE.exec(text);
    if (bracket) {
      const token = bracket[2];
      const alias = bracket[3];
      const labelText = token.startsWith('()') ? unquote(token.slice(2).trim()) : unwrap(token);
      add(
        {
          id: alias ?? labelText,
          ref: alias ?? (token.startsWith('()') ? labelText : token),
          label: alias ? labelText : undefined,
          keyword: token.startsWith('[') ? 'component' : token.startsWith(':') ? 'actor' : token.startsWith('()') ? 'interface' : 'usecase',
          line,
          selectionRange: sel(line, text, alias ?? token, alias ? text.indexOf(token) + token.length : 0),
          container: false,
        },
        line,
      );
    }
  });

  return { index, entities, texts, freeText, bodyOf };
}

export function plantUmlSymbols(source: string): DocumentSymbol[] {
  const analysis = analyzePlantUml(source);
  return [
    ...analysis.entities.map<DocumentSymbol>((e) => ({
      name: e.id,
      label: e.label,
      kind: e.container ? 'container' : 'entity',
      detail: e.keyword,
      range: e.range,
      selectionRange: e.selectionRange,
    })),
    ...analysis.texts.map<DocumentSymbol>((t) => ({ name: t.text, kind: 'text', range: t.range, selectionRange: t.range })),
  ];
}
