/** A half-open range of character offsets in a document: `[from, to)`. */
export interface TextRange {
  from: number;
  to: number;
}

/** Zero-based line/column position. */
export interface TextPosition {
  line: number;
  column: number;
}

/** Splits a document into lines without the line terminators. */
export function splitLines(source: string): string[] {
  return source.split(/\r\n|\r|\n/);
}

/**
 * Pre-computed line index of a document. Converts between offsets and
 * line/column positions without rescanning the text.
 */
export class LineIndex {
  readonly lines: string[];
  private readonly starts: number[] = [];

  constructor(readonly source: string) {
    this.lines = [];
    const re = /\r\n|\r|\n/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      this.starts.push(last);
      this.lines.push(source.slice(last, m.index));
      last = m.index + m[0].length;
    }
    this.starts.push(last);
    this.lines.push(source.slice(last));
  }

  get lineCount(): number {
    return this.lines.length;
  }

  /** Offset of the first character of the given zero-based line. */
  lineStart(line: number): number {
    return this.starts[Math.max(0, Math.min(line, this.starts.length - 1))];
  }

  /** Range covering the given line (without its terminator). */
  lineRange(line: number, trim = false): TextRange {
    const l = Math.max(0, Math.min(line, this.lines.length - 1));
    const text = this.lines[l];
    const start = this.starts[l];
    if (!trim) return { from: start, to: start + text.length };
    const lead = text.length - text.trimStart().length;
    const end = text.trimEnd().length;
    return { from: start + Math.min(lead, end), to: start + end };
  }

  positionAt(offset: number): TextPosition {
    const o = Math.max(0, Math.min(offset, this.source.length));
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= o) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, column: Math.min(o - this.starts[lo], this.lines[lo].length) };
  }

  offsetAt(position: TextPosition): number {
    const l = Math.max(0, Math.min(position.line, this.lines.length - 1));
    return this.starts[l] + Math.max(0, Math.min(position.column, this.lines[l].length));
  }
}

/** Escapes a string for literal use inside a regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turns arbitrary text into an identifier (`[A-Za-z_][A-Za-z0-9_]*`) that is
 * unique within `taken`. The chosen identifier is added to `taken`.
 */
export function toIdentifier(text: string, taken?: Set<string>, fallback = 'n'): string {
  let id = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!id) id = fallback;
  if (/^[0-9]/.test(id)) id = `${fallback}${id}`;
  if (taken) {
    let candidate = id;
    let i = 2;
    while (taken.has(candidate)) candidate = `${id}_${i++}`;
    id = candidate;
    taken.add(id);
  }
  return id;
}

/** True when the text can be used as an identifier without quoting. */
export function isIdentifier(text: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text);
}
