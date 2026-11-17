import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PROJECT_ID } from '@sapia/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitProjectStore, createGitRunner, explainGitFailure } from './git-store';
import { createDesktopProjects } from './projects';
import { SourceFileDiagramStore, fileNameFor } from './source-file-store';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sapia-projects-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com', GIT_CONFIG_NOSYSTEM: '1' };
const git = createGitRunner({ env });
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' });

describe('SourceFileDiagramStore', () => {
  it('keeps diagrams as readable source files named after the diagram', async () => {
    const store = new SourceFileDiagramStore(join(dir, 'docs'));
    const saved = await store.save({ name: 'Order flow', source: '@startuml\nA -> B\n@enduml\n', languageId: 'plantuml', diagramType: 'sequence' });
    expect(saved.id).toBe('Order flow.puml');
    expect(await readFile(join(dir, 'docs', 'Order flow.puml'), 'utf8')).toContain('A -> B');

    const renamed = await store.save({ id: saved.id, name: 'Checkout', source: '@startuml\nA -> C\n@enduml\n', languageId: 'plantuml' });
    expect(renamed.id).toBe('Checkout.puml');
    expect(await readdir(join(dir, 'docs'))).toEqual(['Checkout.puml']);

    const mermaid = await store.save({ name: 'Checkout', source: 'flowchart LR\n  a --> b\n', languageId: 'mermaid' });
    expect(mermaid.id).toBe('Checkout.mmd');
    const twin = await store.save({ name: 'Checkout', source: '@startuml\n@enduml\n', languageId: 'plantuml' });
    expect(twin.id).toBe('Checkout 2.puml');

    const list = await store.list();
    expect(list.map((d) => d.id).sort()).toEqual(['Checkout 2.puml', 'Checkout.mmd', 'Checkout.puml']);
    expect(list.find((d) => d.id === 'Checkout.mmd')).toMatchObject({ name: 'Checkout', languageId: 'mermaid' });

    await store.delete('Checkout.mmd');
    expect(existsSync(join(dir, 'docs', 'Checkout.mmd'))).toBe(false);
  });

  it('finds diagrams in sub folders and ignores other files', async () => {
    await mkdir(join(dir, 'a', 'b'), { recursive: true });
    await writeFile(join(dir, 'a', 'b', 'Deep.mmd'), 'graph TD\n');
    await writeFile(join(dir, 'README.md'), '# hi');
    await mkdir(join(dir, '.git'));
    await writeFile(join(dir, '.git', 'x.puml'), 'nope');
    const store = new SourceFileDiagramStore(dir);
    expect((await store.list()).map((d) => d.id)).toEqual(['a/b/Deep.mmd']);
    expect((await store.get('a/b/Deep.mmd'))?.source).toBe('graph TD\n');
    expect(await store.get('../outside.puml')).toBeNull();
    expect(await store.get('README.md')).toBeNull();
  });

  it('makes names safe for every file system', () => {
    expect(fileNameFor('a/b: c?')).toBe('a-b- c-');
    expect(fileNameFor('  ..hidden ')).toBe('hidden');
    expect(fileNameFor('CON')).toBe('Untitled');
  });
});

describe('desktop projects', () => {
  it('keeps the default project in ~/.sapia/diagrams and adds folder projects', async () => {
    const projects = createDesktopProjects({ home: dir, defaultDirectory: () => join(dir, 'diagrams'), git });
    const [initial] = await projects.listProjects();
    expect(initial).toMatchObject({ id: DEFAULT_PROJECT_ID, isDefault: true, location: { type: 'directory', path: join(dir, 'diagrams') } });

    const { diagram } = await projects.saveDiagram(DEFAULT_PROJECT_ID, { name: 'Legacy', source: 'graph TD\n', languageId: 'mermaid' });
    // Unchanged format of the default project: one JSON file per diagram.
    expect(existsSync(join(dir, 'diagrams', `${diagram.id}.json`))).toBe(true);

    const folder = join(dir, 'work', 'diagrams');
    const project = await projects.saveProject({ name: 'Work', description: 'Team diagrams', location: { type: 'directory', path: folder } });
    expect(existsSync(folder)).toBe(true);
    expect(JSON.parse(await readFile(join(dir, 'projects.json'), 'utf8')).projects).toHaveLength(1);

    const moved = await projects.moveDiagram(diagram.id, DEFAULT_PROJECT_ID, project.id);
    expect(moved.diagram.id).toBe('Legacy.mmd');
    expect(await projects.listDiagrams(DEFAULT_PROJECT_ID)).toEqual([]);
    expect(await readFile(join(folder, 'Legacy.mmd'), 'utf8')).toBe('graph TD\n');

    await projects.deleteProject(project.id, 'keep-files');
    expect(existsSync(join(folder, 'Legacy.mmd'))).toBe(true);
    expect((await projects.listProjects()).map((p) => p.id)).toEqual([DEFAULT_PROJECT_ID]);
  });

  it('reports a folder that disappeared', async () => {
    const projects = createDesktopProjects({ home: dir, defaultDirectory: () => join(dir, 'diagrams'), git });
    const folder = join(dir, 'gone');
    const project = await projects.saveProject({ name: 'Gone', location: { type: 'directory', path: folder } });
    await rm(folder, { recursive: true });
    const info = (await projects.listProjects()).find((p) => p.id === project.id);
    expect(info?.status).toMatchObject({ state: 'error' });
    expect(info?.status.message).toMatch(/does not exist/);
  });
});

describe('Git projects', () => {
  let remote: string;

  beforeEach(async () => {
    remote = join(dir, 'remote.git');
    sh(dir, 'init', '-q', '--bare', '-b', 'main', remote);
    // Seed the remote with one commit, like an existing repository.
    const seed = join(dir, 'seed');
    sh(dir, 'clone', '-q', remote, seed);
    await mkdir(join(seed, 'docs'));
    await writeFile(join(seed, 'docs', 'Shared.puml'), '@startuml\nA -> B\n@enduml\n');
    sh(seed, 'add', '.');
    sh(seed, 'commit', '-q', '-m', 'seed');
    sh(seed, 'push', '-q', 'origin', 'HEAD:main');
  });

  /** A second person working on the same repository. */
  async function colleague(change: (clone: string) => Promise<void>): Promise<void> {
    const clone = join(dir, `colleague-${Math.random().toString(36).slice(2)}`);
    sh(dir, 'clone', '-q', remote, clone);
    await change(clone);
    sh(clone, 'add', '-A');
    sh(clone, 'commit', '-q', '-m', 'colleague');
    sh(clone, 'push', '-q', 'origin', 'HEAD:main');
  }

  const remoteFile = (path: string) => sh(dir, `--git-dir=${remote}`, 'show', `main:${path}`);

  it('clones, commits and pushes every save', async () => {
    const projects = createDesktopProjects({ home: dir, defaultDirectory: () => join(dir, 'diagrams'), git });
    const project = await projects.saveProject({ name: 'Repo', location: { type: 'git', url: remote, directory: 'docs' } });
    expect(project.status).toMatchObject({ state: 'synced', branch: 'main' });
    const [shared] = await projects.listDiagrams(project.id);
    expect(shared.id).toBe('Shared.puml');
    // Dates come from the history, not from the time of the clone.
    expect(shared.updatedAt).toBe(new Date(sh(dir, `--git-dir=${remote}`, 'log', '-1', '--format=%cI', 'main').trim()).toISOString());

    const { diagram, status } = await projects.saveDiagram(project.id, { name: 'New one', source: 'graph TD\n  a --> b\n', languageId: 'mermaid' });
    expect(diagram.id).toBe('New one.mmd');
    expect(status).toMatchObject({ state: 'synced', ahead: 0 });
    expect(remoteFile('docs/New one.mmd')).toContain('a --> b');
    expect(sh(dir, `--git-dir=${remote}`, 'log', '-1', '--format=%s', 'main').trim()).toBe('Add New one');

    await projects.deleteDiagram(project.id, diagram.id);
    expect(sh(dir, `--git-dir=${remote}`, 'log', '-1', '--format=%s', 'main').trim()).toBe('Delete New one');
  });

  it('rebases onto changes of others to different diagrams', async () => {
    const store = await GitProjectStore.open({ type: 'git', url: remote, directory: 'docs' }, join(dir, 'clone'), git);
    await colleague(async (clone) => writeFile(join(clone, 'docs', 'Theirs.mmd'), 'graph LR\n'));
    await store.save({ name: 'Mine', source: 'graph TD\n', languageId: 'mermaid' });
    expect(store.status()).toMatchObject({ state: 'synced' });
    expect(remoteFile('docs/Mine.mmd')).toBe('graph TD\n');
    expect(remoteFile('docs/Theirs.mmd')).toBe('graph LR\n');
    expect((await store.list()).map((d) => d.id).sort()).toEqual(['Mine.mmd', 'Shared.puml', 'Theirs.mmd']);
  });

  it('pulls changes of others on sync', async () => {
    const store = await GitProjectStore.open({ type: 'git', url: remote, directory: 'docs' }, join(dir, 'clone'), git);
    await colleague(async (clone) => writeFile(join(clone, 'docs', 'Shared.puml'), '@startuml\nX -> Y\n@enduml\n'));
    expect(await store.sync()).toMatchObject({ state: 'synced' });
    expect((await store.get('Shared.puml'))?.source).toContain('X -> Y');
  });

  it('reports conflicting edits and resolves them as chosen', async () => {
    const open = (name: string) => GitProjectStore.open({ type: 'git', url: remote, directory: 'docs' }, join(dir, name), git);
    for (const [resolution, expected] of [
      ['mine', ['@startuml\nMINE\n@enduml\n', null]],
      ['theirs', ['@startuml\nTHEIRS\n@enduml\n', null]],
      ['both', ['@startuml\nTHEIRS\n@enduml\n', '@startuml\nMINE\n@enduml\n']],
    ] as const) {
      const store = await open(`clone-${resolution}`);
      await colleague(async (clone) => writeFile(join(clone, 'docs', 'Shared.puml'), '@startuml\nTHEIRS\n@enduml\n'));
      await store.save({ id: 'Shared.puml', name: 'Shared', source: '@startuml\nMINE\n@enduml\n', languageId: 'plantuml' });

      const status = store.status();
      expect(status.state).toBe('conflict');
      expect(status.ahead).toBe(1);
      expect(status.conflicts).toEqual([{ id: 'Shared.puml', name: 'Shared', mine: '@startuml\nMINE\n@enduml\n', theirs: '@startuml\nTHEIRS\n@enduml\n' }]);
      // Nothing is lost while the conflict is open: the local version stays.
      expect((await store.get('Shared.puml'))?.source).toContain('MINE');

      const resolved = await store.resolveConflicts({ 'Shared.puml': resolution });
      expect(resolved).toMatchObject({ state: 'synced', ahead: 0 });
      expect(remoteFile('docs/Shared.puml')).toBe(expected[0]);
      expect((await store.get('Shared.puml'))?.source).toBe(expected[0]);
      if (expected[1]) expect(remoteFile('docs/Shared (conflict copy).puml')).toBe(expected[1]);
      // Reset for the next round.
      await colleague(async (clone) => {
        await writeFile(join(clone, 'docs', 'Shared.puml'), '@startuml\nA -> B\n@enduml\n');
        await rm(join(clone, 'docs', 'Shared (conflict copy).puml'), { force: true });
      });
    }
  });

  it('keeps commits locally while the remote is unreachable', async () => {
    const store = await GitProjectStore.open({ type: 'git', url: remote }, join(dir, 'clone'), git);
    await rm(remote, { recursive: true });
    await store.save({ name: 'Offline', source: 'graph TD\n', languageId: 'mermaid' });
    const status = store.status();
    expect(['offline', 'error']).toContain(status.state);
    expect(status.ahead).toBe(1);
    expect(sh(join(dir, 'clone'), 'log', '-1', '--format=%s').trim()).toBe('Add Offline');
  });

  it('starts an empty repository on main', async () => {
    const empty = join(dir, 'empty.git');
    sh(dir, 'init', '-q', '--bare', empty);
    const store = await GitProjectStore.open({ type: 'git', url: empty }, join(dir, 'clone-empty'), git);
    await store.save({ name: 'First', source: 'graph TD\n', languageId: 'mermaid' });
    expect(store.status()).toMatchObject({ state: 'synced', branch: 'main' });
    expect(sh(dir, `--git-dir=${empty}`, 'show', 'main:First.mmd')).toBe('graph TD\n');
  });

  it('removes only the local clone when the project is removed', async () => {
    const projects = createDesktopProjects({ home: dir, defaultDirectory: () => join(dir, 'diagrams'), git });
    const project = await projects.saveProject({ name: 'Repo', location: { type: 'git', url: remote } });
    await projects.deleteProject(project.id, 'delete-diagrams');
    expect(existsSync(join(dir, 'projects', project.id, 'repository'))).toBe(false);
    expect(remoteFile('docs/Shared.puml')).toContain('A -> B');
  });

  it('explains failures', () => {
    expect(explainGitFailure('fatal: could not read Username for https://x: terminal prompts disabled', 'push').kind).toBe('auth');
    expect(explainGitFailure('fatal: unable to access https://x/: Could not resolve host: x', 'push').kind).toBe('offline');
    expect(explainGitFailure('ERROR: Repository not found.', 'clone it').kind).toBe('missing');
  });
});
