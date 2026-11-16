import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ConversionError, LineIndex, UNKNOWN_DIAGRAM_TYPE } from '@sapia/core';
import type {
  AiDiagnostic,
  AiWorkspace,
  Detection,
  Diagnostic,
  DiagramSnapshot,
  LanguageCapability,
  LanguageSupport,
  RenderTheme,
  StoredDiagramMeta,
  TextRange,
} from '@sapia/core';
import { I18nService } from './i18n.service';
import { SapiaService } from './sapia.service';
import { ThemeService } from './theme.service';

const SESSION_KEY = 'sapia.session';

export type PreviewState = 'empty' | 'unknown' | 'unsupported' | 'rendering' | 'ok' | 'error';

interface CheckResult {
  diagnostics: Diagnostic[];
  svg?: string;
  /** Unexpected failure of the engine itself (not a syntax error). */
  failure?: string;
  ms: number;
}

let renderCounter = 0;

/**
 * State of the diagram being edited: source, detection, diagnostics, the
 * rendered picture and persistence. Everything is exposed as signals.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly sapia = inject(SapiaService);
  private readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);

  // -- document ------------------------------------------------------------
  readonly id = signal<string | null>(null);
  readonly name = signal('');
  readonly source = signal('');
  private readonly savedSource = signal<string | null>(null);
  private readonly savedName = signal<string | null>(null);
  readonly dirty = computed(() => this.source() !== (this.savedSource() ?? '') || (this.id() !== null && this.name() !== this.savedName()));
  readonly isSaved = computed(() => this.id() !== null && !this.dirty());

  // -- analysis ------------------------------------------------------------
  readonly detection = computed<Detection | null>(() => {
    this.sapia.registryVersion();
    return this.sapia.core.languages.detect(this.source());
  });
  readonly language = computed<LanguageSupport | undefined>(() => this.sapia.core.languages.get(this.detection()?.languageId));
  readonly diagramType = computed(() => this.detection()?.diagramType ?? UNKNOWN_DIAGRAM_TYPE);
  readonly conversionTargets = computed(() => {
    this.sapia.registryVersion();
    const detection = this.detection();
    if (!detection) return [];
    return this.sapia.core.conversion
      .targetsFor(detection.languageId, detection.diagramType)
      .map((id) => this.sapia.core.languages.get(id))
      .filter((l): l is LanguageSupport => !!l);
  });

  readonly diagnostics = signal<Diagnostic[]>([]);
  readonly errorCount = computed(() => this.diagnostics().filter((d) => d.severity === 'error').length);
  readonly warningCount = computed(() => this.diagnostics().filter((d) => d.severity === 'warning').length);

  // -- preview -------------------------------------------------------------
  readonly svg = signal<string | null>(null);
  /** The theme the current picture was rendered in. */
  readonly svgTheme = signal<RenderTheme>('light');
  readonly previewState = signal<PreviewState>('empty');
  readonly renderMs = signal<number | null>(null);
  readonly renderFailure = signal<string | null>(null);
  /** True when the picture belongs to an older, still valid version of the source. */
  readonly previewStale = computed(() => this.previewState() === 'error' && this.svg() !== null);

  // -- library -------------------------------------------------------------
  readonly library = signal<StoredDiagramMeta[]>([]);

  /** Request for the editor to select and reveal a range. */
  readonly reveal = signal<{ range: TextRange; nonce: number } | null>(null);
  /** Position of the primary cursor (zero-based), maintained by the editor. */
  readonly cursor = signal({ line: 0, column: 0 });

  private timer: ReturnType<typeof setTimeout> | undefined;
  private runId = 0;
  private readonly started = signal(false);

  constructor() {
    // Re-validate and re-render after edits, debounced.
    effect(() => {
      // The core only exists once the app initializer ran.
      if (!this.started()) return;
      const source = this.source();
      const detection = this.detection();
      const theme = this.theme.diagramTheme();
      this.i18n.locale();
      untracked(() => this.schedule(source, detection, theme));
    });
    // Keep the working copy across reloads.
    effect(() => {
      if (!this.started()) return;
      const session = { id: this.id(), name: this.name(), source: this.source(), savedSource: this.savedSource(), savedName: this.savedName() };
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {
        /* ignore */
      }
    });
  }

  /** Restores the last session or opens a starter diagram. */
  async start(): Promise<void> {
    await this.refreshLibrary();
    let restored = false;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as { id: string | null; name: string; source: string; savedSource: string | null; savedName: string | null };
        if (typeof session.source === 'string' && session.source.trim()) {
          const stillExists = session.id ? this.library().some((d) => d.id === session.id) : true;
          this.id.set(stillExists ? session.id : null);
          this.name.set(session.name || this.i18n.t('doc.untitled'));
          this.source.set(session.source);
          this.savedSource.set(stillExists ? session.savedSource : null);
          this.savedName.set(stillExists ? session.savedName : null);
          restored = true;
        }
      }
    } catch {
      /* corrupt session – start fresh */
    }
    if (!restored) this.newFromTemplate('plantuml', 'sequence');
    this.started.set(true);
    this.schedule(this.source(), this.detection(), this.theme.diagramTheme(), 0);
  }

  // -- editing -------------------------------------------------------------
  setSource(source: string): void {
    this.source.set(source);
  }

  rename(name: string): void {
    this.name.set(name.trim() || this.i18n.t('doc.untitled'));
  }

  revealRange(range: TextRange): void {
    this.reveal.set({ range, nonce: Date.now() + Math.random() });
  }

  /** Jumps to the source of a clicked diagram element. Returns false when it cannot be located. */
  locate(path: Parameters<NonNullable<LanguageSupport['locate']>>[0]['path'], reveal = true): TextRange | null {
    const language = this.language();
    if (!language?.locate) return null;
    let range: TextRange | null = null;
    try {
      range = language.locate({ source: this.source(), diagramType: this.diagramType(), path });
    } catch {
      range = null;
    }
    if (range && reveal) this.revealRange(range);
    return range;
  }

  // -- documents -----------------------------------------------------------
  newBlank(): void {
    this.open(null, this.i18n.t('doc.untitled'), '', null);
  }

  newFromTemplate(languageId: string, diagramType: string): boolean {
    const language = this.sapia.core.languages.get(languageId);
    const template = language?.diagramTypes.find((t) => t.id === diagramType)?.template;
    if (!language || !template) return false;
    this.open(null, this.i18n.diagramType(diagramType), template, null);
    return true;
  }

  private open(id: string | null, name: string, source: string, saved: { source: string; name: string } | null): void {
    this.id.set(id);
    this.name.set(name);
    this.source.set(source);
    // A fresh template or blank document is pristine until the user edits it.
    this.savedSource.set(saved?.source ?? source);
    this.savedName.set(saved?.name ?? null);
    this.cursor.set({ line: 0, column: 0 });
  }

  async openDiagram(id: string): Promise<boolean> {
    const diagram = await this.sapia.store.get(id);
    if (!diagram) return false;
    this.open(diagram.id, diagram.name, diagram.source, { source: diagram.source, name: diagram.name });
    return true;
  }

  async save(): Promise<void> {
    const detection = this.detection();
    const saved = await this.sapia.store.save({
      id: this.id() ?? undefined,
      name: this.name() || this.i18n.t('doc.untitled'),
      source: this.source(),
      languageId: detection?.languageId,
      diagramType: detection?.diagramType,
    });
    this.id.set(saved.id);
    this.name.set(saved.name);
    this.savedSource.set(saved.source);
    this.savedName.set(saved.name);
    await this.refreshLibrary();
  }

  async duplicate(): Promise<void> {
    this.id.set(null);
    this.name.set(`${this.name()} ${this.i18n.t('doc.copySuffix')}`);
    this.savedSource.set(null);
    this.savedName.set(null);
    await this.save();
  }

  async deleteDiagram(id: string): Promise<void> {
    await this.sapia.store.delete(id);
    if (this.id() === id) {
      this.id.set(null);
      this.savedSource.set(null);
      this.savedName.set(null);
    }
    await this.refreshLibrary();
  }

  async refreshLibrary(): Promise<void> {
    try {
      this.library.set(await this.sapia.store.list());
    } catch {
      this.library.set([]);
    }
  }

  // -- conversion ----------------------------------------------------------
  /** Converts the open diagram via its metamodel. Throws {@link ConversionError}. */
  convert(targetLanguageId: string): { warnings: string[] } {
    const detection = this.detection();
    if (!detection) throw new ConversionError('Nothing to convert', 'no-mapper');
    const result = this.sapia.core.conversion.convert({
      source: this.source(),
      from: detection.languageId,
      to: targetLanguageId,
      diagramType: detection.diagramType,
    });
    this.source.set(result.source);
    return { warnings: result.warnings };
  }

  // -- validation and rendering ---------------------------------------------
  private schedule(source: string, detection: Detection | null, theme: RenderTheme, delay = this.sapia.config().editor.renderDelay): void {
    clearTimeout(this.timer);
    const id = ++this.runId;
    if (!source.trim()) {
      this.diagnostics.set([]);
      this.svg.set(null);
      this.previewState.set('empty');
      return;
    }
    const language = this.sapia.core.languages.get(detection?.languageId);
    if (!detection || !language) {
      this.diagnostics.set([]);
      this.svg.set(null);
      this.previewState.set('unknown');
      return;
    }
    this.timer = setTimeout(async () => {
      if (this.previewState() !== 'ok' && this.previewState() !== 'error') this.previewState.set('rendering');
      const result = await this.check(source, detection, theme);
      if (id !== this.runId) return;
      this.diagnostics.set(result.diagnostics);
      this.renderMs.set(result.ms);
      this.renderFailure.set(result.failure ?? null);
      if (result.svg) {
        this.svgTheme.set(theme);
        this.svg.set(result.svg);
        this.previewState.set('ok');
      } else if (!language.render) {
        this.svg.set(null);
        this.previewState.set('unsupported');
      } else {
        this.previewState.set('error');
      }
    }, delay);
  }

  /** Validates and renders a source without touching the editor state. */
  private async check(source: string, detection: Detection, theme: RenderTheme): Promise<CheckResult> {
    const language = this.sapia.core.languages.get(detection.languageId)!;
    const started = performance.now();
    const diagnostics: Diagnostic[] = [];
    let svg: string | undefined;
    let failure: string | undefined;
    try {
      if (language.validate) diagnostics.push(...(await language.validate({ source, diagramType: detection.diagramType })));
    } catch (e) {
      console.warn('[sapia] validation failed', e);
    }
    if (language.render) {
      try {
        const result = await language.render({ source, diagramType: detection.diagramType, theme, renderId: `sapia-render-${++renderCounter}` });
        diagnostics.push(...(result.diagnostics ?? []));
        svg = result.svg;
      } catch (e) {
        failure = e instanceof Error ? e.message : String(e);
      }
    }
    const seen = new Set<string>();
    const unique = diagnostics
      .filter((d) => {
        const key = `${d.from}:${d.to}:${d.message}`;
        const lineKey = `${new LineIndex(source).positionAt(d.from).line}:${d.severity}:${d.source}`;
        // Engines report the same problem once when validating and once when rendering.
        if (seen.has(key) || (d.source === 'mermaid' && seen.has(lineKey))) return false;
        seen.add(key);
        seen.add(lineKey);
        return true;
      })
      .sort((a, b) => a.from - b.from);
    return { diagnostics: unique, svg, failure, ms: Math.round(performance.now() - started) };
  }

  // -- AI workspace ----------------------------------------------------------
  private toAiDiagnostics(source: string, diagnostics: Diagnostic[]): AiDiagnostic[] {
    const index = new LineIndex(source);
    return diagnostics.map((d) => ({ line: index.positionAt(d.from).line + 1, severity: d.severity, message: d.message }));
  }

  private async snapshot(): Promise<DiagramSnapshot> {
    const source = this.source();
    const detection = this.detection();
    let diagnostics: AiDiagnostic[] = [];
    if (detection && source.trim()) {
      const result = await this.check(source, detection, this.theme.diagramTheme());
      diagnostics = this.toAiDiagnostics(source, result.diagnostics);
      if (result.failure) diagnostics.push({ line: 1, severity: 'error', message: result.failure });
    }
    return {
      id: this.id(),
      name: this.name(),
      source,
      languageId: detection?.languageId ?? null,
      diagramType: detection?.diagramType ?? null,
      diagnostics,
      conversionTargets: this.conversionTargets().map((l) => l.id),
    };
  }

  /** The operations the AI assistant's tools are allowed to perform. */
  readonly aiWorkspace: AiWorkspace = {
    getActiveDiagram: () => this.snapshot(),
    setActiveSource: async (source) => {
      this.source.set(source);
      return this.snapshot();
    },
    listDiagrams: async () => {
      await this.refreshLibrary();
      return this.library();
    },
    readDiagram: async (id) => {
      const d = await this.sapia.store.get(id);
      return d ? { name: d.name, source: d.source } : null;
    },
    createDiagram: async ({ name, source }) => {
      this.open(null, name.trim() || this.i18n.t('doc.untitled'), source, null);
      await this.save();
      return this.snapshot();
    },
    openDiagram: async (id) => ((await this.openDiagram(id)) ? this.snapshot() : null),
    renameActiveDiagram: async (name) => this.rename(name),
    saveActiveDiagram: () => this.save(),
    convertActiveDiagram: async (target) => {
      const { warnings } = this.convert(target);
      return { snapshot: await this.snapshot(), warnings };
    },
    checkSource: async (source) => {
      const detection = this.sapia.core.languages.detect(source);
      if (!detection) return { languageId: null, diagramType: null, diagnostics: [] };
      const result = await this.check(source, detection, this.theme.diagramTheme());
      const diagnostics = this.toAiDiagnostics(source, result.diagnostics);
      if (result.failure) diagnostics.push({ line: 1, severity: 'error', message: result.failure });
      return { languageId: detection.languageId, diagramType: detection.diagramType, diagnostics };
    },
    listCapabilities: async () => this.capabilities(),
    getTemplate: async (languageId, diagramType) =>
      this.sapia.core.languages.get(languageId)?.diagramTypes.find((t) => t.id === diagramType)?.template ?? null,
  };

  capabilities(): LanguageCapability[] {
    const { languages, conversion } = this.sapia.core;
    return languages.all().map((l) => ({
      id: l.id,
      name: l.name,
      diagramTypes: l.diagramTypes.map((t) => t.id),
      convertibleTypes: l.diagramTypes.map((t) => t.id).filter((t) => conversion.targetsFor(l.id, t).length > 0),
    }));
  }
}
