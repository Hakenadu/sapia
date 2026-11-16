import { LineIndex, locateByText } from '@sapia/core';
import type { Diagnostic, LocateRequest, RenderRequest, RenderResult, RenderTheme, TextRange, ValidateRequest } from '@sapia/core';
import { mermaidSymbols } from './analysis';

type Translate = (key: string, params?: Record<string, string | number>) => string;
type Mermaid = (typeof import('mermaid'))['default'];

export interface MermaidOptions {
  /** Font used inside diagrams. */
  fontFamily?: string;
  /** Extra `themeVariables`, merged over Sapia's palette. */
  themeVariables?: Record<string, string>;
  /** Mermaid theme name. Defaults to `base` with Sapia's palette. */
  theme?: string;
}

let mermaidPromise: Promise<Mermaid> | null = null;
let configuredFor: string | null = null;

function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import('mermaid').then((m) => m.default);
  mermaidPromise.catch(() => (mermaidPromise = null));
  return mermaidPromise;
}

const PALETTES: Record<RenderTheme, Record<string, string>> = {
  light: {
    background: '#ffffff',
    primaryColor: '#f0eefe',
    primaryTextColor: '#1a1c26',
    primaryBorderColor: '#6d5df6',
    secondaryColor: '#e3f6f3',
    secondaryTextColor: '#1a1c26',
    secondaryBorderColor: '#2aa79b',
    tertiaryColor: '#f5f6f9',
    tertiaryTextColor: '#1a1c26',
    tertiaryBorderColor: '#c9cddb',
    lineColor: '#626a82',
    textColor: '#1a1c26',
    mainBkg: '#f0eefe',
    nodeBorder: '#6d5df6',
    clusterBkg: '#f7f7fb',
    clusterBorder: '#d5d8e4',
    titleColor: '#1a1c26',
    edgeLabelBackground: '#ffffff',
    actorBkg: '#f0eefe',
    actorBorder: '#6d5df6',
    actorTextColor: '#1a1c26',
    actorLineColor: '#b3b8c9',
    signalColor: '#3d4358',
    signalTextColor: '#1a1c26',
    labelBoxBkgColor: '#f0eefe',
    labelBoxBorderColor: '#6d5df6',
    labelTextColor: '#1a1c26',
    loopTextColor: '#1a1c26',
    noteBkgColor: '#fff5cf',
    noteTextColor: '#3b3100',
    noteBorderColor: '#e2c95a',
    activationBkgColor: '#dcd8fd',
    activationBorderColor: '#6d5df6',
    sequenceNumberColor: '#ffffff',
  },
  dark: {
    background: '#0f1116',
    primaryColor: '#23213d',
    primaryTextColor: '#eceef5',
    primaryBorderColor: '#9d91ff',
    secondaryColor: '#14302e',
    secondaryTextColor: '#eceef5',
    secondaryBorderColor: '#4fd1c5',
    tertiaryColor: '#171a23',
    tertiaryTextColor: '#eceef5',
    tertiaryBorderColor: '#333949',
    lineColor: '#99a1b8',
    textColor: '#eceef5',
    mainBkg: '#23213d',
    nodeBorder: '#9d91ff',
    clusterBkg: '#151821',
    clusterBorder: '#333949',
    titleColor: '#eceef5',
    edgeLabelBackground: '#0f1116',
    actorBkg: '#23213d',
    actorBorder: '#9d91ff',
    actorTextColor: '#eceef5',
    actorLineColor: '#4a5166',
    signalColor: '#b9bfd1',
    signalTextColor: '#eceef5',
    labelBoxBkgColor: '#23213d',
    labelBoxBorderColor: '#9d91ff',
    labelTextColor: '#eceef5',
    loopTextColor: '#eceef5',
    noteBkgColor: '#3a3319',
    noteTextColor: '#f5e9b8',
    noteBorderColor: '#8a7a2e',
    activationBkgColor: '#35325a',
    activationBorderColor: '#9d91ff',
    sequenceNumberColor: '#0f1116',
  },
};

async function configure(theme: RenderTheme, options: MermaidOptions): Promise<Mermaid> {
  const mermaid = await loadMermaid();
  if (configuredFor !== theme) {
    const fontFamily = options.fontFamily ?? '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif';
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: (options.theme ?? 'base') as 'base',
      darkMode: theme === 'dark',
      fontFamily,
      themeVariables: { fontFamily, fontSize: '14px', darkMode: theme === 'dark', ...PALETTES[theme], ...(options.themeVariables ?? {}) },
      flowchart: { curve: 'basis', padding: 14, useMaxWidth: false },
      sequence: { useMaxWidth: false, mirrorActors: false, actorMargin: 56, messageMargin: 40 },
      class: { useMaxWidth: false },
      state: { useMaxWidth: false },
      er: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
      journey: { useMaxWidth: false },
      mindmap: { useMaxWidth: false, padding: 14 },
    });
    configuredFor = theme;
  }
  return mermaid;
}

/** Number of leading lines Mermaid strips (front matter) before parsing. */
function frontMatterLines(source: string): number {
  const m = /^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(source);
  return m ? m[0].split(/\r\n|\r|\n/).length - 1 : 0;
}

/** Converts a Mermaid parser exception into a diagnostic on the right line. */
export function toDiagnostic(error: unknown, source: string, t: Translate): Diagnostic {
  const index = new LineIndex(source);
  const e = error as { message?: string; str?: string; hash?: { loc?: { first_line?: number; last_line?: number }; line?: number } };
  const raw = String(e?.str ?? e?.message ?? error);
  const offset = frontMatterLines(source);

  let line: number | null = null;
  let m: RegExpExecArray | null;
  if (e?.hash?.loc?.first_line != null) line = e.hash.loc.first_line - 1 + offset;
  else if ((m = /\bon line (\d+)/i.exec(raw))) line = Number(m[1]) - 1 + offset;
  else if (e?.hash?.line != null) line = e.hash.line + offset;
  else if ((m = /\bat offset: (\d+)/.exec(raw))) line = index.positionAt(Number(m[1])).line + offset;
  else if ((m = /\bline:? (\d+)/i.exec(raw))) line = Number(m[1]) - 1 + offset;

  // Keep the part that says what was expected; drop the source excerpt and caret line.
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  let message = lines.find((l) => /^Expecting\b|^Unrecognized|^Lexical error|got '/i.test(l)) ?? lines[lines.length - 1] ?? raw;
  message = message.replace(/^Error:\s*/i, '').replace(/^Parse error on line \d+:?\s*/i, '');
  if (message.length > 260) message = `${message.slice(0, 257)}…`;
  if (!message) message = t('mermaid.error.syntax');

  let range: TextRange;
  if (line != null && line >= 0 && line < index.lineCount) {
    // Jison reports the line of the offending token; fall back to the previous
    // non-empty line when it points at trailing whitespace.
    let target = line;
    while (target > 0 && !index.lines[target].trim()) target--;
    range = index.lineRange(target, true);
  } else {
    let last = index.lineCount - 1;
    while (last > 0 && !index.lines[last].trim()) last--;
    range = index.lineRange(last, true);
  }
  return { ...range, severity: 'error', message, source: 'mermaid' };
}

export function createValidator(options: MermaidOptions, t: Translate) {
  return async function validate(request: ValidateRequest): Promise<Diagnostic[]> {
    if (!request.source.trim()) return [];
    const mermaid = await loadMermaid();
    try {
      await mermaid.parse(request.source);
      return [];
    } catch (e) {
      return [toDiagnostic(e, request.source, t)];
    }
  };
}

export function createRenderer(options: MermaidOptions, t: Translate) {
  return async function render(request: RenderRequest): Promise<RenderResult> {
    const mermaid = await configure(request.theme, options);
    try {
      const { svg } = await mermaid.render(request.renderId, request.source);
      return { svg };
    } catch (e) {
      return { diagnostics: [toDiagnostic(e, request.source, t)] };
    } finally {
      // Mermaid leaves temporary measuring elements behind when rendering fails.
      if (typeof document !== 'undefined') {
        document.getElementById(request.renderId)?.remove();
        document.getElementById(`d${request.renderId}`)?.remove();
      }
    }
  };
}

const NODE_ID = /(?:^|-)(?:flowchart|classId|state|entity)-(.+?)-\d+$/;

/** Maps a clicked element of a Mermaid SVG to the source. */
export function locateMermaid(request: LocateRequest): TextRange | null {
  const symbols = mermaidSymbols(request.source, request.diagramType);
  const byName = (name: string | undefined) => {
    if (!name) return null;
    const s = symbols.find((x) => x.name === name);
    return s ? (s.selectionRange ?? s.range) : null;
  };
  for (const el of request.path) {
    // Sequence diagrams carry the participant id in a `name` attribute.
    const named = byName(el.attributes['name']) ?? byName(el.attributes['data-id']) ?? byName(el.attributes['data-et'] ? undefined : el.attributes['data-node-id']);
    if (named) return named;
    const m = el.id ? NODE_ID.exec(el.id) : null;
    if (m) {
      const hit = byName(m[1]);
      if (hit) return hit;
    }
  }
  return locateByText(request, symbols);
}
