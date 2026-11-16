import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { StoredDiagramMeta } from '@sapia/core';
import { I18nService } from '../core/i18n.service';
import { SapiaService } from '../core/sapia.service';
import { WorkspaceService } from '../core/workspace.service';
import { Icon } from '../ui/icon';
import { LanguageBadge } from '../ui/language-badge';

/** Slide-over list of saved diagrams. */
@Component({
  selector: 'sapia-library-panel',
  imports: [Icon, LanguageBadge, MatTooltipModule],
  template: `
    <header>
      <h2>{{ t('library.title') }}</h2>
      <span class="count">{{ t('library.count', { count: workspace.library().length }) }}</span>
      <button class="icon-button" (click)="closed.emit()" [matTooltip]="t('action.close')" [attr.aria-label]="t('action.close')">
        <sapia-icon name="panel-close" />
      </button>
    </header>

    <label class="search">
      <sapia-icon name="search" [size]="15" />
      <input #q type="search" [placeholder]="t('library.search')" [value]="query()" (input)="query.set(q.value)" />
    </label>

    <div class="list">
      @for (diagram of filtered(); track diagram.id) {
        <div class="item" [class.current]="diagram.id === workspace.id()" role="button" tabindex="0" (click)="opened.emit(diagram)" (keydown.enter)="opened.emit(diagram)">
          <sapia-language-badge [languageId]="diagram.languageId" [name]="languageName(diagram.languageId)" [size]="34" />
          <div class="meta">
            <div class="name">{{ diagram.name }}</div>
            <div class="sub">
              <span>{{ i18n.diagramType(diagram.diagramType) }}</span>
              <span class="dot"></span>
              <span>{{ i18n.relativeTime(diagram.updatedAt) }}</span>
            </div>
          </div>
          <button class="icon-button delete" (click)="$event.stopPropagation(); deleted.emit(diagram)" [matTooltip]="t('action.delete')" [attr.aria-label]="t('action.delete')">
            <sapia-icon name="trash" [size]="15" />
          </button>
        </div>
      } @empty {
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
  protected readonly i18n = inject(I18nService);
  private readonly sapia = inject(SapiaService);
  protected readonly t = this.i18n.t;

  readonly opened = output<StoredDiagramMeta>();
  readonly deleted = output<StoredDiagramMeta>();
  readonly created = output<void>();
  readonly closed = output<void>();

  protected readonly query = signal('');
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
