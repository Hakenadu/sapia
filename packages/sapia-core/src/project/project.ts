import { KeyValueDiagramStore } from '../storage/store';
import type { DiagramDraft, DiagramStore, KeyValueStorage, StoredDiagram, StoredDiagramMeta } from '../storage/store';

/** Id of the project every installation has and that cannot be deleted. */
export const DEFAULT_PROJECT_ID = 'default';

/**
 * Where a project keeps its diagrams.
 *
 * - `local-storage`: the browser's local storage (the only kind in the web app).
 * - `directory`: plain diagram files (`*.puml`, `*.mmd`, …) in a folder on the computer.
 * - `git`: plain diagram files in a Git repository; every save is committed and pushed.
 */
export type ProjectLocation =
  | { type: 'local-storage' }
  | { type: 'directory'; path: string }
  | {
      type: 'git';
      /** Clone URL (https or ssh). */
      url: string;
      /** Branch to commit to; the remote's default branch when empty. */
      branch?: string;
      /** Folder inside the repository that holds the diagrams; the root when empty. */
      directory?: string;
    };

export type ProjectLocationType = ProjectLocation['type'];

export interface Project {
  id: string;
  name: string;
  description?: string;
  location: ProjectLocation;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
}

/**
 * - `local`: nothing to synchronise (local storage, folders).
 * - `synced`: every change is pushed. `pending`: commits wait for the next push.
 * - `offline`: the remote cannot be reached; changes are kept locally.
 * - `conflict`: someone else changed the same diagrams; see `conflicts`.
 * - `error`: the location is unusable (folder missing, clone failed, …).
 */
export type ProjectSyncState = 'local' | 'synced' | 'pending' | 'offline' | 'conflict' | 'error';

export interface DiagramConflict {
  /** Diagram id in the project. */
  id: string;
  name: string;
  /** The local version. Null when it was deleted locally. */
  mine: string | null;
  /** The remote version. Null when it was deleted remotely. */
  theirs: string | null;
}

export interface ProjectStatus {
  state: ProjectSyncState;
  /** Explanation for `offline`, `error` and `conflict`. */
  message?: string;
  /** Git branch. */
  branch?: string;
  /** Local commits not pushed yet. */
  ahead?: number;
  /** ISO timestamp of the last successful exchange with the remote. */
  lastSyncedAt?: string;
  conflicts?: DiagramConflict[];
}

export interface ProjectInfo extends Project {
  isDefault: boolean;
  status: ProjectStatus;
}

export interface ProjectDraft {
  /** Updates the project when present. */
  id?: string;
  name: string;
  description?: string;
  location: ProjectLocation;
}

/**
 * - `mine`: keep the local version and overwrite the remote one.
 * - `theirs`: take the remote version and drop the local change.
 * - `both`: take the remote version and keep the local one as a copy.
 */
export type ConflictResolution = 'mine' | 'theirs' | 'both';

export interface SaveOutcome {
  diagram: StoredDiagram;
  status: ProjectStatus;
}

/** What happens to the diagrams of a project that is removed. */
export type ProjectRemoval = 'move-to-default' | 'delete-diagrams' | 'keep-files';

/** Projects and their diagrams. The web app and the desktop host each provide one. */
export interface ProjectBackend {
  /** Location types this host can create projects for. */
  locationTypes(): Promise<ProjectLocationType[]>;
  listProjects(): Promise<ProjectInfo[]>;
  /** Creates or updates a project. Creating a Git project clones the repository. */
  saveProject(draft: ProjectDraft): Promise<ProjectInfo>;
  deleteProject(id: string, removal: ProjectRemoval): Promise<void>;

  listDiagrams(projectId: string): Promise<StoredDiagramMeta[]>;
  getDiagram(projectId: string, id: string): Promise<StoredDiagram | null>;
  saveDiagram(projectId: string, draft: DiagramDraft): Promise<SaveOutcome>;
  deleteDiagram(projectId: string, id: string): Promise<ProjectStatus>;
  /** Moves a saved diagram to another project. Its id may change. */
  moveDiagram(id: string, from: string, to: string): Promise<SaveOutcome>;

  /** Exchanges changes with the remote (Git); a no-op for local locations. */
  sync(projectId: string): Promise<ProjectStatus>;
  resolveConflicts(projectId: string, resolutions: Record<string, ConflictResolution>): Promise<ProjectStatus>;
}

/** A project's diagram store, optionally synchronised with a remote. */
export interface ProjectStore extends DiagramStore {
  status(): ProjectStatus;
  sync?(): Promise<ProjectStatus>;
  resolveConflicts?(resolutions: Record<string, ConflictResolution>): Promise<ProjectStatus>;
  /** Called when the project is removed from Sapia, after its diagrams were moved or deleted as asked. */
  dispose?(removal: ProjectRemoval): Promise<void>;
}

/** Persists the list of projects (without the default project's location). */
export interface ProjectRegistryStorage {
  load(): Promise<Project[]>;
  save(projects: Project[]): Promise<void>;
}

export interface ProjectManagerOptions {
  registry: ProjectRegistryStorage;
  /** The default project as it is when the registry has no entry for it. */
  defaultProject: () => Project;
  locationTypes: ProjectLocationType[];
  /** Opens the store of a project. Throws when the location cannot be used. */
  openStore(project: Project): Promise<ProjectStore>;
  /** Checks a new or changed location before it is saved (e.g. clones a repository). */
  prepareLocation?(project: Project, previous: Project | undefined): Promise<void>;
  newId?: () => string;
}

const LOCAL: ProjectStatus = { state: 'local' };

function createProjectId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `p-${raw.replace(/-/g, '').slice(0, 12)}`;
}

/** Normalises a stored or submitted location; returns null when it is invalid. */
export function normalizeProjectLocation(raw: unknown): ProjectLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  switch (value['type']) {
    case 'local-storage':
      return { type: 'local-storage' };
    case 'directory': {
      const path = text(value['path']);
      return path ? { type: 'directory', path } : null;
    }
    case 'git': {
      const url = text(value['url']);
      if (!url) return null;
      const branch = text(value['branch']);
      const directory = text(value['directory']).replace(/^[\\/]+|[\\/]+$/g, '');
      return { type: 'git', url, ...(branch ? { branch } : {}), ...(directory ? { directory } : {}) };
    }
    default:
      return null;
  }
}

function sameLocation(a: ProjectLocation, b: ProjectLocation): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class ProjectError extends Error {
  constructor(
    message: string,
    readonly code: 'not-found' | 'invalid' | 'unsupported' | 'default-project' | 'location',
  ) {
    super(message);
    this.name = 'ProjectError';
  }
}

/**
 * Generic {@link ProjectBackend}: keeps the project list in a registry and
 * delegates diagrams to one {@link ProjectStore} per project.
 */
export class ProjectManager implements ProjectBackend {
  private readonly stores = new Map<string, { project: Project; store: Promise<ProjectStore> }>();
  private readonly failures = new Map<string, string>();

  constructor(private readonly options: ProjectManagerOptions) {}

  async locationTypes(): Promise<ProjectLocationType[]> {
    return [...this.options.locationTypes];
  }

  private async projects(): Promise<Project[]> {
    const stored = await this.options.registry.load();
    const fallback = this.options.defaultProject();
    const storedDefault = stored.find((p) => p.id === DEFAULT_PROJECT_ID);
    // The default project's location is fixed by the host; only name and description are the user's.
    const defaultProject: Project = storedDefault
      ? { ...fallback, name: storedDefault.name || fallback.name, description: storedDefault.description, createdAt: storedDefault.createdAt, updatedAt: storedDefault.updatedAt }
      : fallback;
    const others = stored.filter((p) => p.id !== DEFAULT_PROJECT_ID && this.options.locationTypes.includes(p.location.type));
    return [defaultProject, ...others.sort((a, b) => a.name.localeCompare(b.name))];
  }

  private async project(id: string): Promise<Project> {
    const project = (await this.projects()).find((p) => p.id === id);
    if (!project) throw new ProjectError(`Unknown project "${id}"`, 'not-found');
    return project;
  }

  /** The store of a project; reopened when its location changed. */
  private async store(id: string): Promise<ProjectStore> {
    const project = await this.project(id);
    const cached = this.stores.get(id);
    if (cached && sameLocation(cached.project.location, project.location)) return cached.store;
    const store = this.options.openStore(project);
    this.stores.set(id, { project, store });
    store.then(
      () => this.failures.delete(id),
      (e: unknown) => {
        this.failures.set(id, e instanceof Error ? e.message : String(e));
        // Try again next time, the folder may come back.
        if (this.stores.get(id)?.store === store) this.stores.delete(id);
      },
    );
    return store;
  }

  private async info(project: Project): Promise<ProjectInfo> {
    let status: ProjectStatus;
    try {
      status = (await this.store(project.id)).status();
    } catch (e) {
      status = { state: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    return { ...project, isDefault: project.id === DEFAULT_PROJECT_ID, status };
  }

  async listProjects(): Promise<ProjectInfo[]> {
    return Promise.all((await this.projects()).map((p) => this.info(p)));
  }

  async saveProject(draft: ProjectDraft): Promise<ProjectInfo> {
    const name = draft.name.trim();
    if (!name) throw new ProjectError('A project needs a name.', 'invalid');
    const description = draft.description?.trim() || undefined;
    const now = new Date().toISOString();
    const all = await this.projects();
    const previous = draft.id ? all.find((p) => p.id === draft.id) : undefined;
    if (draft.id && !previous) throw new ProjectError(`Unknown project "${draft.id}"`, 'not-found');

    let location: ProjectLocation;
    if (previous?.id === DEFAULT_PROJECT_ID) location = previous.location;
    else {
      const normalized = normalizeProjectLocation(draft.location);
      if (!normalized) throw new ProjectError('The storage location is incomplete.', 'invalid');
      if (!this.options.locationTypes.includes(normalized.type)) throw new ProjectError(`Projects of type "${normalized.type}" are not available here.`, 'unsupported');
      location = normalized;
    }

    const project: Project = {
      id: previous?.id ?? this.options.newId?.() ?? createProjectId(),
      name,
      ...(description ? { description } : {}),
      location,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    if (!previous || !sameLocation(previous.location, location)) await this.options.prepareLocation?.(project, previous);

    const stored = await this.options.registry.load();
    await this.options.registry.save([...stored.filter((p) => p.id !== project.id), project]);
    return this.info(project);
  }

  async deleteProject(id: string, removal: ProjectRemoval): Promise<void> {
    if (id === DEFAULT_PROJECT_ID) throw new ProjectError('The default project cannot be removed.', 'default-project');
    const project = await this.project(id);
    // Removing a repository project never deletes anything in the shared repository.
    if (project.location.type === 'git') removal = 'keep-files';
    let store: ProjectStore | null = null;
    try {
      store = await this.store(id);
    } catch {
      store = null;
    }
    if (store && removal !== 'keep-files') {
      for (const meta of await store.list()) {
        if (removal === 'move-to-default') await this.moveDiagram(meta.id, id, DEFAULT_PROJECT_ID);
        else await store.delete(meta.id);
      }
    }
    await store?.dispose?.(removal);
    this.stores.delete(id);
    const stored = await this.options.registry.load();
    await this.options.registry.save(stored.filter((p) => p.id !== id));
  }

  async listDiagrams(projectId: string): Promise<StoredDiagramMeta[]> {
    return (await this.store(projectId)).list();
  }

  async getDiagram(projectId: string, id: string): Promise<StoredDiagram | null> {
    return (await this.store(projectId)).get(id);
  }

  async saveDiagram(projectId: string, draft: DiagramDraft): Promise<SaveOutcome> {
    const store = await this.store(projectId);
    const diagram = await store.save(draft);
    return { diagram, status: store.status() };
  }

  async deleteDiagram(projectId: string, id: string): Promise<ProjectStatus> {
    const store = await this.store(projectId);
    await store.delete(id);
    return store.status();
  }

  async moveDiagram(id: string, from: string, to: string): Promise<SaveOutcome> {
    const source = await this.store(from);
    const diagram = await source.get(id);
    if (!diagram) throw new ProjectError(`No diagram with id ${id}`, 'not-found');
    if (from === to) return { diagram, status: source.status() };
    const target = await this.store(to);
    // Write first: if the target fails, the diagram stays where it was.
    const moved = await target.save({ name: diagram.name, source: diagram.source, languageId: diagram.languageId, diagramType: diagram.diagramType });
    await source.delete(id);
    return { diagram: moved, status: target.status() };
  }

  async sync(projectId: string): Promise<ProjectStatus> {
    const store = await this.store(projectId);
    return store.sync ? store.sync() : store.status();
  }

  async resolveConflicts(projectId: string, resolutions: Record<string, ConflictResolution>): Promise<ProjectStatus> {
    const store = await this.store(projectId);
    return store.resolveConflicts ? store.resolveConflicts(resolutions) : store.status();
  }
}

/** A {@link ProjectStore} without a remote. */
export function localProjectStore(store: DiagramStore): ProjectStore {
  return {
    list: () => store.list(),
    get: (id) => store.get(id),
    save: (draft) => store.save(draft),
    delete: (id) => store.delete(id),
    status: () => LOCAL,
  };
}

/** Prefix of the default project's entries; the one diagrams used before projects existed. */
export const DEFAULT_DIAGRAM_PREFIX = 'sapia.diagrams';

/**
 * Name of the default project until the user renames it. User interfaces show
 * a translated name instead while it is unchanged.
 */
export const DEFAULT_PROJECT_NAME = 'My diagrams';

/** Projects kept entirely in a key-value storage such as `localStorage` (the web app). */
export function createLocalStorageProjects(storage: KeyValueStorage): ProjectManager {
  const key = 'sapia.projects';
  return new ProjectManager({
    locationTypes: ['local-storage'],
    defaultProject: () => ({
      id: DEFAULT_PROJECT_ID,
      name: DEFAULT_PROJECT_NAME,
      location: { type: 'local-storage' },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }),
    registry: {
      load: async () => {
        try {
          const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
          return Array.isArray(parsed) ? (parsed as Project[]).filter((p) => p && typeof p.id === 'string' && normalizeProjectLocation(p.location)) : [];
        } catch {
          return [];
        }
      },
      save: async (projects) => storage.setItem(key, JSON.stringify(projects)),
    },
    openStore: async (project) => {
      const prefix = project.id === DEFAULT_PROJECT_ID ? DEFAULT_DIAGRAM_PREFIX : `sapia.projects.${project.id}.diagrams`;
      const store = localProjectStore(new KeyValueDiagramStore(storage, prefix));
      return {
        ...store,
        dispose: async () => {
          for (const d of await store.list()) await store.delete(d.id);
          storage.removeItem(`${prefix}.index`);
        },
      };
    },
  });
}
