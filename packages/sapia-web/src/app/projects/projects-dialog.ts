import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ProjectInfo, ProjectRemoval } from '@sapia/core';
import { firstValueFrom } from 'rxjs';
import { I18nService } from '../core/i18n.service';
import { ProjectService } from '../core/project.service';
import { SapiaService } from '../core/sapia.service';
import { ConfirmDialog } from '../dialogs/confirm-dialog';
import type { ConfirmData } from '../dialogs/confirm-dialog';
import { Icon } from '../ui/icon';
import { ProjectIcon } from '../ui/project-icon';
import { ConflictDialog } from './conflict-dialog';
import type { ConflictDialogData } from './conflict-dialog';
import { ProjectDialog } from './project-dialog';
import type { ProjectDialogData } from './project-dialog';

/** Overview of all projects: switch, create, edit, synchronise and remove them. */
@Component({
  selector: 'sapia-projects-dialog',
  imports: [Icon, MatTooltipModule, ProjectIcon],
  templateUrl: './projects-dialog.html',
  styleUrl: './projects-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsDialog {
  protected readonly ref = inject<MatDialogRef<ProjectsDialog>>(MatDialogRef);
  protected readonly projects = inject(ProjectService);
  protected readonly sapia = inject(SapiaService);
  protected readonly i18n = inject(I18nService);
  private readonly dialog = inject(MatDialog);
  protected readonly t = this.i18n.t;
  protected readonly desktop = !!this.sapia.host;

  protected count(project: ProjectInfo): number {
    return this.projects.diagrams()[project.id]?.length ?? 0;
  }

  protected activate(project: ProjectInfo): void {
    this.projects.setActive(project.id);
    this.ref.close();
  }

  protected async create(): Promise<void> {
    const project = await firstValueFrom(this.dialog.open<ProjectDialog, ProjectDialogData, ProjectInfo>(ProjectDialog, { data: {}, autoFocus: 'input' }).afterClosed());
    if (project) this.projects.setActive(project.id);
  }

  protected edit(project: ProjectInfo): void {
    this.dialog.open<ProjectDialog, ProjectDialogData, ProjectInfo>(ProjectDialog, { data: { project }, autoFocus: 'input' });
  }

  protected reveal(project: ProjectInfo): void {
    void this.sapia.host?.projects.revealProject(project.id);
  }

  protected async sync(project: ProjectInfo): Promise<void> {
    const status = await this.projects.sync(project.id);
    if (status?.state === 'conflict') this.resolve(project.id);
  }

  protected resolve(projectId: string): void {
    const project = this.projects.byId(projectId);
    if (project) this.dialog.open<ConflictDialog, ConflictDialogData>(ConflictDialog, { data: { project }, autoFocus: false });
  }

  protected async remove(project: ProjectInfo): Promise<void> {
    const name = this.projects.name(project);
    const count = this.count(project);
    const defaultName = this.projects.name(this.projects.byId('default'));
    let data: ConfirmData;
    if (project.location.type === 'local-storage' && count > 0) {
      data = {
        title: this.t('project.remove.title', { name }),
        text: this.t('project.remove.local', { count, project: defaultName }),
        actions: [
          { id: 'cancel', label: this.t('action.cancel'), kind: 'ghost' },
          { id: 'delete-diagrams', label: this.t('project.remove.deleteDiagrams'), kind: 'danger' },
          { id: 'move-to-default', label: this.t('project.remove.move', { project: defaultName }), kind: 'primary' },
        ],
      };
    } else {
      const text =
        project.location.type === 'git'
          ? this.t('project.remove.git') + ((project.status.ahead ?? 0) > 0 ? ` ${this.t('project.remove.gitUnpushed', { count: project.status.ahead ?? 0 })}` : '')
          : project.location.type === 'directory'
            ? this.t('project.remove.directory', { count })
            : this.t('project.remove.empty');
      data = {
        title: this.t('project.remove.title', { name }),
        text,
        actions: [
          { id: 'cancel', label: this.t('action.cancel'), kind: 'ghost' },
          { id: project.location.type === 'local-storage' ? 'delete-diagrams' : 'keep-files', label: this.t('project.remove.confirm'), kind: 'danger' },
        ],
      };
    }
    const choice = await firstValueFrom(this.dialog.open<ConfirmDialog, ConfirmData, string>(ConfirmDialog, { data, width: '460px' }).afterClosed());
    if (!choice || choice === 'cancel') return;
    await this.projects.remove(project.id, choice as ProjectRemoval);
  }
}
