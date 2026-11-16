export type Warn = (line: number, text: string) => void;

export interface SourceLine {
  /** Trimmed text. */
  text: string;
  /** Zero-based line number. */
  line: number;
}

const IGNORED = /^(skinparam\b|hide\b|show\b|remove\b|scale\b|!|@start|@end|header\b|footer\b|caption\b|allowmixing\b|set\s|<style>|mainframe\b)/i;

/** Yields the meaningful lines of a PlantUML source (no comments, directives or styling). */
export function contentLines(source: string): SourceLine[] {
  const out: SourceLine[] = [];
  let blockComment = false;
  let skipUntil: RegExp | null = null;
  source.split(/\r\n|\r|\n/).forEach((raw, line) => {
    const text = raw.trim();
    if (!text) return;
    if (blockComment) {
      if (text.includes("'/")) blockComment = false;
      return;
    }
    if (skipUntil) {
      if (skipUntil.test(text)) skipUntil = null;
      return;
    }
    if (text.startsWith("/'")) {
      blockComment = !text.slice(2).includes("'/");
      return;
    }
    if (text.startsWith("'")) return;
    if (/^skinparam\b.*\{\s*$/i.test(text)) {
      skipUntil = /^\}/;
      return;
    }
    if (/^<style>/i.test(text)) {
      if (!/<\/style>/i.test(text)) skipUntil = /<\/style>/i;
      return;
    }
    if (/^legend\b/i.test(text)) {
      skipUntil = /^end\s*legend/i;
      return;
    }
    if (IGNORED.test(text)) return;
    out.push({ text, line });
  });
  return out;
}

/** PlantUML writes line breaks in labels as a literal `\n`. */
export const decodeText = (text: string): string => text.replace(/\\n/g, '\n').trim();
export const encodeText = (text: string): string => text.replace(/\r?\n/g, '\\n');

export const unquote = (text: string): string => text.replace(/^"(.*)"$/, '$1');

/** Quotes a name unless it is a plain identifier. */
export function quoteIfNeeded(name: string): string {
  return /^[\w.@]+$/.test(name) ? name : `"${name.replace(/"/g, "'")}"`;
}
