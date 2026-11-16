import { LineIndex } from '@sapia/core';
import type { Diagnostic, ValidateRequest } from '@sapia/core';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const SEQUENCE_OPEN = /^(alt|opt|loop|par|critical|break|group)\b/i;
const MULTILINE_NOTE = /^(r?note|hnote)\s+(left|right|top|bottom|over)\b[^:]*$/i;

/**
 * Structural checks that do not need the rendering engine: start/end tags,
 * block nesting and brace balance. The engine reports everything else when
 * the diagram is rendered.
 */
export function validatePlantUml(request: ValidateRequest, t: Translate): Diagnostic[] {
  const index = new LineIndex(request.source);
  const diagnostics: Diagnostic[] = [];
  const report = (line: number, message: string, severity: Diagnostic['severity'] = 'error') =>
    diagnostics.push({ ...index.lineRange(line, true), severity, message, source: 'plantuml' });

  let startTag: { tag: string; line: number } | null = null;
  let blockComment = false;
  let note: number | null = null;
  const blocks: { keyword: string; line: number }[] = [];
  const braces: number[] = [];
  const isSequence = request.diagramType === 'sequence';
  const isTree = request.diagramType === 'mindmap' || request.diagramType === 'wbs';

  index.lines.forEach((text, line) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (blockComment) {
      if (trimmed.includes("'/")) blockComment = false;
      return;
    }
    if (trimmed.startsWith("/'")) {
      blockComment = !trimmed.slice(2).includes("'/");
      return;
    }
    if (trimmed.startsWith("'")) return;

    const start = /^@start(\w+)/i.exec(trimmed);
    if (start) {
      if (startTag) report(line, t('plantuml.error.nestedStart', { tag: startTag.tag }));
      startTag = { tag: start[1].toLowerCase(), line };
      return;
    }
    const end = /^@end(\w+)/i.exec(trimmed);
    if (end) {
      if (!startTag) report(line, t('plantuml.error.endWithoutStart', { tag: end[1] }));
      else if (startTag.tag !== end[1].toLowerCase()) report(line, t('plantuml.error.endMismatch', { expected: startTag.tag, actual: end[1] }));
      startTag = null;
      return;
    }

    if (note !== null) {
      if (/^end\s*r?h?note\b/i.test(trimmed)) note = null;
      return;
    }
    if (isTree) return;
    if (MULTILINE_NOTE.test(trimmed)) {
      note = line;
      return;
    }

    if (isSequence) {
      if (SEQUENCE_OPEN.test(trimmed)) blocks.push({ keyword: SEQUENCE_OPEN.exec(trimmed)![1].toLowerCase(), line });
      else if (/^else\b/i.test(trimmed)) {
        if (blocks.length === 0) report(line, t('plantuml.error.elseWithoutBlock'));
      } else if (/^end$/i.test(trimmed)) {
        if (blocks.length === 0) report(line, t('plantuml.error.endWithoutBlock'));
        else blocks.pop();
      }
    }

    const code = trimmed.replace(/"[^"]*"/g, '""').replace(/:.*$/, '');
    for (const ch of code) {
      if (ch === '{') braces.push(line);
      else if (ch === '}') {
        if (braces.length === 0) report(line, t('plantuml.error.unmatchedBrace'));
        else braces.pop();
      }
    }
  });

  for (const b of blocks) report(b.line, t('plantuml.error.unclosedBlock', { keyword: b.keyword }));
  for (const line of braces) report(line, t('plantuml.error.unclosedBrace'));
  if (note !== null) report(note, t('plantuml.error.unclosedNote'));
  if (blockComment) report(index.lineCount - 1, t('plantuml.error.unclosedComment'));
  const open = startTag as { tag: string; line: number } | null;
  if (open) report(open.line, t('plantuml.error.missingEnd', { tag: open.tag }));
  return diagnostics;
}
