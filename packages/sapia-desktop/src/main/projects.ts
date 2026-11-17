import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, ProjectError, ProjectManager, localProjectStore, normalizeProjectLocation } from '@sapia/core';
import type { Project, ProjectStore } from '@sapia/core';
import { FileDiagramStore } from './diagram-store';
import { GitProjectStore, cloneRepository } from './git-store';
import type { GitRunner } from './git-store';
import { expandPath } from './paths';
import { SourceFileDiagramStore } from './source-file-store';

export interface DesktopProjectsOptions {
  /** `~/.sapia` */
  home: string;
  /** Where the default project keeps its diagrams (`~/.sapia/diagrams` unless configured). */
  defaultDirectory: () => string;
  git: GitRunner;
}

/** Where Sapia keeps the clone of a Git project. */
export function cloneDirectory(home: string, projectId: string): string {
  return join(home, 'projects', projectId, 'repository');
}

/** The folder a project's diagram files are in. */
export function projectFolder(project: Project, options: Pick<DesktopProjectsOptions, 'home' | 'defaultDirectory'>): string {
  if (project.id === DEFAULT_PROJECT_ID) return options.defaultDirectory();
  switch (project.location.type) {
    case 'directory':
      return expandPath(project.location.path, options.home);
    case 'git':
      return join(cloneDirectory(options.home, project.id), ...(project.location.directory?.split(/[\\/]/) ?? []));
    default:
      return options.home;
  }
}

/**
 * Projects of Sapia Desktop. The list lives in `~/.sapia/projects.json`; the
 * default project keeps its diagrams where they always were (`~/.sapia/diagrams`).
 */
export function createDesktopProjects(options: DesktopProjectsOptions): ProjectManager {
  const file = join(options.home, 'projects.json');

  const load = async (): Promise<Project[]> => {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as { projects?: unknown };
      const list = Array.isArray(parsed.projects) ? parsed.projects : [];
      return list.flatMap((raw): Project[] => {
        const p = raw as Partial<Project>;
        const location = normalizeProjectLocation(p.location);
        if (typeof p.id !== 'string' || typeof p.name !== 'string' || !location) return [];
        const epoch = new Date(0).toISOString();
        return [{ id: p.id, name: p.name, ...(p.description ? { description: String(p.description) } : {}), location, createdAt: p.createdAt ?? epoch, updatedAt: p.updatedAt ?? epoch }];
      });
    } catch {
      return [];
    }
  };

  const save = async (projects: Project[]): Promise<void> => {
    await mkdir(options.home, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify({ projects }, null, 2)}\n`, 'utf8');
    await rename(temp, file);
  };

  return new ProjectManager({
    locationTypes: ['directory', 'git'],
    defaultProject: () => ({
      id: DEFAULT_PROJECT_ID,
      name: DEFAULT_PROJECT_NAME,
      location: { type: 'directory', path: options.defaultDirectory() },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }),
    registry: { load, save },
    prepareLocation: async (project) => {
      const { location } = project;
      if (location.type === 'directory') {
        const path = expandPath(location.path, options.home);
        try {
          await mkdir(path, { recursive: true });
          if (!(await stat(path)).isDirectory()) throw new Error();
        } catch {
          throw new ProjectError(`The folder ${path} cannot be used.`, 'location');
        }
      } else if (location.type === 'git') {
        try {
          await cloneRepository(location, cloneDirectory(options.home, project.id), options.git);
        } catch (e) {
          throw new ProjectError(e instanceof Error ? e.message : String(e), 'location');
        }
      }
    },
    openStore: async (project): Promise<ProjectStore> => {
      // Diagrams of the default project stay JSON files, as before projects existed.
      if (project.id === DEFAULT_PROJECT_ID) return localProjectStore(new FileDiagramStore(options.defaultDirectory()));
      const { location } = project;
      if (location.type === 'git') return GitProjectStore.open(location, cloneDirectory(options.home, project.id), options.git);
      if (location.type === 'directory') {
        const path = expandPath(location.path, options.home);
        if (!existsSync(path)) throw new ProjectError(`The folder ${path} does not exist (anymore).`, 'location');
        const store = localProjectStore(new SourceFileDiagramStore(path));
        return {
          ...store,
          status: () => (existsSync(path) ? store.status() : { state: 'error', message: `The folder ${path} does not exist (anymore).` }),
        };
      }
      throw new ProjectError(`Projects of type "${location.type}" are not available in Sapia Desktop.`, 'unsupported');
    },
  });
}

