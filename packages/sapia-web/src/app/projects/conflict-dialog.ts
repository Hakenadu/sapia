import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { ConflictResolution, DiagramConflict, ProjectInfo, ProjectStatus } from '@sapia/core';
import { I18nService } from '../core/i18n.service';
import { ProjectService } from '../core/project.service';
import { Icon } from '../ui/icon';
import type { IconName } from '../ui/icon';
import { ProjectIcon } from '../ui/project-icon';

export interface ConflictDialogData {
  project: ProjectInfo;
}

interface Line {
  text: string;
  number: number;
  /** Not present in the other version. */
  changed: boolean;
  /** Stands for unchanged lines that are left out. */
  gap?: boolean;
}

const CONTEXT = 2;

/** The lines of one version around what differs from the other, with gaps for the rest. */
function lines(source: string | null, other: string | null): Line[] | null {
  if (source === null) return null;
  const others = new Set((other ?? '').split('\n').map((l) => l.trimEnd()));
  const all = source.replace(/\n$/, '').split('\n').map((text, i) => ({ text, number: i + 1, changed: !others.has(text.trimEnd()) }));
  if (!all.some((l) => l.changed)) return all;
  const keep = all.map((_, i) => all.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some((l) => l.changed));
  const result: Line[] = [];
  all.forEach((line, i) => {
    if (keep[i]) result.push(line);
    else if (keep[i - 1] || i === 0) result.push({ text: '', number: 0, changed: false, gap: true });
  });
  return result;
}

/** Lets the user decide, diagram by diagram, which version wins after a Git conflict. */
@Component({
  selector: 'sapia-conflict-dialog',
  imports: [Icon, ProjectIcon],
  template: `
    <header>
      <span class="badge"><sapia-icon name="merge" [size]="20" /></span>
      <div>
        <h2>{{ t('conflict.title') }}</h2>
        <p>{{ t('conflict.subtitle', { project: projects.name(data.project) }) }}</p>
      </div>
      <button class="icon-button close" (click)="ref.close()" [attr.aria-label]="t('action.close')"><sapia-icon name="close" /></button>
    </header>

    <div class="list">
      @for (item of items(); track item.conflict.id) {
        <section class="conflict">
          <div class="conflict-head">
            <sapia-project-icon [type]="data.project.location.type" [size]="26" />
            <strong>{{ item.conflict.name }}</strong>
            <span class="file">{{ item.conflict.id }}</span>
          </div>

          <div class="versions">
            @for (side of sides; track side.id) {
              <div class="version" [class.chosen]="isShown(item.conflict.id, side.id)" [attr.data-side]="side.id">
                <div class="version-head">
                  <sapia-icon [name]="side.icon" [size]="13" />
                  {{ t('conflict.' + side.id) }}
                  @if (isShown(item.conflict.id, side.id)) {
                    <span class="kept">{{ t('conflict.kept') }}</span>
                  }
                </div>
                @if (side.id === 'mine' ? item.mine : item.theirs; as rows) {
                  <pre><code>@for (row of rows; track $index) {@if (row.gap) {<span class="gap">⋯</span>} @else {<span [class.changed]="row.changed"><i>{{ row.number }}</i>{{ row.text || ' ' }}</span>}}</code></pre>
                } @else {
                  <div class="deleted"><sapia-icon name="trash" [size]="14" /> {{ t('conflict.deleted') }}</div>
                }
              </div>
            }
          </div>

          <div class="choices" role="radiogroup" [attr.aria-label]="t('conflict.choose', { name: item.conflict.name })">
            @for (choice of choices; track choice) {
              <button role="radio" [class.selected]="choiceOf(item.conflict.id) === choice" [attr.aria-checked]="choiceOf(item.conflict.id) === choice" (click)="choose(item.conflict.id, choice)">
                <strong>{{ t('conflict.choice.' + choice) }}</strong>
                <small>{{ t('conflict.choice.' + choice + '.hint') }}</small>
              </button>
            }
          </div>
        </section>
      }
    </div>

    @if (error(); as message) {
      <div class="error" role="alert"><sapia-icon name="error" [size]="15" /> {{ message }}</div>
    }

    <footer>
      <span class="note"><sapia-icon name="info" [size]="14" /> {{ t('conflict.note') }}</span>
      <button class="text-button ghost" (click)="ref.close()">{{ t('conflict.later') }}</button>
      <button class="text-button primary" [disabled]="busy()" (click)="apply()">
        @if (busy()) {
          <sapia-icon class="spin" name="loader" [size]="14" />
        }
        {{ t('conflict.apply') }}
      </button>
    </footer>
  `,
  styleUrl: './conflict-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConflictDialog {
  protected readonly data = inject<ConflictDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<ConflictDialog, ProjectStatus>>(MatDialogRef);
  protected readonly projects = inject(ProjectService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  protected readonly sides: { id: 'mine' | 'theirs'; icon: IconName }[] = [
    { id: 'mine', icon: 'pencil' },
    { id: 'theirs', icon: 'globe' },
  ];
  protected readonly choices: ConflictResolution[] = ['mine', 'theirs', 'both'];
  private readonly resolutions = signal<Record<string, ConflictResolution>>({});
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly items = computed(() =>
    (this.data.project.status.conflicts ?? []).map((conflict: DiagramConflict) => ({
      conflict,
      mine: lines(conflict.mine, conflict.theirs),
      theirs: lines(conflict.theirs, conflict.mine),
    })),
  );

  protected choiceOf(id: string): ConflictResolution {
    // Keeping both never loses work, so it is the default.
    return this.resolutions()[id] ?? 'both';
  }

  protected isShown(id: string, side: 'mine' | 'theirs'): boolean {
    const choice = this.choiceOf(id);
    return choice === 'both' || choice === side;
  }

  protected choose(id: string, choice: ConflictResolution): void {
    this.resolutions.update((r) => ({ ...r, [id]: choice }));
  }

  protected async apply(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const resolutions = Object.fromEntries(this.items().map((i) => [i.conflict.id, this.choiceOf(i.conflict.id)]));
      const status = await this.projects.resolveConflicts(this.data.project.id, resolutions);
      if (status.state === 'conflict' || status.state === 'error') this.error.set(status.message ?? this.t('project.status.error'));
      else this.ref.close(status);
    } catch (e) {
      this.error.set(ProjectService.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}
