import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { resolvePluginReference } from '@sapia/core';
import type { PluginReference } from '@sapia/core';
import { expandPath } from './paths';

/** A plugin found on disk (or referenced by URL). */
export interface ResolvedPlugin {
  /** The reference as written in the config. */
  origin: string;
  /** Directory served to the UI; undefined for plugins loaded from a URL. */
  root?: string;
  /** Module the UI imports, relative to `root` with forward slashes (or an absolute URL). */
  entry: string;
  /** Optional module for the main process (e.g. to register AI providers). */
  mainEntry?: string;
  options: Record<string, unknown>;
}

export interface PluginResolution {
  plugins: ResolvedPlugin[];
  errors: { origin: string; error: string }[];
}

export interface PluginSearchOptions {
  /** Directory relative plugin paths are resolved against (the config's directory). */
  baseDir: string;
  /** `node_modules` directories searched for npm packages, in order. */
  moduleDirs: string[];
  /** Fallback that locates further `node_modules` directories (e.g. the global npm root). */
  lazyModuleDirs?: () => Promise<string[]>;
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}
async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );
}

function pick(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const conditions = value as Record<string, unknown>;
    for (const key of ['sapia', 'browser', 'import', 'module', 'default']) {
      const found = pick(conditions[key]);
      if (found) return found;
    }
  }
  return undefined;
}

interface PackageManifest {
  sapia?: { plugin?: unknown; main?: unknown };
  exports?: unknown;
  module?: unknown;
  browser?: unknown;
  main?: unknown;
}

/**
 * Finds the UI entry module of a plugin package: `sapia.plugin` in its
 * package.json wins, then the usual module fields.
 */
export async function packageEntries(dir: string): Promise<{ entry: string; mainEntry?: string }> {
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as PackageManifest;
  } catch {
    if (await isFile(join(dir, 'index.js'))) return { entry: 'index.js' };
    throw new Error(`No package.json or index.js in ${dir}`);
  }
  const exportsField = manifest.exports;
  const rootExport =
    exportsField && typeof exportsField === 'object' && '.' in (exportsField as object) ? (exportsField as Record<string, unknown>)['.'] : exportsField;
  const candidates = [pick(manifest.sapia?.plugin), pick(rootExport), pick(manifest.module), pick(manifest.browser), pick(manifest.main), 'index.js'];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const file = resolve(dir, candidate);
    if (!inside(dir, file)) continue;
    if (await isFile(file)) {
      const mainEntry = typeof manifest.sapia?.main === 'string' ? resolve(dir, manifest.sapia.main) : undefined;
      return {
        entry: toUrlPath(file.slice(dir.length + 1)),
        mainEntry: mainEntry && inside(dir, mainEntry) && (await isFile(mainEntry)) ? mainEntry : undefined,
      };
    }
  }
  throw new Error(`No plugin entry found in ${dir} (set "sapia.plugin" in its package.json)`);
}

export function inside(root: string, file: string): boolean {
  const base = root.endsWith(sep) ? root : root + sep;
  return file.startsWith(base);
}

function toUrlPath(path: string): string {
  return path.split(sep).join('/');
}

/** Asks npm where global packages live. Slow, so only used as a last resort. */
export function globalNpmRoot(): Promise<string[]> {
  return new Promise((done) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFile(npm, ['root', '-g'], { timeout: 8000, shell: process.platform === 'win32', windowsHide: true }, (error, stdout) => {
      const root = stdout?.toString().trim();
      done(!error && root ? [root] : []);
    });
  });
}

/** Resolves the plugin references of a config to modules the UI can import. */
export async function resolvePlugins(references: PluginReference[], search: PluginSearchOptions): Promise<PluginResolution> {
  const result: PluginResolution = { plugins: [], errors: [] };
  let lazyDirs: Promise<string[]> | undefined;

  for (const reference of references) {
    const ref = resolvePluginReference(reference);
    if (!ref || !ref.enabled) continue;
    try {
      if (ref.kind === 'url') {
        result.plugins.push({ origin: ref.target, entry: ref.target, options: ref.options });
        continue;
      }
      if (ref.kind === 'path') {
        const path = expandPath(ref.target, search.baseDir);
        if (await isDirectory(path)) {
          result.plugins.push({ origin: ref.target, root: path, ...(await packageEntries(path)), options: ref.options });
        } else if (await isFile(path)) {
          result.plugins.push({ origin: ref.target, root: dirname(path), entry: toUrlPath(path.slice(dirname(path).length + 1)), options: ref.options });
        } else throw new Error(`${path} does not exist`);
        continue;
      }
      // npm package
      if (!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(ref.target)) throw new Error(`"${ref.target}" is not a valid package name`);
      let found: string | undefined;
      for (const dir of search.moduleDirs) {
        if (await isDirectory(join(dir, ref.target))) {
          found = join(dir, ref.target);
          break;
        }
      }
      if (!found && search.lazyModuleDirs) {
        lazyDirs ??= search.lazyModuleDirs();
        for (const dir of await lazyDirs) {
          if (await isDirectory(join(dir, ref.target))) {
            found = join(dir, ref.target);
            break;
          }
        }
      }
      if (!found) {
        throw new Error(`Package "${ref.target}" is not installed. Install it with: npm install --prefix ~/.sapia/plugins ${ref.target}`);
      }
      result.plugins.push({ origin: ref.target, root: found, ...(await packageEntries(found)), options: ref.options });
    } catch (e) {
      result.errors.push({ origin: ref.target, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
