import { readPreamble } from '../detect';

export type Warn = (line: number, text: string) => void;

export interface SourceLine {
  /** Trimmed text. */
  text: string;
  /** Leading whitespace width (tabs count as two). */
  indent: number;
  /** Zero-based line number. */
  line: number;
}

/** Yields the statements after the header, without comments and directives. */
export function contentLines(source: string): { lines: SourceLine[]; header: string; title?: string } {
  const preamble = readPreamble(source);
  const title = /^---[\s\S]*?^title:\s*(.+)$[\s\S]*?^---/m.exec(source)?.[1]?.trim().replace(/^["']|["']$/g, '');
  const lines: SourceLine[] = [];
  source.split(/\r\n|\r|\n/).forEach((raw, line) => {
    if (line <= preamble.headerLine) return;
    const withoutComment = raw.replace(/(^|\s)%%.*$/, '');
    const text = withoutComment.trim();
    if (!text) return;
    const lead = /^\s*/.exec(withoutComment)![0];
    lines.push({ text, line, indent: lead.replace(/\t/g, '  ').length });
  });
  return { lines, header: preamble.header, title };
}

/** Mermaid writes line breaks in labels as `<br/>`. */
export const decodeText = (text: string): string => text.replace(/<br\s*\/?>/gi, '\n').replace(/#quot;/g, '"').replace(/#59;/g, ';').trim();
export const encodeText = (text: string): string => text.replace(/\r?\n/g, '<br/>');
/** Encodes text for use inside double quotes. */
export const encodeQuoted = (text: string): string => encodeText(text).replace(/"/g, '#quot;');

export const unquote = (text: string): string => text.replace(/^"(.*)"$/, '$1');
