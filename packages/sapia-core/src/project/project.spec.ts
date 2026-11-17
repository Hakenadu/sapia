import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, ProjectError, createLocalStorageProjects, normalizeProjectLocation } from './project';
import { KeyValueDiagramStore, MemoryStorage } from '../storage/store';

describe('local storage projects', () => {
  it('always has a default project that uses the pre-project storage keys', async () => {
    const storage = new MemoryStorage();
    // A diagram saved before projects existed.
    const legacy = await new KeyValueDiagramStore(storage).save({ name: 'Old', source: 'graph TD' });
    const projects = createLocalStorageProjects(storage);
    const list = await projects.listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: DEFAULT_PROJECT_ID, name: DEFAULT_PROJECT_NAME, isDefault: true, status: { state: 'local' } });
    expect((await projects.listDiagrams(DEFAULT_PROJECT_ID)).map((d) => d.id)).toEqual([legacy.id]);
  });

  it('creates, renames, moves diagrams between and removes projects', async () => {
    const storage = new MemoryStorage();
    const projects = createLocalStorageProjects(storage);
    expect(await projects.locationTypes()).toEqual(['local-storage']);
    const work = await projects.saveProject({ name: ' Work ', description: '  ', location: { type: 'local-storage' } });
    expect(work).toMatchObject({ name: 'Work', isDefault: false });
    expect(work.description).toBeUndefined();

    const { diagram } = await projects.saveDiagram(DEFAULT_PROJECT_ID, { name: 'Flow', source: 'graph TD', languageId: 'mermaid' });
    const moved = await projects.moveDiagram(diagram.id, DEFAULT_PROJECT_ID, work.id);
    expect(moved.diagram).toMatchObject({ name: 'Flow', source: 'graph TD', languageId: 'mermaid' });
    expect(await projects.listDiagrams(DEFAULT_PROJECT_ID)).toEqual([]);
    expect(await projects.listDiagrams(work.id)).toHaveLength(1);

    const renamed = await projects.saveProject({ id: work.id, name: 'Team', location: { type: 'local-storage' } });
    expect(renamed.createdAt).toBe(work.createdAt);
    expect((await projects.listProjects()).map((p) => p.name)).toEqual([DEFAULT_PROJECT_NAME, 'Team']);

    await projects.deleteProject(work.id, 'move-to-default');
    expect((await projects.listProjects()).map((p) => p.id)).toEqual([DEFAULT_PROJECT_ID]);
    expect((await projects.listDiagrams(DEFAULT_PROJECT_ID)).map((d) => d.name)).toEqual(['Flow']);
  });

  it('deletes the diagrams of a removed project when asked', async () => {
    const storage = new MemoryStorage();
    const projects = createLocalStorageProjects(storage);
    const scratch = await projects.saveProject({ name: 'Scratch', location: { type: 'local-storage' } });
    await projects.saveDiagram(scratch.id, { name: 'Tmp', source: 'x' });
    await projects.deleteProject(scratch.id, 'delete-diagrams');
    expect(await projects.listDiagrams(DEFAULT_PROJECT_ID)).toEqual([]);
    await expect(projects.listDiagrams(scratch.id)).rejects.toThrow(ProjectError);
  });

  it('protects the default project and rejects unsupported locations', async () => {
    const projects = createLocalStorageProjects(new MemoryStorage());
    await expect(projects.deleteProject(DEFAULT_PROJECT_ID, 'delete-diagrams')).rejects.toThrow(/cannot be removed/);
    await expect(projects.saveProject({ name: 'Repo', location: { type: 'git', url: 'https://example.com/r.git' } })).rejects.toThrow(/not available/);
    await expect(projects.saveProject({ name: '', location: { type: 'local-storage' } })).rejects.toThrow(/name/);
    // Renaming the default project keeps its location.
    const renamed = await projects.saveProject({ id: DEFAULT_PROJECT_ID, name: 'Mine', location: { type: 'directory', path: '/tmp' } });
    expect(renamed).toMatchObject({ name: 'Mine', location: { type: 'local-storage' } });
  });

  it('normalises locations', () => {
    expect(normalizeProjectLocation({ type: 'git', url: ' git@x:y.git ', branch: '', directory: '/docs/' })).toEqual({ type: 'git', url: 'git@x:y.git', directory: 'docs' });
    expect(normalizeProjectLocation({ type: 'directory', path: ' ' })).toBeNull();
    expect(normalizeProjectLocation({ type: 'ftp' })).toBeNull();
  });
});
