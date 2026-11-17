import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { SafeHtml } from '@angular/platform-browser';
import { ProjectService } from '../core/project.service';
import type { ProjectDiagram } from '../core/project.service';
import { glyphMarkup } from '../dialogs/diagram-glyphs';
import { LegalService } from '../legal/legal.service';
import { I18nService } from '../core/i18n.service';
import { formatBinding } from '../core/keys';
import { SapiaService } from '../core/sapia.service';
import { WorkspaceService } from '../core/workspace.service';
import { Icon } from '../ui/icon';
import type { IconName } from '../ui/icon';
import { LanguageBadge } from '../ui/language-badge';
import { Logo } from '../ui/logo';
import { ProjectIcon } from '../ui/project-icon';

const PROMO_KEY = 'sapia.home.desktopPromo';
export const DESKTOP_INSTALL_COMMAND = 'npm i -g @sapia/desktop';
const DESKTOP_URL = 'https://github.com/Hakenadu/sapia/tree/main/packages/sapia-desktop#readme';

/** Preferred quick-start templates, in order; missing languages or types are skipped. */
const QUICK_STARTS: { languageId: string; diagramType: string }[] = [
  { languageId: 'plantuml', diagramType: 'sequence' },
  { languageId: 'plantuml', diagramType: 'class' },
  { languageId: 'mermaid', diagramType: 'flowchart' },
  { languageId: 'mermaid', diagramType: 'mindmap' },
  { languageId: 'mermaid', diagramType: 'state' },
  { languageId: 'plantuml', diagramType: 'activity' },
];

export interface QuickStart {
  languageId: string;
  languageName: string;
  diagramType: string;
}

interface Action {
  id: 'new' | 'library' | 'ai' | 'file' | 'paste';
  icon: IconName;
  keys: string[];
}

/**
 * Start page, shown while no diagram is open: first visit, after closing,
 * discarding or deleting the open diagram.
 */
@Component({
  selector: 'sapia-home',
  imports: [Icon, LanguageBadge, Logo, ProjectIcon],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.dragging]': 'dragging()',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class Home {
  protected readonly i18n = inject(I18nService);
  protected readonly sapia = inject(SapiaService);
  protected readonly ws = inject(WorkspaceService);
  protected readonly projects = inject(ProjectService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly legal = inject(LegalService);
  protected readonly year = new Date().getFullYear();
  protected readonly t = this.i18n.t;

  readonly created = output<void>();
  readonly templateChosen = output<QuickStart>();
  readonly libraryRequested = output<void>();
  readonly opened = output<ProjectDiagram>();
  readonly projectChosen = output<string>();
  readonly createProject = output<void>();
  readonly manageProjects = output<void>();
  readonly aiRequested = output<void>();
  readonly pasteRequested = output<void>();
  readonly fileDropped = output<File>();
  readonly installCopied = output<void>();

  protected readonly desktop = !!this.sapia.host;
  protected readonly desktopUrl = DESKTOP_URL;
  protected readonly installCommand = DESKTOP_INSTALL_COMMAND;
  protected readonly dragging = signal(false);
  protected readonly promoVisible = signal(!this.desktop && this.readPromo());
  protected readonly installCopiedFlag = signal(false);

  protected readonly greeting = computed(() => {
    this.i18n.locale();
    const hour = new Date().getHours();
    return this.t(hour < 5 ? 'home.greeting.night' : hour < 11 ? 'home.greeting.morning' : hour < 18 ? 'home.greeting.day' : 'home.greeting.evening');
  });

  protected readonly actions = computed<Action[]>(() => {
    const k = this.sapia.config().keybindings;
    return [
      { id: 'new', icon: 'new', keys: formatBinding(k.newDiagram) },
      { id: 'library', icon: 'library', keys: formatBinding(k.openLibrary) },
      this.desktop ? { id: 'ai', icon: 'sparkles', keys: formatBinding(k.aiAssistant) } : { id: 'file', icon: 'open', keys: [] },
      { id: 'paste', icon: 'clipboard', keys: formatBinding('Mod-v') },
    ];
  });

  protected readonly aiKeys = computed(() => formatBinding(this.sapia.config().keybindings.aiAssistant));

  protected readonly quickStarts = computed<QuickStart[]>(() => {
    this.sapia.registryVersion();
    const languages = this.sapia.core.languages;
    return QUICK_STARTS.flatMap(({ languageId, diagramType }) => {
      const language = languages.get(languageId);
      const available = language?.diagramTypes.some((t) => t.id === diagramType && t.template);
      return language && available ? [{ languageId, languageName: language.name, diagramType }] : [];
    }).slice(0, 6);
  });

  /** Recently edited diagrams across all projects. */
  protected readonly recent = computed(() => this.projects.recent().slice(0, 4));
  protected readonly multipleProjects = computed(() => this.projects.projects().length > 1);

  protected readonly shortcuts = computed(() => {
    const k = this.sapia.config().keybindings;
    const items: { label: string; keys: string[] }[] = [
      { label: this.t('home.keys.save'), keys: formatBinding(k.save) },
      { label: this.t('home.keys.convert'), keys: formatBinding(k.convert) },
      { label: this.t('home.keys.find'), keys: formatBinding('Mod-f') },
      { label: this.t('home.keys.complete'), keys: formatBinding('Ctrl-Space') },
    ];
    if (this.desktop) items.unshift({ label: this.t('home.keys.ai'), keys: formatBinding(k.aiAssistant) });
    return items;
  });

  /** The quick-start template behind digit key `index + 1`. */
  quickStart(index: number): QuickStart | undefined {
    return this.quickStarts()[index];
  }

  private readonly glyphs = new Map<string, SafeHtml>();

  protected glyph(type: string): SafeHtml {
    let value = this.glyphs.get(type);
    if (!value) {
      // Bundled artwork only, never user content.
      value = this.sanitizer.bypassSecurityTrustHtml(glyphMarkup(type));
      this.glyphs.set(type, value);
    }
    return value;
  }

  protected languageName(id: string | undefined): string | undefined {
    return this.sapia.core.languages.get(id)?.name;
  }

  protected run(action: Action['id'], fileInput: HTMLInputElement): void {
    switch (action) {
      case 'new':
        return this.created.emit();
      case 'library':
        return this.libraryRequested.emit();
      case 'ai':
        return this.aiRequested.emit();
      case 'file':
        return fileInput.click();
      case 'paste':
        return this.pasteRequested.emit();
    }
  }

  protected onFileChosen(input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (file) this.fileDropped.emit(file);
    input.value = '';
  }

  // -- drag and drop -----------------------------------------------------------
  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    // Leaving a child element still keeps the pointer inside the page.
    if (event.relatedTarget && (event.currentTarget as Node).contains(event.relatedTarget as Node)) return;
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.fileDropped.emit(file);
  }

  // -- desktop promotion ---------------------------------------------------------
  protected async copyInstall(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.installCommand);
      this.installCopiedFlag.set(true);
      this.installCopied.emit();
      setTimeout(() => this.installCopiedFlag.set(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  protected setPromo(visible: boolean): void {
    this.promoVisible.set(visible);
    try {
      localStorage.setItem(PROMO_KEY, visible ? 'shown' : 'hidden');
    } catch {
      /* ignore */
    }
  }

  private readPromo(): boolean {
    try {
      return localStorage.getItem(PROMO_KEY) !== 'hidden';
    } catch {
      return true;
    }
  }
}
