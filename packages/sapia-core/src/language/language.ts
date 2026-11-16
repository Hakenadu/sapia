import type { TextRange } from '../text/text';
import type { Tokenizer } from './tokens';

/** Diagram type id used when a language is recognised but the type is not. */
export const UNKNOWN_DIAGRAM_TYPE = 'unknown';

/**
 * Well-known diagram type ids. Plugins may introduce additional ids; these
 * are shared so that different languages agree on what they are talking
 * about (which is what makes conversion possible).
 */
export const DiagramTypes = {
  sequence: 'sequence',
  class: 'class',
  state: 'state',
  mindmap: 'mindmap',
  component: 'component',
  deployment: 'deployment',
  usecase: 'usecase',
  activity: 'activity',
  flowchart: 'flowchart',
  er: 'er',
  gantt: 'gantt',
  object: 'object',
  timing: 'timing',
  wbs: 'wbs',
  json: 'json',
  yaml: 'yaml',
  pie: 'pie',
  journey: 'journey',
  gitgraph: 'gitgraph',
  timeline: 'timeline',
  quadrant: 'quadrant',
  requirement: 'requirement',
  c4: 'c4',
  sankey: 'sankey',
  xychart: 'xychart',
  block: 'block',
  architecture: 'architecture',
  kanban: 'kanban',
  packet: 'packet',
  salt: 'salt',
  unknown: UNKNOWN_DIAGRAM_TYPE,
} as const;

export interface DiagramTypeInfo {
  id: string;
  /** i18n key for the display name; falls back to `diagramType.<id>` then the id. */
  labelKey?: string;
  /** Starter source inserted when the user creates a diagram of this type. */
  template?: string;
}

export interface DetectionResult {
  /** 0..1 – how sure the language is that the source is written in it. */
  confidence: number;
  diagramType: string;
}

export interface Detection extends DetectionResult {
  languageId: string;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic extends TextRange {
  severity: DiagnosticSeverity;
  message: string;
  /** Short origin label, e.g. `plantuml` or `mermaid`. */
  source?: string;
}

export type CompletionKind =
  | 'keyword'
  | 'entity'
  | 'type'
  | 'arrow'
  | 'snippet'
  | 'property'
  | 'value'
  | 'color'
  | 'text';

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  /** Short text shown next to the label. */
  detail?: string;
  /** Longer description. */
  info?: string;
  /** Text to insert instead of `label`. */
  insertText?: string;
  /**
   * Snippet template with `${1:placeholder}` tab stops. Takes precedence
   * over `insertText`.
   */
  snippet?: string;
  /** Ranking hint, -99..99. Higher sorts first. */
  boost?: number;
}

export interface CompletionRequest {
  source: string;
  /** Cursor offset. */
  offset: number;
  diagramType: string;
  /** True when the user explicitly asked for completion (Ctrl+Space). */
  explicit: boolean;
}

export interface CompletionResult {
  /** Start offset of the text the items replace. */
  from: number;
  to?: number;
  items: CompletionItem[];
}

export type SymbolKind = 'entity' | 'relation' | 'container' | 'note' | 'text';

/** A named thing declared (or implicitly introduced) by a diagram. */
export interface DocumentSymbol {
  /** Identifier used to reference the symbol in source. */
  name: string;
  /** Text shown in the rendered diagram, when different from `name`. */
  label?: string;
  kind: SymbolKind;
  /** Language specific flavour: `participant`, `class`, `database`, … */
  detail?: string;
  /** Where the symbol is declared or first used. */
  range: TextRange;
  /** Range to select when navigating to the symbol. */
  selectionRange?: TextRange;
}

export type RenderTheme = 'light' | 'dark';

export interface RenderRequest {
  source: string;
  diagramType: string;
  theme: RenderTheme;
  /** Unique id usable as DOM id prefix for this render. */
  renderId: string;
  signal?: AbortSignal;
}

export interface RenderResult {
  /** The rendered diagram; absent when the source could not be rendered. */
  svg?: string;
  /** Problems the renderer found (e.g. syntax errors reported by the engine). */
  diagnostics?: Diagnostic[];
}

/**
 * Framework-neutral description of an element of the rendered diagram.
 * UI layers build it from the DOM; plugins use it to find the source.
 */
export interface RenderedElement {
  tag: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  /** Trimmed text content (may be truncated). */
  text?: string;
}

export interface LocateRequest {
  source: string;
  diagramType: string;
  /** The clicked element first, then its ancestors up to the SVG root. */
  path: RenderedElement[];
}

export interface ValidateRequest {
  source: string;
  diagramType: string;
  signal?: AbortSignal;
}

/**
 * Everything a plugin contributes for one diagram language. Only `id`,
 * `name` and `detect` are mandatory; the editor degrades gracefully when
 * capabilities are missing.
 */
export interface LanguageSupport {
  id: string;
  name: string;
  fileExtensions?: string[];
  /** Diagram types this language can express. */
  diagramTypes: DiagramTypeInfo[];

  /** Recognise the language and diagram type of a source text. */
  detect(source: string): DetectionResult | null;

  /** Syntax highlighting. */
  tokenizer?: Tokenizer<any>;
  /** Line comment prefix, used for comment toggling. */
  lineComment?: string;

  /** Context-aware completion. */
  complete?(request: CompletionRequest): CompletionResult | null | Promise<CompletionResult | null>;

  /** Static validation; rendering may report additional diagnostics. */
  validate?(request: ValidateRequest): Diagnostic[] | Promise<Diagnostic[]>;

  /** Symbols of the document (entities, containers, …). */
  symbols?(source: string, diagramType: string): DocumentSymbol[];

  /** Render the source to SVG. */
  render?(request: RenderRequest): Promise<RenderResult>;

  /** Map an element of the rendered diagram back to the source. */
  locate?(request: LocateRequest): TextRange | null;
}
