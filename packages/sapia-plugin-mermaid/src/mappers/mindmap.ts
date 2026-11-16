import type { MindmapModel, MindmapNode, MindmapShape, ModelMapper } from '@sapia/core';
import { contentLines, decodeText, encodeText } from './util';
import type { Warn } from './util';

const SHAPES: [open: string, close: string, shape: MindmapShape][] = [
  ['((', '))', 'circle'],
  ['))', '((', 'bang'],
  ['{{', '}}', 'hexagon'],
  ['[', ']', 'box'],
  ['(', ')', 'rounded'],
  [')', '(', 'cloud'],
];

function parseNode(text: string): MindmapNode {
  for (const [open, close, shape] of SHAPES) {
    const at = text.indexOf(open);
    if (at >= 0 && text.endsWith(close) && /^[\w-]*$/.test(text.slice(0, at)) && text.length >= at + open.length + close.length) {
      const inner = text.slice(at + open.length, text.length - close.length).trim();
      return { text: decodeText(inner.replace(/^"(.*)"$/, '$1').replace(/^`(.*)`$/, '$1')), shape, children: [] };
    }
  }
  return { text: decodeText(text.replace(/^"(.*)"$/, '$1')), children: [] };
}

export function parseMindmap(source: string, warn: Warn): MindmapModel {
  const { lines, title } = contentLines(source);
  let root: MindmapNode | null = null;
  const stack: { indent: number; node: MindmapNode }[] = [];
  for (const { text, indent, line } of lines) {
    if (/^::icon\(|^:::/.test(text)) continue;
    const node = parseNode(text.replace(/\s*:::[\w -]+$/, ''));
    if (!root) {
      root = node;
      stack.push({ indent, node });
      continue;
    }
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length === 1 && indent <= stack[0].indent) {
      // Mermaid allows a single root only.
      warn(line, text);
      continue;
    }
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent, node });
  }
  return { kind: 'mindmap', title, root: root ?? { text: '', children: [] } };
}

const WRAP: Partial<Record<MindmapShape, [string, string]>> = {
  circle: ['((', '))'],
  bang: ['))', '(('],
  hexagon: ['{{', '}}'],
  box: ['[', ']'],
  rounded: ['(', ')'],
  cloud: [')', '('],
};

function emit(node: MindmapNode, depth: number, out: string[], counter: { n: number }, isRoot = false): void {
  const text = encodeText(node.text);
  const shape = node.shape && node.shape !== 'default' && node.shape !== 'none' ? node.shape : isRoot ? 'circle' : undefined;
  const wrap = shape ? WRAP[shape] : undefined;
  const needsId = !!wrap || /[()[\]{}]/.test(text);
  const indent = '  '.repeat(depth);
  if (wrap) out.push(`${indent}${isRoot ? 'root' : `n${counter.n++}`}${wrap[0]}${text}${wrap[1]}`);
  else if (needsId) out.push(`${indent}n${counter.n++}["${text.replace(/"/g, "'")}"]`);
  else out.push(`${indent}${text}`);
  for (const child of node.children) emit(child, depth + 1, out, counter);
}

export function generateMindmap(model: MindmapModel): string {
  const out: string[] = [];
  if (model.title) out.push('---', `title: ${model.title.replace(/\n/g, ' ')}`, '---');
  out.push('mindmap');
  emit(model.root, 1, out, { n: 1 }, true);
  return out.join('\n') + '\n';
}

export function mindmapMapper(warning: (line: number, text: string) => string): ModelMapper<MindmapModel> {
  return {
    languageId: 'mermaid',
    diagramType: 'mindmap',
    parse(source) {
      const warnings: string[] = [];
      const model = parseMindmap(source, (line, text) => warnings.push(warning(line, text)));
      return { model, warnings };
    },
    generate: generateMindmap,
  };
}
