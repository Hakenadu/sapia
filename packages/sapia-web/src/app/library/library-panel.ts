import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ProjectInfo, StoredDiagramMeta } from '@sapia/core';
import { I18nService } from '../core/i18n.service';
import { ProjectService } from '../core/project.service';
import { SapiaService } from '../core/sapia.service';
import { WorkspaceService } from '../core/workspace.service';
import { Icon } from '../ui/icon';
import { LanguageBadge } from '../ui/language-badge';
import { ProjectIcon } from '../ui/project-icon';

/** Slide-over list of saved diagrams. */
@Component({
  selector: 'sapia-library-panel',
  imports: [Icon, LanguageBadge, MatMenuModule, MatTooltipModule, ProjectIcon],
  template: `
    <header>
      <h2>{{ t('library.title') }}</h2>
      <span class="count">{{ t('library.count', { count: workspace.library().length }) }}</span>
      <button class="icon-button" (click)="closed.emit()" [matTooltip]="t('action.close')" [attr.aria-label]="t('action.close')">
        <sapia-icon name="panel-close" />
      </button>
    </header>

    @if (projects.active(); as project) {
      @let status = projects.statusOf(project);
      <div class="project" [attr.data-tone]="status.tone">
        <button class="switcher" [matMenuTriggerFor]="projectMenu" [attr.aria-label]="t('project.switch')">
          <sapia-project-icon [type]="project.location.type" [isDefault]="project.isDefault" [size]="34" />
          <span class="project-text">
            <strong>{{ projects.name(project) }}</strong>
            <small>
              @if (project.location.type === 'local-storage' || project.status.state === 'local') {
                {{ t(project.isDefault ? 'project.type.default' : 'project.type.' + project.location.type) }}
              } @else {
                <span class="status" [title]="status.detail ?? status.label"><sapia-icon [name]="status.icon" [size]="11" [class.spin]="status.tone === 'busy'" /> {{ status.short ?? status.label }}</span>
                @if (project.status.branch) {
                  <span class="branch"><sapia-icon name="branch" [size]="11" /> {{ project.status.branch }}</span>
                }
              }
            </small>
          </span>
          <sapia-icon class="chevron" name="chevron-down" [size]="14" />
        </button>
        @if (project.location.type === 'git') {
          @if (project.status.state === 'conflict') {
            <button class="icon-button conflict" (click)="conflictRequested.emit(project.id)" [matTooltip]="t('conflict.resolve')" [attr.aria-label]="t('conflict.resolve')">
              <sapia-icon name="merge" [size]="15" />
            </button>
          } @else {
            <button class="icon-button" (click)="sync(project)" [disabled]="status.tone === 'busy'" [matTooltip]="status.detail ?? t('project.sync')" [attr.aria-label]="t('project.sync')">
              <sapia-icon name="sync" [size]="15" [class.spin]="status.tone === 'busy'" />
            </button>
          }
        }
      </div>
    }

    <mat-menu #projectMenu="matMenu" class="project-menu">
      <div class="menu-caption">{{ t('project.menu.caption') }}</div>
      @for (project of projects.projects(); track project.id) {
        <button mat-menu-item class="menu-rich" (click)="projects.setActive(project.id)">
          <sapia-project-icon [type]="project.location.type" [isDefault]="project.isDefault" [size]="26" />
          <span class="menu-label">
            {{ projects.name(project) }}
            <small>{{ t('library.count', { count: count(project) }) }} · {{ t(project.isDefault ? 'project.type.default' : 'project.type.' + project.location.type) }}</small>
          </span>
          @if (project.id === projects.activeId()) {
            <sapia-icon class="menu-trailing" name="check" [size]="14" />
          }
        </button>
      }
      <div class="menu-divider"></div>
      <button mat-menu-item (click)="createProject.emit()"><sapia-icon name="folder-plus" /> <span class="menu-label">{{ t('project.new') }}</span></button>
      <button mat-menu-item (click)="manageProjects.emit()"><sapia-icon name="settings" /> <span class="menu-label">{{ t('project.manage') }}</span></button>
    </mat-menu>

    <mat-menu #moveMenu="matMenu" xPosition="before">
      <div class="menu-caption">{{ t('project.moveTo') }}</div>
      @for (project of moveTargets(); track project.id) {
        <button mat-menu-item (click)="moveTarget() && moved.emit({ diagram: moveTarget()!, to: project.id })">
          <sapia-project-icon [type]="project.location.type" [isDefault]="project.isDefault" [size]="22" />
          <span class="menu-label">{{ projects.name(project) }}</span>
        </button>
      } @empty {
        <div class="menu-empty">
          <strong>{{ t('project.moveNone') }}</strong>
          <span>{{ t('project.moveNoneHint') }}</span>
        </div>
      }
    </mat-menu>

    <label class="search">
      <sapia-icon name="search" [size]="15" />
      <input #q type="search" [placeholder]="t('library.search')" [value]="query()" (input)="query.set(q.value)" />
    </label>

    <div class="list">
      @if (draftHere()) {
        <div class="item draft current" role="button" tabindex="0" (click)="closed.emit()" (keydown.enter)="closed.emit()">
          <sapia-language-badge [languageId]="workspace.language()?.id" [name]="workspace.language()?.name" [size]="34" />
          <div class="meta">
            <div class="name">{{ workspace.name() }}</div>
            <div class="sub"><span class="unsaved-pill"><i></i>{{ t('doc.notSaved') }}</span></div>
          </div>
        </div>
      }
      @for (diagram of filtered(); track diagram.id) {
        <div class="item" [class.current]="diagram.id === workspace.id() && workspace.projectId() === projects.activeId()" role="button" tabindex="0" (click)="opened.emit(diagram)" (keydown.enter)="opened.emit(diagram)">
          <sapia-language-badge [languageId]="diagram.languageId" [name]="languageName(diagram.languageId)" [size]="34" />
          <div class="meta">
            <div class="name">{{ diagram.name }}</div>
            <div class="sub">
              <span>{{ i18n.diagramType(diagram.diagramType) }}</span>
              <span class="dot"></span>
              <span>{{ i18n.relativeTime(diagram.updatedAt) }}</span>
            </div>
          </div>
          @if (workspace.id() === diagram.id && workspace.dirty()) {
            <span class="unsaved-dot" [matTooltip]="t('doc.unsaved')"></span>
          }
          <span class="item-actions">
          <button class="icon-button move" [matMenuTriggerFor]="moveMenu" (menuOpened)="moveTarget.set(diagram)" (click)="$event.stopPropagation()" [matTooltip]="t('project.move')" [attr.aria-label]="t('project.move')">
            <sapia-icon name="folder-input" [size]="15" />
          </button>
          <button class="icon-button delete" (click)="$event.stopPropagation(); deleted.emit(diagram)" [matTooltip]="t('action.delete')" [attr.aria-label]="t('action.delete')">
            <sapia-icon name="trash" [size]="15" />
          </button>
          </span>
        </div>
      } @empty {
        @if (!draftHere()) {
        <div class="empty">
          @if (workspace.library().length === 0) {
            <div class="glyph"><sapia-icon name="library" [size]="24" [stroke]="1.5" /></div>
            <h3>{{ t('library.empty.title') }}</h3>
            <p>{{ t('library.empty.text') }}</p>
          } @else {
            <p>{{ t('library.noMatch', { query: query() }) }}</p>
          }
        </div>
        }
      }
    </div>

    <footer>
      <button class="text-button primary" (click)="created.emit()">
        <sapia-icon name="plus" [size]="15" />
        {{ t('action.new') }}
      </button>
    </footer>
  `,
  styleUrl: './library-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryPanel {
  protected readonly workspace = inject(WorkspaceService);
  protected readonly projects = inject(ProjectService);
  protected readonly i18n = inject(I18nService);
  private readonly sapia = inject(SapiaService);
  protected readonly t = this.i18n.t;

  readonly opened = output<StoredDiagramMeta>();
  readonly deleted = output<StoredDiagramMeta>();
  readonly moved = output<{ diagram: StoredDiagramMeta; to: string }>();
  readonly createProject = output<void>();
  readonly manageProjects = output<void>();
  readonly conflictRequested = output<string>();
  readonly created = output<void>();
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly moveTarget = signal<StoredDiagramMeta | null>(null);
  protected readonly moveTargets = computed(() => this.projects.projects().filter((p) => p.id !== this.projects.activeId()));
  /** The open diagram is new and will be saved to the shown project. */
  protected readonly draftHere = computed(
    () => this.workspace.isOpen() && !this.workspace.id() && this.workspace.projectId() === this.projects.activeId() && !this.query().trim(),
  );

  protected count(project: ProjectInfo): number {
    return this.projects.diagrams()[project.id]?.length ?? 0;
  }

  protected async sync(project: ProjectInfo): Promise<void> {
    const status = await this.projects.sync(project.id);
    if (status?.state === 'conflict') this.conflictRequested.emit(project.id);
  }
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.workspace.library();
    if (!q) return all;
    return all.filter((d) => `${d.name} ${d.languageId ?? ''} ${this.i18n.diagramType(d.diagramType)}`.toLowerCase().includes(q));
  });

  protected languageName(id: string | undefined): string | undefined {
    return this.sapia.core.languages.get(id)?.name;
  }
}
