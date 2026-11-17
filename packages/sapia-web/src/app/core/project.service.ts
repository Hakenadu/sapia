import { Injectable, computed, inject, signal } from '@angular/core';
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME } from '@sapia/core';
import type { ConflictResolution, ProjectDraft, ProjectInfo, ProjectLocation, ProjectLocationType, ProjectRemoval, ProjectStatus, StoredDiagramMeta } from '@sapia/core';
import type { IconName } from '../ui/icon';
import { I18nService } from './i18n.service';
import { SapiaService } from './sapia.service';

const ACTIVE_KEY = 'sapia.project';
/** Git projects are fetched again when they are shown after this long. */
const SYNC_INTERVAL = 60_000;

export interface ProjectStatusView {
  tone: 'ok' | 'muted' | 'warn' | 'danger' | 'busy';
  icon: IconName;
  label: string;
  /** Shorter label for tight spots, e.g. next to the branch name. */
  short?: string;
  detail?: string;
}

/** A saved diagram together with the project it belongs to. */
export interface ProjectDiagram extends StoredDiagramMeta {
  projectId: string;
}

/**
 * The projects, their diagrams and which project is active (shown in the
 * library; new diagrams are saved there).
 */
@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly sapia = inject(SapiaService);
  private readonly i18n = inject(I18nService);

  readonly projects = signal<ProjectInfo[]>([]);
  readonly locationTypes = signal<ProjectLocationType[]>(['local-storage']);
  readonly activeId = signal<string>(this.readActive());
  readonly active = computed(() => this.projects().find((p) => p.id === this.activeId()) ?? this.projects()[0] ?? null);
  /** Saved diagrams per project id. */
  readonly diagrams = signal<Record<string, StoredDiagramMeta[]>>({});
  /** Projects currently exchanging changes with their remote. */
  readonly syncing = signal<ReadonlySet<string>>(new Set());
  /** A project whose conflicts the user should resolve now. */
  readonly conflictRequest = signal<{ projectId: string; nonce: number } | null>(null);
  /** Bumped when a project received changes from elsewhere (sync, conflict resolution). */
  readonly changed = signal<{ projectId: string; nonce: number } | null>(null);

  /** Diagrams of all projects, most recently changed first. */
  readonly recent = computed<ProjectDiagram[]>(() =>
    Object.entries(this.diagrams())
      .flatMap(([projectId, list]) => list.map((d) => ({ ...d, projectId })))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );

  private readonly lastSync = new Map<string, number>();
  private readonly types = new Map<string, string | undefined>();

  /** The project's name; the untouched default project is shown in the UI language. */
  name(project: Pick<ProjectInfo, 'id' | 'name'> | null | undefined): string {
    if (!project) return '';
    this.i18n.locale();
    return project.id === DEFAULT_PROJECT_ID && project.name === DEFAULT_PROJECT_NAME ? this.i18n.t('project.default') : project.name;
  }

  byId(id: string | null | undefined): ProjectInfo | undefined {
    return this.projects().find((p) => p.id === id);
  }

  /** Short, human readable location: a folder, a repository or the browser. */
  locationLabel(location: ProjectLocation): string {
    switch (location.type) {
      case 'local-storage':
        return this.i18n.t('project.type.local-storage');
      case 'directory':
        return location.path;
      case 'git': {
        const repo = location.url.replace(/^(https?:\/\/|ssh:\/\/|git@)/, '').replace(/\.git$/, '').replace(/^([^/:]+):/, '$1/');
        return location.directory ? `${repo} › ${location.directory}` : repo;
      }
    }
  }

  /** One-line state of a project for lists and the library header. */
  statusOf(project: ProjectInfo): ProjectStatusView {
    this.i18n.locale();
    const t = this.i18n.t;
    if (this.syncing().has(project.id)) return { tone: 'busy', icon: 'sync', label: t('project.status.syncing') };
    const status = project.status;
    switch (status.state) {
      case 'synced':
        return {
          tone: 'ok',
          icon: 'check-circle',
          label: status.lastSyncedAt ? t('project.status.syncedAt', { time: this.i18n.relativeTime(status.lastSyncedAt) }) : t('project.status.synced'),
          short: t('project.status.synced'),
        };
      case 'pending':
        return { tone: 'warn', icon: 'arrow-up', label: t('project.status.pending', { count: status.ahead ?? 1 }) };
      case 'offline':
        return { tone: 'warn', icon: 'cloud-off', label: t('project.status.offline'), detail: status.message };
      case 'conflict':
        return { tone: 'danger', icon: 'merge', label: t('project.status.conflict', { count: status.conflicts?.length ?? 1 }) };
      case 'error':
        return { tone: 'danger', icon: 'error', label: t('project.status.error'), detail: status.message };
      default:
        return { tone: 'muted', icon: 'check-circle', label: t('project.status.local') };
    }
  }

  /** Just the folder or repository name, for small cards. */
  shortLocation(location: ProjectLocation): string {
    switch (location.type) {
      case 'directory':
        return location.path.split(/[\\/]/).filter(Boolean).pop() ?? location.path;
      case 'git':
        return location.url.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).pop() ?? location.url;
      default:
        return this.locationLabel(location);
    }
  }

  async start(): Promise<void> {
    try {
      this.locationTypes.set(await this.sapia.projects.locationTypes());
    } catch {
      /* keep the default */
    }
    await this.refresh();
    if (!this.byId(this.activeId())) this.setActive(DEFAULT_PROJECT_ID);
    void this.syncIfStale(this.activeId());
    // Keep the shown Git project fresh while the app is open.
    setInterval(() => void this.syncIfStale(this.activeId()), SYNC_INTERVAL / 2);
  }

  /** Reloads every project and its diagrams. */
  async refresh(): Promise<void> {
    let projects: ProjectInfo[];
    try {
      projects = await this.sapia.projects.listProjects();
    } catch {
      projects = [];
    }
    this.projects.set(projects);
    const lists = await Promise.all(projects.map(async (p) => [p.id, await this.load(p.id)] as const));
    this.diagrams.set(Object.fromEntries(lists));
  }

  /** Reloads the diagrams of one project. */
  async refreshProject(projectId: string): Promise<void> {
    const list = await this.load(projectId);
    this.diagrams.update((all) => ({ ...all, [projectId]: list }));
  }

  private async load(projectId: string): Promise<StoredDiagramMeta[]> {
    let list: StoredDiagramMeta[];
    try {
      list = await this.sapia.projects.listDiagrams(projectId);
    } catch {
      return [];
    }
    // Plain files (folders, Git) do not record their diagram type: detect it once per version.
    return Promise.all(
      list.map(async (meta) => {
        if (meta.diagramType) return meta;
        const key = `${projectId}\u0000${meta.id}\u0000${meta.updatedAt}`;
        if (!this.types.has(key)) {
          let type: string | undefined;
          try {
            const diagram = await this.sapia.projects.getDiagram(projectId, meta.id);
            type = diagram ? this.sapia.core.languages.detect(diagram.source)?.diagramType : undefined;
          } catch {
            type = undefined;
          }
          this.types.set(key, type);
        }
        return { ...meta, diagramType: this.types.get(key) };
      }),
    );
  }

  setActive(projectId: string): void {
    this.activeId.set(projectId);
    try {
      localStorage.setItem(ACTIVE_KEY, projectId);
    } catch {
      /* ignore */
    }
    void this.syncIfStale(projectId);
  }

  private readActive(): string {
    try {
      return localStorage.getItem(ACTIVE_KEY) || DEFAULT_PROJECT_ID;
    } catch {
      return DEFAULT_PROJECT_ID;
    }
  }

  /** Records a status reported by a save or delete. */
  setStatus(projectId: string, status: ProjectStatus): void {
    this.projects.update((list) => list.map((p) => (p.id === projectId ? { ...p, status } : p)));
    if (status.state === 'conflict') this.conflictRequest.set({ projectId, nonce: Date.now() });
  }

  isRemote(projectId: string): boolean {
    return this.byId(projectId)?.location.type === 'git';
  }

  async syncIfStale(projectId: string): Promise<void> {
    if (!this.isRemote(projectId)) return;
    if (Date.now() - (this.lastSync.get(projectId) ?? 0) < SYNC_INTERVAL) return;
    await this.sync(projectId);
  }

  /** Exchanges changes with the remote and reloads the project's diagrams. */
  async sync(projectId: string): Promise<ProjectStatus | null> {
    if (!this.isRemote(projectId) || this.syncing().has(projectId)) return null;
    this.lastSync.set(projectId, Date.now());
    this.syncing.update((s) => new Set(s).add(projectId));
    try {
      const status = await this.sapia.projects.sync(projectId);
      this.setStatus(projectId, status);
      await this.refreshProject(projectId);
      this.changed.set({ projectId, nonce: Date.now() });
      return status;
    } catch (e) {
      const status: ProjectStatus = { state: 'error', message: e instanceof Error ? e.message : String(e) };
      this.setStatus(projectId, status);
      return status;
    } finally {
      this.syncing.update((s) => {
        const next = new Set(s);
        next.delete(projectId);
        return next;
      });
    }
  }

  async resolveConflicts(projectId: string, resolutions: Record<string, ConflictResolution>): Promise<ProjectStatus> {
    const status = await this.sapia.projects.resolveConflicts(projectId, resolutions);
    this.projects.update((list) => list.map((p) => (p.id === projectId ? { ...p, status } : p)));
    await this.refreshProject(projectId);
    this.changed.set({ projectId, nonce: Date.now() });
    return status;
  }

  async save(draft: ProjectDraft): Promise<ProjectInfo> {
    const project = await this.sapia.projects.saveProject(draft);
    await this.refresh();
    return project;
  }

  async remove(projectId: string, removal: ProjectRemoval): Promise<void> {
    await this.sapia.projects.deleteProject(projectId, removal);
    if (this.activeId() === projectId) this.setActive(DEFAULT_PROJECT_ID);
    await this.refresh();
  }

  /** Error message of a failed project operation, without Electron's IPC prefix. */
  static message(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    return text.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
  }
}
