import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { ProjectInfo, ProjectLocation, ProjectLocationType } from '@sapia/core';
import { I18nService } from '../core/i18n.service';
import { ProjectService } from '../core/project.service';
import { SapiaService } from '../core/sapia.service';
import { Icon } from '../ui/icon';
import { ProjectIcon } from '../ui/project-icon';

export interface ProjectDialogData {
  /** The project to edit; a new one is created without it. */
  project?: ProjectInfo;
}

const ALL_TYPES: ProjectLocationType[] = ['local-storage', 'directory', 'git'];

/** Creates a project or edits its name and description. */
@Component({
  selector: 'sapia-project-dialog',
  imports: [Icon, ProjectIcon],
  templateUrl: './project-dialog.html',
  styleUrl: './project-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDialog {
  protected readonly ref = inject<MatDialogRef<ProjectDialog, ProjectInfo>>(MatDialogRef);
  private readonly data = inject<ProjectDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  protected readonly projects = inject(ProjectService);
  protected readonly sapia = inject(SapiaService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  protected readonly existing = this.data?.project ?? null;
  protected readonly editing = !!this.existing;
  protected readonly desktop = !!this.sapia.host;

  protected readonly name = signal(this.existing ? this.projects.name(this.existing) : '');
  protected readonly description = signal(this.existing?.description ?? '');
  protected readonly type = signal<ProjectLocationType>(this.existing?.location.type ?? this.projects.locationTypes()[0] ?? 'local-storage');
  protected readonly path = signal('');
  protected readonly url = signal('');
  protected readonly branch = signal('');
  protected readonly folder = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly touched = signal(false);

  /** Every kind of project; the ones this app cannot create are shown as a hint to Sapia Desktop. */
  protected readonly types = computed(() => {
    const available = this.projects.locationTypes();
    return ALL_TYPES.filter((type) => available.includes(type) || (!this.desktop && type !== 'local-storage')).map((type) => ({ type, available: available.includes(type) }));
  });

  protected readonly location = computed<ProjectLocation | null>(() => {
    switch (this.type()) {
      case 'local-storage':
        return { type: 'local-storage' };
      case 'directory':
        return this.path().trim() ? { type: 'directory', path: this.path().trim() } : null;
      case 'git':
        return this.url().trim() ? { type: 'git', url: this.url().trim(), branch: this.branch().trim() || undefined, directory: this.folder().trim() || undefined } : null;
    }
  });

  protected readonly valid = computed(() => !!this.name().trim() && (this.editing || !!this.location()));

  protected read(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected choose(type: ProjectLocationType, available: boolean): void {
    if (!available || this.editing) return;
    this.type.set(type);
    this.error.set(null);
  }

  protected async browse(): Promise<void> {
    const picked = await this.sapia.host?.projects.pickDirectory(this.path() || undefined);
    if (!picked) return;
    this.path.set(picked);
    // Name the project after the folder unless the user typed a name.
    if (!this.name().trim()) this.name.set(picked.split(/[\\/]/).filter(Boolean).pop() ?? '');
  }

  protected suggestNameFromUrl(): void {
    if (this.name().trim()) return;
    const repo = this.url().trim().replace(/\.git$/, '').split(/[/:]/).filter(Boolean).pop();
    if (repo) this.name.set(repo);
  }

  protected async submit(): Promise<void> {
    this.touched.set(true);
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const location = this.existing ? this.existing.location : this.location()!;
      const project = await this.projects.save({
        id: this.existing?.id,
        name: this.name().trim(),
        description: this.description().trim() || undefined,
        location,
      });
      this.ref.close(project);
    } catch (e) {
      this.error.set(ProjectService.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}
