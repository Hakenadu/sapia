import { LineIndex } from '@sapia/core';
import type { Diagnostic, LocateRequest, RenderRequest, RenderResult, TextRange } from '@sapia/core';
import { locateByText } from '@sapia/core';
import { plantUmlSymbols } from './analysis';

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface PlantUmlEngine {
  renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: unknown) => void,
    options?: { dark?: boolean; maxSvgSize?: number },
  ): void;
}

export interface EngineOptions {
  /** Absolute or document-relative URL of the directory holding the `@plantuml/core` files. */
  engineBase: string;
  /**
   * `sapia` (default) gives diagrams without styling of their own a look that
   * matches the editor in light and dark mode; `plantuml` keeps PlantUML's defaults.
   */
  look?: 'sapia' | 'plantuml';
}

interface Palette {
  text: string;
  line: string;
  fill: string;
  arrow: string;
  noteFill: string;
  noteLine: string;
  groupFill: string;
}

const PALETTES: Record<'light' | 'dark', Palette> = {
  light: { text: '#151821', line: '#6f61ee', fill: '#f3f1ff', arrow: '#535b70', noteFill: '#fff7dd', noteLine: '#d6a43a', groupFill: '#e9e6ff' },
  dark: { text: '#e9ebf3', line: '#9d91ff', fill: '#1d1b3a', arrow: '#a3abbe', noteFill: '#2c2613', noteLine: '#c79a3c', groupFill: '#2a2752' },
};

/** Style lines injected after the start tag. Kept free of blank lines so offsets stay predictable. */
export function sapiaStyle(theme: 'light' | 'dark'): string[] {
  const p = PALETTES[theme];
  return [
    '<style>',
    'root {',
    '  FontName Inter Variable, Inter, sans-serif',
    `  FontColor ${p.text}`,
    `  LineColor ${p.line}`,
    `  BackgroundColor ${p.fill}`,
    '  LineThickness 1.2',
    '  RoundCorner 10',
    '  Shadowing 0',
    '}',
    'document {',
    '  BackgroundColor transparent',
    '}',
    'arrow {',
    `  LineColor ${p.arrow}`,
    '  LineThickness 1.2',
    '}',
    'note {',
    `  BackgroundColor ${p.noteFill}`,
    `  LineColor ${p.noteLine}`,
    '}',
    'group {',
    `  LineColor ${p.arrow}`,
    '  BackgroundColor transparent',
    '}',
    'groupHeader {',
    `  BackgroundColor ${p.groupFill}`,
    `  LineColor ${p.arrow}`,
    '}',
    'title {',
    '  FontSize 17',
    '}',
    '</style>',
  ];
}

/** Diagrams that bring their own styling are left alone. */
function hasOwnStyling(source: string): boolean {
  return /^\s*(?:!theme\b|skinparam\b|<style>|skin\s+\w+|!include\b|!pragma\b)/im.test(source);
}

const STYLABLE_START = /^\s*@start(?:uml|mindmap|wbs)\b.*$/m;

let enginePromise: Promise<PlantUmlEngine> | null = null;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(script);
  });
}

/** Loads the PlantUML engine (compiled to JavaScript) on first use. */
function loadEngine(options: EngineOptions): Promise<PlantUmlEngine> {
  enginePromise ??= (async () => {
    const base = new URL(options.engineBase.replace(/\/?$/, '/'), document.baseURI).href;
    const g = globalThis as Record<string, unknown>;
    // Themes, emoji and sprites are fetched lazily from the same directory.
    g['PLANTUML_STDLIB_BASE'] ??= base;
    if (!g['Viz'] && !g['PLANTUML_VIZ']) await loadScript(`${base}viz-global.js`);
    const url = `${base}plantuml.js`;
    return (await import(/* @vite-ignore */ /* webpackIgnore: true */ url)) as PlantUmlEngine;
  })();
  enginePromise.catch(() => (enginePromise = null));
  return enginePromise;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/**
 * PlantUML reports syntax errors as a picture. Recognise it and turn it
 * into a diagnostic that points at the offending line.
 */
export function parseErrorSvg(svg: string, source: string, t: Translate): Diagnostic | null {
  const lineMatch = /\(line (\d+)\)/.exec(svg);
  const texts = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => ({ attrs: m[1], text: decodeEntities(m[2]).trim() }));
  const red = texts.filter((x) => /fill="#FF0000"/i.test(x.attrs) && x.text).map((x) => x.text);
  const isError = !!lineMatch || red.some((x) => /error|cannot|unknown|not found|no @start/i.test(x)) || /Syntax Error\?/.test(svg);
  if (!isError) return null;
  const index = new LineIndex(source);
  const line = lineMatch ? Math.min(index.lineCount - 1, Math.max(0, Number(lineMatch[1]) - 1)) : 0;
  const message = red.join(' ').replace(/\s+/g, ' ').trim() || t('plantuml.error.syntax');
  return { ...index.lineRange(line, true), severity: 'error', message, source: 'plantuml' };
}

/** Makes ids unique per render and lets the surrounding UI size the SVG. */
function postProcess(svg: string): string {
  return svg.replace(/<\?plantuml[^?]*\?>/g, '').replace(/<\?plantuml-src[^?]*\?>/g, '');
}

export function createRenderer(options: EngineOptions, t: Translate) {
  return async function render(request: RenderRequest): Promise<RenderResult> {
    let engine: PlantUmlEngine;
    try {
      engine = await loadEngine(options);
    } catch (e) {
      throw new Error(t('plantuml.error.engineLoad', { message: (e as Error).message }));
    }
    let source = request.source;
    // The engine needs the start/end tags that PlantUML tools traditionally add implicitly.
    if (!/^\s*@start\w+/m.test(source)) source = `@startuml\n${source}\n@enduml`;
    let shift = source !== request.source ? 1 : 0;
    let themed = false;
    const start = STYLABLE_START.exec(source);
    if ((options.look ?? 'sapia') === 'sapia' && start && !hasOwnStyling(source)) {
      const style = sapiaStyle(request.theme === 'dark' ? 'dark' : 'light');
      const end = start.index + start[0].length;
      source = `${source.slice(0, end)}\n${style.join('\n')}${source.slice(end)}`;
      shift += style.length;
      themed = true;
    }

    const svg = await new Promise<string>((resolve, reject) => {
      engine.renderToString(
        source.split(/\r\n|\r|\n/),
        resolve,
        (message) => reject(new Error(t('plantuml.error.engine', { message: String(message) }))),
        { dark: !themed && request.theme === 'dark', maxSvgSize: 0 },
      );
    });
    if (request.signal?.aborted) return {};

    const error = parseErrorSvg(svg, source, t);
    if (error) {
      if (shift) {
        // Shift the diagnostic back by the injected lines.
        const index = new LineIndex(request.source);
        const line = Math.max(0, new LineIndex(source).positionAt(error.from).line - shift);
        Object.assign(error, index.lineRange(Math.min(line, index.lineCount - 1), true));
      }
      return { diagnostics: [error] };
    }
    return { svg: shift ? shiftSourceLines(postProcess(svg), -shift) : postProcess(svg) };
  };
}

function shiftSourceLines(svg: string, delta: number): string {
  return svg.replace(/data-source-line="(\d+)"/g, (_, n: string) => `data-source-line="${Math.max(0, Number(n) + delta)}"`);
}

/** Maps a clicked SVG element to the source line PlantUML recorded for it. */
export function locatePlantUml(request: LocateRequest): TextRange | null {
  const index = new LineIndex(request.source);
  for (const el of request.path) {
    const raw = el.attributes['data-source-line'];
    if (raw === undefined || !/^\d+$/.test(raw)) continue;
    const line = Number(raw);
    if (line >= index.lineCount) break;
    const lineRange = index.lineRange(line, true);
    // Prefer selecting the entity name on that line.
    const qualified = el.attributes['data-qualified-name'];
    const text = index.lines[line];
    const candidates = [qualified?.split('.').pop(), el.text, request.path[0]?.text].filter((c): c is string => !!c && c.length < 120);
    for (const candidate of candidates) {
      const col = text.indexOf(candidate);
      if (col >= 0) return { from: index.lineStart(line) + col, to: index.lineStart(line) + col + candidate.length };
    }
    return lineRange;
  }
  return locateByText(request, plantUmlSymbols(request.source));
}
