import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, posix } from 'node:path';
import type { ConflictResolution, DiagramConflict, ProjectLocation, ProjectStatus, ProjectStore, StoredDiagram, StoredDiagramMeta, DiagramDraft } from '@sapia/core';
import { SourceFileDiagramStore, fileNameFor, languageForExtension } from './source-file-store';
import type { FileChange } from './source-file-store';

type GitLocation = Extract<ProjectLocation, { type: 'git' }>;

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class GitError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'auth' | 'missing' | 'failed',
    readonly detail = '',
  ) {
    super(message);
    this.name = 'GitError';
  }
}

const NETWORK = /could not resolve host|unable to access|connection (refused|timed out|reset)|network is unreachable|could not read from remote|operation timed out|failed to connect|no route to host|timed out/i;
const AUTH = /authentication failed|could not read username|could not read password|permission denied \(publickey|terminal prompts disabled|access denied|401|403/i;

/** Turns git's stderr into an error a user can act on. */
export function explainGitFailure(stderr: string, action: string): GitError {
  const detail = stderr.trim().split('\n').filter((l) => l.trim() && !/^hint:/.test(l)).slice(-3).join('\n');
  if (AUTH.test(stderr)) {
    return new GitError(
      `Git could not sign in to the repository while trying to ${action}. Set up access the way you would for git on the command line (an SSH key or a credential helper), then sync again.`,
      'auth',
      detail,
    );
  }
  if (NETWORK.test(stderr)) return new GitError(`The repository cannot be reached right now (${action}). Your changes are kept and pushed later.`, 'offline', detail);
  if (/repository .* not found|does not appear to be a git repository|not found/i.test(stderr)) {
    return new GitError(`The repository was not found. Check the URL and your access rights.`, 'missing', detail);
  }
  return new GitError(`Git failed to ${action}: ${detail || 'unknown error'}`, 'failed', detail);
}

export interface GitRunnerOptions {
  binary?: string;
  env?: NodeJS.ProcessEnv;
}

/** Runs git without prompts, with English output that can be parsed. */
export function createGitRunner(options: GitRunnerOptions = {}) {
  const env = { ...(options.env ?? process.env), GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', LANG: 'C', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' };
  return (cwd: string, args: string[], timeout = 120_000): Promise<GitResult> =>
    new Promise((resolveRun, reject) => {
      execFile(options.binary ?? 'git', args, { cwd, env, timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          return reject(new GitError('Git is not installed or not on the PATH. Install Git to use repository projects.', 'failed'));
        }
        const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? ((error as { code: number }).code) : 1) : 0;
        resolveRun({ code, stdout: String(stdout), stderr: String(stderr) });
      });
    });
}

export type GitRunner = ReturnType<typeof createGitRunner>;

/** Clones a repository for a project. Leaves nothing behind when it fails. */
export async function cloneRepository(location: GitLocation, target: string, git: GitRunner): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  let result = await git(dirname(target), ['clone', ...(location.branch ? ['--branch', location.branch] : []), '--', location.url, target], 300_000);
  if (result.code !== 0 && location.branch && /remote branch .* not found/i.test(result.stderr)) {
    // A branch that does not exist yet is created with the first save.
    await rm(target, { recursive: true, force: true });
    result = await git(dirname(target), ['clone', '--', location.url, target], 300_000);
    if (result.code === 0) {
      const checkout = await git(target, ['checkout', '-b', location.branch]);
      if (checkout.code !== 0) result = checkout;
    }
  }
  if (result.code !== 0) {
    await rm(target, { recursive: true, force: true });
    throw explainGitFailure(result.stderr, 'clone it');
  }
  // An empty repository has no branch yet: commit to `main` unless asked otherwise.
  if (!location.branch && (await git(target, ['rev-parse', '--verify', '-q', 'HEAD'])).code !== 0) {
    await git(target, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  }
}

/**
 * A project in a Git repository: diagrams are plain files in a local clone,
 * every change is committed and pushed. When someone else changed the same
 * diagrams, the push is rebased; real conflicts are reported for the user to
 * resolve diagram by diagram.
 */
export class GitProjectStore implements ProjectStore {
  private readonly files: SourceFileDiagramStore;
  private current: ProjectStatus = { state: 'synced' };
  private queue: Promise<unknown> = Promise.resolve();
  private branchName = '';

  private constructor(
    private readonly location: GitLocation,
    private readonly clone: string,
    private readonly git: GitRunner,
  ) {
    this.files = new SourceFileDiagramStore(join(clone, ...(location.directory ? location.directory.split(/[\\/]/) : [])));
    this.files.onChange = (change) => this.commit(change);
  }

  /** Opens (and clones, when missing) the repository of a project. */
  static async open(location: GitLocation, clone: string, git: GitRunner): Promise<GitProjectStore> {
    if (!existsSync(join(clone, '.git'))) await cloneRepository(location, clone, git);
    const store = new GitProjectStore(location, clone, git);
    store.branchName = await store.detectBranch();
    store.current = { state: 'synced', branch: store.branchName };
    await store.refreshAhead();
    return store;
  }

  private get prefix(): string {
    return this.location.directory ? `${this.location.directory.replace(/\\/g, '/')}/` : '';
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async run(args: string[], action: string, timeout?: number): Promise<string> {
    const result = await this.git(this.clone, args, timeout);
    if (result.code !== 0) throw explainGitFailure(result.stderr || result.stdout, action);
    return result.stdout;
  }

  private async detectBranch(): Promise<string> {
    if (this.location.branch) return this.location.branch;
    const result = await this.git(this.clone, ['symbolic-ref', '--short', 'HEAD']);
    return result.stdout.trim() || 'main';
  }

  private get remoteRef(): string {
    return `refs/remotes/origin/${this.branchName}`;
  }

  private async exists(ref: string): Promise<boolean> {
    return (await this.git(this.clone, ['rev-parse', '--verify', '-q', ref])).code === 0;
  }

  private async count(range: string): Promise<number> {
    const result = await this.git(this.clone, ['rev-list', '--count', range]);
    return result.code === 0 ? Number(result.stdout.trim()) || 0 : 0;
  }

  private async refreshAhead(): Promise<number> {
    if (!(await this.exists('HEAD'))) return 0;
    const ahead = (await this.exists(this.remoteRef)) ? await this.count(`${this.remoteRef}..HEAD`) : await this.count('HEAD');
    if (this.current.state !== 'conflict' && this.current.state !== 'error' && this.current.state !== 'offline') {
      this.current = { ...this.current, state: ahead > 0 ? 'pending' : 'synced', ahead };
    } else this.current = { ...this.current, ahead };
    return ahead;
  }

  status(): ProjectStatus {
    return { ...this.current, branch: this.branchName };
  }

  // -- diagrams ------------------------------------------------------------------
  list(): Promise<StoredDiagramMeta[]> {
    return this.serial(async () => {
      const list = await this.files.list();
      // A clone gives every file the checkout time: take the dates from the history instead.
      const dates = await this.commitDates();
      return list
        .map((d) => {
          const known = dates.get(this.prefix + d.id);
          return known ? { ...d, createdAt: known.created, updatedAt: known.updated } : d;
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }

  /** Last and first commit date per path, from one pass over the history. */
  private async commitDates(): Promise<Map<string, { created: string; updated: string }>> {
    const dates = new Map<string, { created: string; updated: string }>();
    const log = await this.git(this.clone, ['log', '-n', '5000', '--format=%x01%cI', '--name-only', '--no-renames', 'HEAD', '--', this.prefix || '.']);
    if (log.code !== 0) return dates;
    for (const entry of log.stdout.split('\x01').slice(1)) {
      const [date, ...paths] = entry.split('\n');
      const when = new Date(date.trim()).toISOString();
      for (const path of paths) {
        if (!path) continue;
        const known = dates.get(path);
        // Newest commits come first.
        dates.set(path, known ? { ...known, created: when } : { created: when, updated: when });
      }
    }
    return dates;
  }

  get(id: string): Promise<StoredDiagram | null> {
    return this.serial(() => this.files.get(id));
  }

  save(draft: DiagramDraft): Promise<StoredDiagram> {
    return this.serial(() => this.files.save(draft));
  }

  delete(id: string): Promise<void> {
    return this.serial(() => this.files.delete(id));
  }

  private async identity(): Promise<string[]> {
    const email = await this.git(this.clone, ['config', 'user.email']);
    return email.stdout.trim() ? [] : ['-c', 'user.name=Sapia', '-c', 'user.email=sapia@localhost'];
  }

  /** Commits a change and tries to push it. The commit is never lost, even offline. */
  private async commit(change: FileChange): Promise<void> {
    const paths = [...change.written, ...change.removed].map((p) => this.prefix + p);
    await this.run(['add', '-A', '--', ...paths], 'stage the change');
    const staged = await this.git(this.clone, ['diff', '--cached', '--quiet']);
    if (staged.code === 0) return;
    await this.run([...(await this.identity()), 'commit', '-q', '-m', change.summary], 'commit the change');
    await this.integrate();
  }

  // -- synchronisation -------------------------------------------------------------
  sync(): Promise<ProjectStatus> {
    return this.serial(async () => {
      // Pick up anything left uncommitted, e.g. after a crash.
      await this.git(this.clone, ['add', '-A', '--', this.prefix || '.']);
      if ((await this.git(this.clone, ['diff', '--cached', '--quiet'])).code !== 0) {
        await this.run([...(await this.identity()), 'commit', '-q', '-m', 'Save changes'], 'commit the change');
      }
      await this.integrate();
      return this.status();
    });
  }

  private setFailure(error: unknown): void {
    if (error instanceof GitError && error.kind === 'offline') this.current = { ...this.current, state: 'offline', message: error.message };
    else this.current = { ...this.current, state: 'error', message: error instanceof Error ? error.message : String(error) };
  }

  /** Fetches, rebases local commits onto the remote and pushes them. */
  private async integrate(): Promise<void> {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const fetch = await this.git(this.clone, ['fetch', '--prune', 'origin'], 120_000);
        if (fetch.code !== 0) throw explainGitFailure(fetch.stderr, 'fetch changes');
        const remote = await this.exists(this.remoteRef);
        const hasHead = await this.exists('HEAD');

        if (remote && !hasHead) {
          await this.run(['checkout', '-q', '-B', this.branchName, this.remoteRef], 'check out the branch');
        } else if (remote) {
          const behind = await this.count(`HEAD..${this.remoteRef}`);
          const ahead = await this.count(`${this.remoteRef}..HEAD`);
          if (behind > 0 && ahead === 0) await this.run(['merge', '-q', '--ff-only', this.remoteRef], 'update the local copy');
          else if (behind > 0) {
            const rebase = await this.git(this.clone, ['rebase', '-q', this.remoteRef]);
            if (rebase.code !== 0) {
              await this.git(this.clone, ['rebase', '--abort']);
              const conflicts = await this.findConflicts();
              this.current = {
                state: 'conflict',
                branch: this.branchName,
                ahead,
                lastSyncedAt: this.current.lastSyncedAt,
                conflicts,
                message: 'Someone else changed the same diagrams.',
              };
              return;
            }
          }
        }

        const ahead = hasHead || remote ? (remote ? await this.count(`${this.remoteRef}..HEAD`) : await this.count('HEAD')) : 0;
        if (ahead > 0) {
          const push = await this.git(this.clone, ['push', '-q', '-u', 'origin', `HEAD:refs/heads/${this.branchName}`], 120_000);
          if (push.code !== 0) {
            // Someone pushed in between: fetch and rebase again.
            if (/rejected|non-fast-forward|fetch first/i.test(push.stderr) && attempt < 2) continue;
            throw explainGitFailure(push.stderr, 'push your changes');
          }
        }
        this.current = { state: 'synced', branch: this.branchName, ahead: 0, lastSyncedAt: new Date().toISOString() };
        return;
      }
    } catch (e) {
      this.setFailure(e);
      await this.refreshAhead();
    }
  }

  private idFor(path: string): string | null {
    if (!path.startsWith(this.prefix)) return null;
    const id = path.slice(this.prefix.length);
    const ext = extname(id).slice(1);
    return languageForExtension(ext) || ext === 'txt' ? id : null;
  }

  private async show(revision: string, path: string): Promise<string | null> {
    const result = await this.git(this.clone, ['show', `${revision}:${path}`]);
    return result.code === 0 ? result.stdout : null;
  }

  /** The diagrams that cannot be merged automatically. */
  private async findConflicts(): Promise<DiagramConflict[]> {
    let paths: string[] = [];
    const tree = await this.git(this.clone, ['merge-tree', '--write-tree', '--name-only', '--no-messages', this.remoteRef, 'HEAD']);
    if (tree.code === 1) paths = tree.stdout.split('\n').slice(1).filter(Boolean);
    else {
      // Older git: every diagram both sides changed.
      const mine = (await this.git(this.clone, ['diff', '--name-only', `${this.remoteRef}...HEAD`])).stdout.split('\n');
      const theirs = new Set((await this.git(this.clone, ['diff', '--name-only', `HEAD...${this.remoteRef}`])).stdout.split('\n'));
      paths = mine.filter((p) => p && theirs.has(p));
    }
    const conflicts: DiagramConflict[] = [];
    for (const path of [...new Set(paths)]) {
      const id = this.idFor(path);
      if (!id) continue;
      conflicts.push({
        id,
        name: basename(id, extname(id)),
        mine: await this.show('HEAD', path),
        theirs: await this.show(this.remoteRef, path),
      });
    }
    return conflicts;
  }

  private async rebasing(): Promise<boolean> {
    const dir = (await this.git(this.clone, ['rev-parse', '--git-dir'])).stdout.trim();
    const gitDir = join(this.clone, dir);
    return existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'));
  }

  /** Rebases again and settles every conflicting diagram as the user chose. */
  resolveConflicts(resolutions: Record<string, ConflictResolution>): Promise<ProjectStatus> {
    return this.serial(async () => {
      try {
        await this.run(['fetch', 'origin'], 'fetch changes');
        const identity = await this.identity();
        let result = await this.git(this.clone, [...identity, 'rebase', '-q', this.remoteRef]);
        for (let step = 0; result.code !== 0 && (await this.rebasing()) && step < 200; step++) {
          const unmerged = (await this.git(this.clone, ['diff', '--name-only', '--diff-filter=U'])).stdout.split('\n').filter(Boolean);
          for (const path of unmerged) await this.settle(path, resolutions[this.idFor(path) ?? ''] ?? 'both');
          const staged = await this.git(this.clone, ['diff', '--cached', '--quiet']);
          result = staged.code === 0 ? await this.git(this.clone, ['rebase', '--skip']) : await this.git(this.clone, [...identity, 'rebase', '--continue']);
        }
        if (await this.rebasing()) {
          await this.git(this.clone, ['rebase', '--abort']);
          throw new GitError('The conflicts could not be resolved automatically.', 'failed', result.stderr);
        }
        this.current = { state: 'pending', branch: this.branchName };
        await this.integrate();
      } catch (e) {
        this.setFailure(e);
      }
      return this.status();
    });
  }

  /** During a rebase, stage 2 is the remote version and stage 3 the local commit being replayed. */
  private async settle(path: string, resolution: ConflictResolution): Promise<void> {
    const theirs = await this.show(':2', path);
    const mine = await this.show(':3', path);
    const absolute = join(this.clone, ...path.split('/'));
    const put = async (file: string, relativePath: string, content: string | null) => {
      if (content === null) {
        await this.git(this.clone, ['rm', '-q', '--cached', '--ignore-unmatch', '--', relativePath]);
        await rm(file, { force: true });
      } else {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, content, 'utf8');
        await this.run(['add', '--', relativePath], 'stage the resolution');
      }
    };
    if (resolution === 'mine') return put(absolute, path, mine);
    await put(absolute, path, theirs);
    if (resolution === 'both' && mine !== null) {
      const ext = extname(path);
      const copyName = `${fileNameFor(basename(path, ext))} (conflict copy)`;
      let copy = posix.join(posix.dirname(path), `${copyName}${ext}`);
      for (let n = 2; existsSync(join(this.clone, ...copy.split('/'))); n++) copy = posix.join(posix.dirname(path), `${copyName} ${n}${ext}`);
      await put(join(this.clone, ...copy.split('/')), copy, mine);
    }
  }

  /** The local clone belongs to Sapia; the remote repository is never touched. */
  async dispose(): Promise<void> {
    await this.queue;
    await rm(this.clone, { recursive: true, force: true });
  }
}
