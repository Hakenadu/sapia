import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConversionError, LineIndex } from '@sapia/core';
import type { Diagnostic, RenderedElement, StoredDiagramMeta, TextRange, ThemePreference } from '@sapia/core';
import { firstValueFrom } from 'rxjs';
import { AiWidget } from './ai/ai-widget';
import { I18nService } from './core/i18n.service';
import { formatBinding, matchesBinding } from './core/keys';
import { SapiaService } from './core/sapia.service';
import { ThemeService } from './core/theme.service';
import { WorkspaceService } from './core/workspace.service';
import { ConfirmDialog } from './dialogs/confirm-dialog';
import type { ConfirmData } from './dialogs/confirm-dialog';
import { NewDiagramDialog } from './dialogs/new-diagram-dialog';
import type { NewDiagramResult } from './dialogs/new-diagram-dialog';
import { SettingsDialog } from './dialogs/settings-dialog';
import { CodeEditor } from './editor/code-editor';
import { LibraryPanel } from './library/library-panel';
import { Onboarding } from './onboarding/onboarding';
import { Preview } from './preview/preview';
import { Icon } from './ui/icon';
import type { IconName } from './ui/icon';
import { LanguageBadge } from './ui/language-badge';

const SPLIT_KEY = 'sapia.split';

interface Problem {
  diagnostic: Diagnostic;
  line: number;
  column: number;
}

/** The application shell: toolbar, editor / preview split, library, status bar. */
@Component({
  selector: 'sapia-root',
  imports: [AiWidget, CodeEditor, Icon, LanguageBadge, LibraryPanel, MatMenuModule, MatTooltipModule, Onboarding, Preview],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'onKeydown($event)',
    '[class.resizing]': 'resizing()',
  },
})
export class App {
  protected readonly sapia = inject(SapiaService);
  protected readonly ws = inject(WorkspaceService);
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly t = this.i18n.t;

  private readonly convertTrigger = viewChild<MatMenuTrigger>('convertTrigger');
  protected readonly editor = viewChild(CodeEditor);

  protected readonly libraryOpen = signal(false);
  protected readonly aiOpen = signal(false);
  protected readonly problemsOpen = signal(false);
  protected readonly resizing = signal(false);
  protected readonly split = signal(this.readSplit());

  protected readonly themes: { id: ThemePreference; icon: IconName }[] = [
    { id: 'system', icon: 'system' },
    { id: 'light', icon: 'sun' },
    { id: 'dark', icon: 'moon' },
  ];
  protected readonly themeIcon = computed<IconName>(() => (this.theme.active() === 'dark' ? 'moon' : 'sun'));

  protected readonly keys = computed(() => {
    const k = this.sapia.config().keybindings;
    return {
      ai: formatBinding(k.aiAssistant),
      save: formatBinding(k.save).join(' '),
      new: formatBinding(k.newDiagram).join(' '),
      library: formatBinding(k.openLibrary).join(' '),
      convert: formatBinding(k.convert).join(' '),
    };
  });

  protected readonly problems = computed<Problem[]>(() => {
    const index = new LineIndex(this.ws.source());
    return this.ws.diagnostics().map((diagnostic) => {
      const position = index.positionAt(diagnostic.from);
      return { diagnostic, line: position.line + 1, column: position.column + 1 };
    });
  });
  protected readonly firstError = computed(() => this.ws.diagnostics().find((d) => d.severity === 'error')?.message ?? null);
  protected readonly saveState = computed<'saved' | 'unsaved' | 'new'>(() => (this.ws.isSaved() ? 'saved' : this.ws.id() ? 'unsaved' : 'new'));
  protected readonly canDelete = computed(() => this.ws.id() !== null);

  /** Resolves a clicked element without moving the cursor (used for hover feedback). */
  protected readonly resolve = (path: RenderedElement[]): TextRange | null => this.ws.locate(path, false);

  constructor() {
    effect(() => {
      document.title = `${this.ws.dirty() ? '● ' : ''}${this.ws.name()} – Sapia`;
    });
    effect(() => {
      if (this.ws.diagnostics().length === 0) this.problemsOpen.set(false);
    });
  }

  // -- keyboard ----------------------------------------------------------------
  protected onKeydown(event: KeyboardEvent): void {
    if (this.sapia.needsOnboarding()) return;
    const keys = this.sapia.config().keybindings;
    const run = (action: () => void): void => {
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    if (matchesBinding(event, keys.aiAssistant)) return run(() => this.toggleAi());
    if (this.dialog.openDialogs.length > 0) return;
    if (matchesBinding(event, keys.save)) return run(() => void this.save());
    if (matchesBinding(event, keys.newDiagram)) return run(() => void this.newDiagram());
    if (matchesBinding(event, keys.openLibrary)) return run(() => this.libraryOpen.update((v) => !v));
    if (matchesBinding(event, keys.convert)) return run(() => this.convertTrigger()?.openMenu());
    if (event.key === 'Escape' && this.libraryOpen() && !this.aiOpen()) return run(() => this.libraryOpen.set(false));
  }

  protected toggleAi(): void {
    this.aiOpen.update((v) => !v);
    if (!this.aiOpen()) this.editor()?.focus();
  }

  protected closeAi(): void {
    this.aiOpen.set(false);
    this.editor()?.focus();
  }

  // -- documents ---------------------------------------------------------------
  /** Asks what to do with unsaved work. Resolves to false when the user cancels. */
  private async guardUnsaved(): Promise<boolean> {
    if (!this.ws.dirty() || !this.ws.source().trim()) return true;
    const choice = await this.confirm({
      title: this.t('confirm.unsaved.title'),
      text: this.t('confirm.unsaved.text', { name: this.ws.name() }),
      actions: [
        { id: 'cancel', label: this.t('action.cancel'), kind: 'ghost' },
        { id: 'discard', label: this.t('action.discard'), kind: 'danger' },
        { id: 'save', label: this.t('confirm.unsaved.save'), kind: 'primary' },
      ],
    });
    if (choice === 'save') {
      await this.ws.save();
      return true;
    }
    return choice === 'discard';
  }

  private confirm(data: ConfirmData): Promise<string | undefined> {
    return firstValueFrom(this.dialog.open<ConfirmDialog, ConfirmData, string>(ConfirmDialog, { data, width: '420px' }).afterClosed());
  }

  protected async newDiagram(): Promise<void> {
    const result = await firstValueFrom(
      this.dialog.open<NewDiagramDialog, unknown, NewDiagramResult>(NewDiagramDialog).afterClosed(),
    );
    if (!result || !(await this.guardUnsaved())) return;
    if (result === 'blank') this.ws.newBlank();
    else this.ws.newFromTemplate(result.languageId, result.diagramType);
    this.libraryOpen.set(false);
    this.editor()?.focus();
  }

  protected async open(diagram: StoredDiagramMeta): Promise<void> {
    if (diagram.id !== this.ws.id() && !(await this.guardUnsaved())) return;
    await this.ws.openDiagram(diagram.id);
    this.libraryOpen.set(false);
    this.editor()?.focus();
  }

  protected async save(): Promise<void> {
    try {
      await this.ws.save();
      this.snack.open(this.t('action.saved'));
    } catch (e) {
      this.snack.open(e instanceof Error ? e.message : String(e));
    }
  }

  protected async duplicate(): Promise<void> {
    await this.ws.duplicate();
    this.snack.open(this.t('action.saved'));
  }

  protected async remove(diagram: { id: string; name: string } | null = null): Promise<void> {
    const target = diagram ?? (this.ws.id() ? { id: this.ws.id()!, name: this.ws.name() } : null);
    if (!target) return;
    const choice = await this.confirm({
      title: this.t('confirm.delete.title'),
      text: this.t('confirm.delete.text', { name: target.name }),
      actions: [
        { id: 'cancel', label: this.t('action.cancel'), kind: 'ghost' },
        { id: 'delete', label: this.t('action.delete'), kind: 'danger' },
      ],
    });
    if (choice !== 'delete') return;
    await this.ws.deleteDiagram(target.id);
    this.snack.open(this.t('library.deleted', { name: target.name }));
  }

  protected async copySource(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.ws.source());
      this.snack.open(this.t('action.copied'));
    } catch {
      /* clipboard unavailable */
    }
  }

  protected commitName(input: HTMLInputElement): void {
    this.ws.rename(input.value);
    input.value = this.ws.name();
  }

  // -- conversion --------------------------------------------------------------
  protected convert(languageId: string, languageName: string): void {
    const before = this.ws.source();
    try {
      const { warnings } = this.ws.convert(languageId);
      const message = warnings.length
        ? this.t('convert.doneWarnings', { language: languageName, count: warnings.length })
        : this.t('convert.done', { language: languageName });
      const ref = this.snack.open(message, this.t('convert.undo'), { duration: 7000 });
      ref.onAction().subscribe(() => this.ws.setSource(before));
    } catch (e) {
      const message = e instanceof ConversionError || e instanceof Error ? e.message : String(e);
      this.snack.open(this.t('convert.failed', { message }), undefined, { duration: 6000 });
    }
  }

  // -- preview -----------------------------------------------------------------
  protected onLocate(path: RenderedElement[]): void {
    if (!this.ws.locate(path)) this.snack.open(this.t('preview.notLocated'), undefined, { duration: 2200 });
  }

  protected onExported(kind: 'svg' | 'png' | 'copy'): void {
    this.snack.open(this.t(kind === 'copy' ? 'action.copied' : 'preview.exported'), undefined, { duration: 2200 });
  }

  protected goTo(problem: Problem): void {
    this.ws.revealRange({ from: problem.diagnostic.from, to: problem.diagnostic.to });
  }

  // -- settings ----------------------------------------------------------------
  protected openSettings(): void {
    this.dialog.open(SettingsDialog);
  }

  // -- split -------------------------------------------------------------------
  private readSplit(): number {
    try {
      const value = Number(localStorage.getItem(SPLIT_KEY));
      if (value >= 20 && value <= 80) return value;
    } catch {
      /* ignore */
    }
    return 44;
  }

  private storeSplit(): void {
    try {
      localStorage.setItem(SPLIT_KEY, String(this.split()));
    } catch {
      /* ignore */
    }
  }

  protected startResize(event: PointerEvent, container: HTMLElement): void {
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    this.resizing.set(true);
    const move = (e: PointerEvent): void => {
      const rect = container.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      this.split.set(Math.round(Math.min(78, Math.max(22, percent)) * 10) / 10);
    };
    const stop = (): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      this.resizing.set(false);
      this.storeSplit();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  protected nudgeSplit(delta: number): void {
    this.split.update((v) => Math.min(78, Math.max(22, v + delta)));
    this.storeSplit();
  }

  protected resetSplit(): void {
    this.split.set(44);
    this.storeSplit();
  }
}
