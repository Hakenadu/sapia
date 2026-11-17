import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConversionError, DESKTOP_SHARE_BASE, LineIndex, ShareError, createShareCode, createShareLink, decodeSharedDiagram, sharePayloadFrom } from '@sapia/core';
import type { DiagramThemeMode, Diagnostic, ProjectInfo, RenderedElement, StoredDiagramMeta, TextRange, ThemePreference } from '@sapia/core';
import { firstValueFrom } from 'rxjs';
import { AiWidget } from './ai/ai-widget';
import { I18nService } from './core/i18n.service';
import { formatBinding, matchesBinding } from './core/keys';
import { SapiaService } from './core/sapia.service';
import { ProjectService } from './core/project.service';
import { ThemeService } from './core/theme.service';
import { WorkspaceService } from './core/workspace.service';
import { ConfirmDialog } from './dialogs/confirm-dialog';
import type { ConfirmData } from './dialogs/confirm-dialog';
import { NewDiagramDialog } from './dialogs/new-diagram-dialog';
import type { NewDiagramResult } from './dialogs/new-diagram-dialog';
import { SettingsDialog } from './dialogs/settings-dialog';
import { ShareDialog } from './dialogs/share-dialog';
import type { ShareDialogData } from './dialogs/share-dialog';
import { CodeEditor } from './editor/code-editor';
import { LegalService } from './legal/legal.service';
import { LibraryPanel } from './library/library-panel';
import { Home } from './home/home';
import type { QuickStart } from './home/home';
import { Onboarding } from './onboarding/onboarding';
import { Preview } from './preview/preview';
import { ConflictDialog } from './projects/conflict-dialog';
import type { ConflictDialogData } from './projects/conflict-dialog';
import { ProjectDialog } from './projects/project-dialog';
import type { ProjectDialogData } from './projects/project-dialog';
import { ProjectsDialog } from './projects/projects-dialog';
import { ProjectIcon } from './ui/project-icon';
import { Icon } from './ui/icon';
import type { IconName } from './ui/icon';
import { LanguageBadge } from './ui/language-badge';
import { Logo } from './ui/logo';

const SPLIT_KEY = 'sapia.split';

/** True when the event comes from a text field, where keys and paste belong to the field. */
function isTyping(event: Event): boolean {
  const target = event.target as HTMLElement | null;
  return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

interface Problem {
  diagnostic: Diagnostic;
  line: number;
  column: number;
}

/** The application shell: toolbar, editor / preview split, library, status bar. */
@Component({
  selector: 'sapia-root',
  imports: [AiWidget, CodeEditor, Home, Icon, LanguageBadge, LibraryPanel, Logo, MatMenuModule, MatTooltipModule, Onboarding, Preview, ProjectIcon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'onKeydown($event)',
    '(window:paste)': 'onPaste($event)',
    '(window:resize)': 'onResize()',
    '[attr.data-layout]': 'layout()',
    '[class.resizing]': 'resizing()',
  },
})
export class App {
  protected readonly sapia = inject(SapiaService);
  protected readonly ws = inject(WorkspaceService);
  protected readonly projects = inject(ProjectService);
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  protected readonly legal = inject(LegalService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly t = this.i18n.t;

  private readonly convertTrigger = viewChild<MatMenuTrigger>('convertTrigger');
  protected readonly editor = viewChild(CodeEditor);
  private readonly home = viewChild(Home);

  protected readonly libraryOpen = signal(false);
  protected readonly aiOpen = signal(false);
  protected readonly problemsOpen = signal(false);
  protected readonly resizing = signal(false);
  protected readonly split = signal(this.readSplit());

  // -- responsive layout -------------------------------------------------------
  private readonly windowSize = signal({ width: window.innerWidth, height: window.innerHeight });
  /**
   * `columns`: editor and preview side by side (desktop, landscape tablets).
   * `rows`: stacked (portrait tablets). `tabs`: one at a time (phones).
   */
  protected readonly layout = computed<'columns' | 'rows' | 'tabs'>(() => {
    const { width, height } = this.windowSize();
    if (width < 700) return 'tabs';
    if (width < 1000 && height > width) return 'rows';
    return 'columns';
  });
  /** Visible pane in the `tabs` layout. */
  protected readonly pane = signal<'editor' | 'preview'>('editor');
  /** Below this width the library floats over the workspace instead of pushing it aside. */
  protected readonly overlayLibrary = computed(() => this.windowSize().width < 1100);

  protected readonly themes: { id: ThemePreference; icon: IconName }[] = [
    { id: 'system', icon: 'system' },
    { id: 'light', icon: 'sun' },
    { id: 'dark', icon: 'moon' },
  ];
  protected readonly diagramThemes: { id: DiagramThemeMode; icon: IconName }[] = [
    { id: 'adaptive', icon: 'contrast' },
    { id: 'static', icon: 'palette' },
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
      document.title = this.ws.isOpen() ? `${this.ws.dirty() ? '● ' : ''}${this.ws.name()} – Sapia` : 'Sapia';
    });
    effect(() => {
      if (this.ws.diagnostics().length === 0) this.problemsOpen.set(false);
    });
    // Share links: the web app reads its own fragment, the desktop app gets links from the OS.
    setTimeout(() => this.openLinkFromLocation());
    window.addEventListener('hashchange', () => this.openLinkFromLocation());
    this.sapia.host?.onOpenLink((link) => void this.openSharedLink(link));
    // Git conflicts surface from saves and syncs: ask right away.
    effect(() => {
      const request = this.projects.conflictRequest();
      if (request) untracked(() => this.resolveConflicts(request.projectId));
    });
    effect(() => {
      const changed = this.projects.changed();
      if (changed) untracked(() => void this.ws.reloadFromProject(changed.projectId));
    });
  }

  // -- projects ----------------------------------------------------------------------
  private conflictDialogOpen = false;

  protected resolveConflicts(projectId: string): void {
    const project = this.projects.byId(projectId);
    if (!project || project.status.state !== 'conflict' || this.conflictDialogOpen) return;
    this.conflictDialogOpen = true;
    const ref = this.dialog.open<ConflictDialog, ConflictDialogData>(ConflictDialog, { data: { project }, autoFocus: false });
    ref.afterClosed().subscribe((status) => {
      this.conflictDialogOpen = false;
      if (status) this.snack.open(this.t('conflict.resolved'), undefined, { duration: 3500 });
    });
  }

  /** Creates a project; `forOpenDiagram` also moves the open diagram there. */
  protected async createProject(forOpenDiagram = false): Promise<void> {
    const project = await firstValueFrom(this.dialog.open<ProjectDialog, ProjectDialogData, ProjectInfo>(ProjectDialog, { data: {}, autoFocus: 'input' }).afterClosed());
    if (!project) return;
    if (forOpenDiagram) await this.moveOpenDiagram(project.id);
    else this.showProject(project.id);
    this.snack.open(this.t('project.created', { name: this.projects.name(project) }), undefined, { duration: 3500 });
  }

  protected manageProjects(): void {
    this.dialog.open(ProjectsDialog, { autoFocus: false });
  }

  /** Switches the library to a project and shows it. */
  protected showProject(projectId: string): void {
    this.projects.setActive(projectId);
    this.libraryOpen.set(true);
  }

  protected async moveOpenDiagram(projectId: string): Promise<void> {
    if (projectId === this.ws.projectId()) return;
    const name = this.projects.name(this.projects.byId(projectId));
    try {
      const saved = !!this.ws.id();
      await this.ws.moveTo(projectId);
      this.snack.open(this.t(saved ? 'project.moved' : 'project.willSaveTo', { name: this.ws.name(), project: name }), undefined, { duration: 3500 });
    } catch (e) {
      this.snack.open(this.t('project.moveFailed', { message: ProjectService.message(e) }), undefined, { duration: 6000 });
    }
  }

  protected async moveDiagram(diagram: StoredDiagramMeta, to: string): Promise<void> {
    try {
      await this.ws.moveDiagram(diagram.id, this.projects.activeId(), to);
      const project = this.projects.name(this.projects.byId(to));
      const ref = this.snack.open(this.t('project.moved', { name: diagram.name, project }), this.t('project.show'), { duration: 5000 });
      ref.onAction().subscribe(() => this.showProject(to));
    } catch (e) {
      this.snack.open(this.t('project.moveFailed', { message: ProjectService.message(e) }), undefined, { duration: 6000 });
    }
  }

  // -- sharing -------------------------------------------------------------------
  protected async share(): Promise<void> {
    const diagram = { name: this.ws.name(), source: this.ws.source() };
    // The desktop app shares sapia:// links it opens itself; the web app links to its own address.
    const desktop = !!this.sapia.host;
    const base = desktop ? DESKTOP_SHARE_BASE : location.href.split('#')[0];
    const [link, code] = await Promise.all([createShareLink(diagram, base), createShareCode(diagram)]);
    this.dialog.open<ShareDialog, ShareDialogData>(ShareDialog, { data: { mode: 'share', name: diagram.name, link, code, desktopLink: desktop } });
  }

  protected async openLinkDialog(error?: string): Promise<void> {
    const ref = this.dialog.open<ShareDialog, ShareDialogData, string>(ShareDialog, { data: { mode: 'open', error } });
    const link = await firstValueFrom(ref.afterClosed());
    if (link) await this.openSharedLink(link);
  }

  private openLinkFromLocation(): void {
    const legalDoc = this.sapia.host ? null : LegalService.fromFragment(location.hash);
    if (legalDoc) {
      history.replaceState(null, '', location.href.split('#')[0]);
      return this.legal.open(legalDoc);
    }
    if (this.sapia.host || !sharePayloadFrom(location.hash)) return;
    const link = location.href;
    // The diagram now lives in the working copy; keep it out of the address bar and history.
    history.replaceState(null, '', location.href.split('#')[0]);
    void this.openSharedLink(link);
  }

  private async openSharedLink(link: string): Promise<void> {
    const payload = sharePayloadFrom(link);
    if (!payload) return void this.snack.open(this.t('share.invalid'), undefined, { duration: 4000 });
    let diagram;
    try {
      diagram = await decodeSharedDiagram(payload);
    } catch (e) {
      const reason = e instanceof ShareError ? e.reason : 'damaged';
      return void this.snack.open(this.t(reason === 'version' ? 'share.version' : 'share.damaged'), undefined, { duration: 5000 });
    }
    if (!this.sapia.needsOnboarding() && !(await this.guardUnsaved())) return;
    const name = diagram.name.trim() || this.t('doc.untitled');
    this.ws.openShared(name, diagram.source);
    this.libraryOpen.set(false);
    this.focusEditor();
    this.snack.open(this.t('share.opened', { name }), undefined, { duration: 5000 });
  }

  protected onResize(): void {
    this.windowSize.set({ width: window.innerWidth, height: window.innerHeight });
  }

  protected showPane(pane: 'editor' | 'preview'): void {
    this.pane.set(pane);
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
    if (!this.ws.isOpen()) {
      // Start page: digits pick a quick-start template, unless the user is typing somewhere.
      const quickStart = /^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event) ? this.home()?.quickStart(Number(event.key) - 1) : undefined;
      if (quickStart) return run(() => this.startFrom(quickStart));
    }
    if (this.ws.isOpen() && matchesBinding(event, keys.save)) return run(() => void this.save());
    if (matchesBinding(event, keys.newDiagram)) return run(() => void this.newDiagram());
    if (matchesBinding(event, keys.openLibrary)) return run(() => this.libraryOpen.update((v) => !v));
    if (this.ws.isOpen() && matchesBinding(event, keys.convert)) return run(() => this.convertTrigger()?.openMenu());
    if (event.key === 'Escape' && this.libraryOpen() && !this.aiOpen()) return run(() => this.libraryOpen.set(false));
  }

  /** Pasting anywhere on the start page opens the clipboard: a share link or code, or diagram source. */
  protected onPaste(event: ClipboardEvent): void {
    if (this.ws.isOpen() || this.sapia.needsOnboarding() || this.dialog.openDialogs.length > 0 || isTyping(event)) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text.trim()) return;
    event.preventDefault();
    void this.openText(text);
  }

  protected async pasteFromClipboard(): Promise<void> {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      /* no clipboard access: fall back to the import dialog */
    }
    if (text.trim()) await this.openText(text);
    else await this.openLinkDialog();
  }

  protected async openFile(file: File): Promise<void> {
    if (file.size > 2_000_000) return void this.snack.open(this.t('home.file.tooLarge'), undefined, { duration: 4000 });
    let text: string;
    try {
      text = await file.text();
    } catch {
      return void this.snack.open(this.t('home.file.unreadable'), undefined, { duration: 4000 });
    }
    const name = file.name.replace(/\.[^.]+$/, '').trim();
    await this.openText(text, name || undefined, true);
  }

  /** Opens text from the clipboard or a file as a new, unsaved diagram. */
  private async openText(text: string, name?: string, force = false): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed.includes('\n') && (/^sapia1\./i.test(trimmed) || /[#&]d=/.test(trimmed)) && sharePayloadFrom(trimmed)) return this.openSharedLink(trimmed);
    const detection = this.sapia.core.languages.detect(text);
    const open = (): void => {
      const title = name ?? (detection && detection.diagramType !== 'unknown' ? this.i18n.diagramType(detection.diagramType) : this.t('doc.untitled'));
      this.ws.openShared(title, text);
      this.libraryOpen.set(false);
      this.focusEditor();
    };
    if (detection || force) {
      open();
      const language = this.sapia.core.languages.get(detection?.languageId)?.name;
      this.snack.open(language ? this.t('home.pasted', { language }) : this.t('home.pastedPlain'), undefined, { duration: 4000 });
      return;
    }
    const ref = this.snack.open(this.t('home.pasteUnknown'), this.t('home.pasteAnyway'), { duration: 6000 });
    ref.onAction().subscribe(open);
  }

  protected onInstallCopied(): void {
    this.snack.open(this.t('action.copied'), undefined, { duration: 2200 });
  }

  protected startFrom(item: QuickStart): void {
    this.ws.newFromTemplate(item.languageId, item.diagramType);
    this.libraryOpen.set(false);
    this.focusEditor();
  }

  /** Closes the open diagram (asking about unsaved changes) and shows the start page. */
  protected async closeDiagram(): Promise<void> {
    if (!(await this.guardUnsaved())) return;
    this.ws.close();
    this.aiOpen.set(false);
    this.problemsOpen.set(false);
  }

  /** Logo click: back to the start page, via the same unsaved-changes guard as "Close diagram". */
  protected async goHome(): Promise<void> {
    if (this.ws.isOpen()) {
      if (!(await this.guardUnsaved())) return;
      this.ws.close();
    }
    this.aiOpen.set(false);
    this.problemsOpen.set(false);
    this.libraryOpen.set(false);
  }

  /** The editor only exists while a diagram is open; wait for it to render. */
  private focusEditor(): void {
    setTimeout(() => this.editor()?.focus());
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
    this.focusEditor();
  }

  protected async open(diagram: StoredDiagramMeta & { projectId?: string }): Promise<void> {
    const projectId = diagram.projectId ?? this.projects.activeId();
    const same = diagram.id === this.ws.id() && projectId === this.ws.projectId();
    if (!same && !(await this.guardUnsaved())) return;
    if (!same) await this.ws.openDiagram(diagram.id, projectId);
    this.libraryOpen.set(false);
    this.focusEditor();
  }

  protected async save(): Promise<void> {
    try {
      await this.ws.save();
      const project = this.ws.project();
      const name = this.projects.name(project);
      switch (project?.location.type === 'git' ? project.status.state : 'local') {
        case 'synced':
          return void this.snack.open(this.t('project.saved.pushed', { project: name, branch: project?.status.branch ?? '' }), undefined, { duration: 3000 });
        case 'offline':
        case 'pending':
        case 'error':
          return void this.snack.open(this.t('project.saved.local', { project: name }), undefined, { duration: 5000 });
        case 'conflict':
          return;
        default:
          this.snack.open(this.t('project.saved', { project: name }), undefined, { duration: 2500 });
      }
    } catch (e) {
      this.snack.open(ProjectService.message(e), undefined, { duration: 6000 });
    }
  }

  protected async duplicate(): Promise<void> {
    await this.ws.duplicate();
    this.snack.open(this.t('action.saved'));
  }

  protected async remove(diagram: { id: string; name: string } | null = null): Promise<void> {
    const target = diagram
      ? { ...diagram, projectId: this.projects.activeId() }
      : this.ws.id()
        ? { id: this.ws.id()!, name: this.ws.name(), projectId: this.ws.projectId() }
        : null;
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
    await this.ws.deleteDiagram(target.id, target.projectId);
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
    // On phones the editor is hidden behind the preview: bring it forward to show the source.
    else if (this.layout() === 'tabs') this.pane.set('editor');
  }

  protected onExported(kind: 'svg' | 'png' | 'copy'): void {
    this.snack.open(this.t(kind === 'copy' ? 'action.copied' : 'preview.exported'), undefined, { duration: 2200 });
  }

  protected goTo(problem: Problem): void {
    this.pane.set('editor');
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
      const percent = this.layout() === 'rows' ? ((e.clientY - rect.top) / rect.height) * 100 : ((e.clientX - rect.left) / rect.width) * 100;
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
