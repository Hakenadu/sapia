import { LineIndex } from '@sapia/core';
import type { DocumentSymbol, TextRange } from '@sapia/core';
import { readPreamble } from './detect';

/** Identifier of classes, states and entities: words joined by single dashes or dots. */
export const ID = String.raw`\w+(?:[-.]\w+)*`;

export interface MermaidEntity {
  id: string;
  label?: string;
  /** `node`, `participant`, `actor`, `class`, `state`, `entity`, `subgraph`, … */
  keyword: string;
  line: number;
  range: TextRange;
  selectionRange: TextRange;
  container: boolean;
}

export interface MermaidAnalysis {
  index: LineIndex;
  diagramType: string;
  headerLine: number;
  entities: MermaidEntity[];
  texts: { text: string; line: number; range: TextRange }[];
  /** Per line: name of the enclosing class/entity body, if any. */
  bodyOf: (string | null)[];
}

const FLOW_STATEMENT = /^(subgraph|end|direction|classDef|class|style|linkStyle|click|accTitle|accDescr|flowchart|graph)\b/;
const SHAPE = String.raw`\[\[[^\]]*\]\]|\[\([^)]*\)\]|\(\(\([^)]*\)\)\)|\(\([^)]*\)\)|\(\[[^\]]*\]\)|\{\{[^}]*\}\}|\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|>[^\]]*\]`;
const FLOW_NODE = new RegExp(String.raw`([A-Za-z_À-￿][\wÀ-￿]*(?:-[\wÀ-￿]+)*)(\s*(?:${SHAPE})|@\{[^}]*\})?`, 'g');
const INLINE_LABEL = /(--|==|-\.)\s+[^-=>.|\n][^|\n]*?\s+(--+>?|==+>?|\.-+>?)/g;
export const FLOW_LINK = /[<ox]?(?:--+|==+|-\.+-|~~~+)[>ox]?/;

const stripShape = (shape: string): string =>
  shape
    .trim()
    .replace(/^(\[\[|\[\(|\(\(\(|\(\(|\(\[|\{\{|\[\/|\[\\|\[|\(|\{|>)/, '')
    .replace(/(\]\]|\)\]|\)\)\)|\)\)|\]\)|\}\}|\/\]|\\\]|\]|\)|\})$/, '')
    .replace(/^"(.*)"$/, '$1')
    .replace(/^`(.*)`$/, '$1')
    .trim();

export function analyzeMermaid(source: string, diagramTypeHint?: string): MermaidAnalysis {
  const index = new LineIndex(source);
  const preamble = readPreamble(source);
  const diagramType = diagramTypeHint && diagramTypeHint !== 'unknown' ? diagramTypeHint : preamble.diagramType;
  const entities: MermaidEntity[] = [];
  const texts: MermaidAnalysis['texts'] = [];
  const bodyOf: (string | null)[] = index.lines.map(() => null);
  const byId = new Map<string, MermaidEntity>();

  const add = (id: string, keyword: string, line: number, col: number, label?: string, container = false, length = id.length) => {
    const existing = byId.get(id);
    if (existing) {
      if (label && !existing.label) existing.label = label;
      if (existing.keyword === 'implicit' && keyword !== 'implicit') existing.keyword = keyword;
      return;
    }
    const start = index.lineStart(line) + Math.max(0, col);
    const entity: MermaidEntity = {
      id,
      label: label && label !== id ? label : undefined,
      keyword,
      line,
      range: index.lineRange(line, true),
      selectionRange: { from: start, to: start + length },
      container,
    };
    byId.set(id, entity);
    entities.push(entity);
  };

  let body: string | null = null;
  index.lines.forEach((raw, line) => {
    if (line <= preamble.headerLine) return;
    const text = raw.replace(/%%.*$/, '');
    const trimmed = text.trim();
    if (body) {
      bodyOf[line] = body;
      if (trimmed.startsWith('}')) body = null;
      return;
    }
    if (!trimmed) return;
    let m: RegExpExecArray | null;

    switch (diagramType) {
      case 'flowchart': {
        if ((m = /^(\s*)subgraph\s+([^\s\[]+)(?:\s*\[(.*)\])?/.exec(text))) {
          add(m[2], 'subgraph', line, text.indexOf(m[2], m[1].length + 8), m[3]?.replace(/^"(.*)"$/, '$1'), true);
          return;
        }
        if (FLOW_STATEMENT.test(trimmed)) return;
        // Remove edge labels so their words are not mistaken for nodes.
        const cleaned = text
          .replace(/"[^"]*"/g, (s) => '"' + '_'.repeat(Math.max(0, s.length - 2)) + '"')
          .replace(/\|[^|]*\|/g, (s) => ' '.repeat(s.length))
          .replace(INLINE_LABEL, (s, a: string, b: string) => a + ' '.repeat(s.length - a.length - b.length) + b);
        FLOW_NODE.lastIndex = 0;
        while ((m = FLOW_NODE.exec(cleaned))) {
          const id = m[1];
          const prev = cleaned.slice(0, m.index).trimEnd().slice(-1);
          // Words inside a shape of the previous node or after `:::` are not ids.
          if (prev === ':' || /^[ox]$/.test(id) && /[-=.]$/.test(cleaned.slice(0, m.index))) continue;
          const shape = m[2] ? text.slice(m.index + m[1].length, m.index + m[0].length) : undefined;
          add(id, shape ? 'node' : 'implicit', line, m.index, shape && !shape.trim().startsWith('@{') ? stripShape(shape) : undefined);
        }
        return;
      }
      case 'sequence': {
        if ((m = /^(\s*)(?:create\s+)?(participant|actor)\s+([^\s@]+)(?:@\{[^}]*\})?(?:\s+as\s+(.+))?$/.exec(text.trimEnd()))) {
          add(m[3], m[2], line, text.indexOf(m[3], m[1].length + m[2].length), m[4]?.trim());
          return;
        }
        if ((m = /^(\s*)([^\s:<>-][^:<>-]*?)\s*(<<-{1,2}>>|-{1,2}>>|-{1,2}[x)]|-{1,2}>)\s*[+-]?\s*([^:>\s][^:]*?)\s*(?::|$)/.exec(text))) {
          add(m[2].trim(), 'implicit', line, text.indexOf(m[2]));
          add(m[4].trim(), 'implicit', line, text.indexOf(m[4], text.indexOf(m[3]) + m[3].length));
        }
        return;
      }
      case 'class': {
        if ((m = /^(\s*)class\s+([\w-]+)(?:~[^~]+~)?(?:\s*\["([^"]*)"\])?/.exec(text))) {
          add(m[2], 'class', line, text.indexOf(m[2], m[1].length + 5), m[3]);
          if (/\{\s*$/.test(trimmed)) body = m[2];
          return;
        }
        if ((m = /^(\s*)namespace\s+([\w.-]+)/.exec(text))) {
          add(m[2], 'namespace', line, text.indexOf(m[2], m[1].length + 9), undefined, true);
          return;
        }
        if ((m = new RegExp(String.raw`^(\s*)(${ID})(?:~[^~]+~)?\s*(?:"[^"]*"\s*)?(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|-->|<--|\.\.>|<\.\.|--|\.\.)\s*(?:"[^"]*"\s*)?(${ID})`).exec(text))) {
          add(m[2], 'implicit', line, text.indexOf(m[2]));
          add(m[4], 'implicit', line, text.lastIndexOf(m[4]));
          return;
        }
        if ((m = /^(\s*)([\w-]+)\s*:/.exec(text)) && !/^(note|direction|click|link|style)\b/.test(trimmed)) add(m[2], 'implicit', line, m[1].length);
        return;
      }
      case 'state': {
        if ((m = /^(\s*)state\s+"([^"]*)"\s+as\s+([\w-]+)/.exec(text))) {
          add(m[3], 'state', line, text.lastIndexOf(m[3]), m[2]);
          return;
        }
        if ((m = /^(\s*)state\s+([\w-]+)/.exec(text))) {
          add(m[2], 'state', line, text.indexOf(m[2], m[1].length + 5), undefined, /\{\s*$/.test(trimmed));
          return;
        }
        if ((m = new RegExp(String.raw`^(\s*)(\[\*\]|${ID})\s*-->\s*(\[\*\]|${ID})`).exec(text))) {
          if (m[2] !== '[*]') add(m[2], 'implicit', line, m[1].length);
          if (m[3] !== '[*]') add(m[3], 'implicit', line, text.indexOf(m[3], text.indexOf('-->')));
          return;
        }
        if ((m = /^(\s*)([\w-]+)\s*:/.exec(text)) && !/^(note|direction)\b/.test(trimmed)) add(m[2], 'implicit', line, m[1].length);
        return;
      }
      case 'er': {
        if ((m = /^(\s*)([\w-]+)\s*(?:\[[^\]]*\]\s*)?\{\s*$/.exec(text))) {
          add(m[2], 'entity', line, m[1].length);
          body = m[2];
          return;
        }
        if ((m = new RegExp(String.raw`^(\s*)(${ID})\s*([|}][o|]?(?:--|\.\.)[o|]?[|{])\s*(${ID})`).exec(text))) {
          add(m[2], 'implicit', line, m[1].length);
          add(m[4], 'implicit', line, text.indexOf(m[4], text.indexOf(m[3]) + m[3].length));
          return;
        }
        if ((m = /^(\s*)([\w-]+)\s*$/.exec(text))) add(m[2], 'entity', line, m[1].length);
        return;
      }
      case 'mindmap':
      case 'timeline':
      case 'kanban': {
        if (/^::icon|^:::/.test(trimmed)) return;
        const content = trimmed.replace(/^[\w-]*(\(\(|\)\)|\{\{|\[|\(|\))/, '').replace(/(\)\)|\(\(|\}\}|\]|\)|\()$/, '') || trimmed;
        const col = text.indexOf(content);
        if (content) texts.push({ text: content, line, range: { from: index.lineStart(line) + col, to: index.lineStart(line) + col + content.length } });
        return;
      }
      default:
        return;
    }
  });

  return { index, diagramType, headerLine: preamble.headerLine, entities, texts, bodyOf };
}

export function mermaidSymbols(source: string, diagramType?: string): DocumentSymbol[] {
  const analysis = analyzeMermaid(source, diagramType);
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
