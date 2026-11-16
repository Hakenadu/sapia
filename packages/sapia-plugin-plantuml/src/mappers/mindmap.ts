import type { MindmapModel, MindmapNode, ModelMapper } from '@sapia/core';
import { contentLines, decodeText, encodeText } from './util';
import type { Warn } from './util';

const NODE = /^([*+-]+)(_)?(?:\[#\w+\])?\s+(.*)$/;

export function parseMindmap(source: string, warn: Warn): MindmapModel {
  let root: MindmapNode | null = null;
  const stack: { depth: number; node: MindmapNode }[] = [];
  let leftSide = false;
  let title: string | undefined;

  const lines = contentLines(source);
  for (let i = 0; i < lines.length; i++) {
    const { text, line } = lines[i];
    let m: RegExpExecArray | null;
    if ((m = /^title\s+(.*)$/i.exec(text))) {
      title = decodeText(m[1]);
      continue;
    }
    if (/^left side$/i.test(text)) {
      leftSide = true;
      continue;
    }
    if (/^right side$/i.test(text)) {
      leftSide = false;
      continue;
    }
    if (!(m = NODE.exec(text))) {
      warn(line, text);
      continue;
    }
    const depth = m[1].length;
    let content = m[3];
    // Multi-line node: `*:first line` … `last line;`
    if (content.startsWith(':') && !content.endsWith(';')) {
      const collected = [content.slice(1)];
      while (++i < lines.length) {
        const t = lines[i].text;
        collected.push(t.replace(/;$/, ''));
        if (t.endsWith(';')) break;
      }
      content = collected.join('\n');
    } else if (content.startsWith(':') && content.endsWith(';')) content = content.slice(1, -1);
    // Strip HTML-ish/creole decorations that have no neutral meaning.
    content = content.replace(/<<\w+>>\s*$/, '').trim();

    const node: MindmapNode = { text: decodeText(content), children: [] };
    if (m[2]) node.shape = 'none';
    if (!root) {
      root = node;
      stack.length = 0;
      stack.push({ depth, node });
      continue;
    }
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1].node;
    if (stack.length === 1 && (leftSide || m[1].startsWith('-'))) node.side = 'left';
    parent.children.push(node);
    stack.push({ depth, node });
  }
  return { kind: 'mindmap', title, root: root ?? { text: '', children: [] } };
}

function emit(node: MindmapNode, depth: number, out: string[]): void {
  const marker = '*'.repeat(depth) + (node.shape === 'none' ? '_' : '');
  if (node.text.includes('\n')) out.push(`${marker}:${node.text};`);
  else out.push(`${marker} ${encodeText(node.text)}`);
  for (const child of node.children) emit(child, depth + 1, out);
}

export function generateMindmap(model: MindmapModel): string {
  const out = ['@startmindmap'];
  if (model.title) out.push(`title ${encodeText(model.title)}`);
  const right = model.root.children.filter((c) => c.side !== 'left');
  const left = model.root.children.filter((c) => c.side === 'left');
  emit({ ...model.root, children: right }, 1, out);
  if (left.length) {
    out.push('left side');
    for (const child of left) emit(child, 2, out);
  }
  out.push('@endmindmap');
  return out.join('\n') + '\n';
}

export function mindmapMapper(warning: (line: number, text: string) => string): ModelMapper<MindmapModel> {
  return {
    languageId: 'plantuml',
    diagramType: 'mindmap',
    parse(source) {
      const warnings: string[] = [];
      const model = parseMindmap(source, (line, text) => warnings.push(warning(line, text)));
      return { model, warnings };
    },
    generate: generateMindmap,
  };
}
