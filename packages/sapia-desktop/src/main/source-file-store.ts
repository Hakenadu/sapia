import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type { DiagramDraft, DiagramStore, StoredDiagram, StoredDiagramMeta } from '@sapia/core';

/** File extensions per language; the first one is used for new files. */
const EXTENSIONS: Record<string, string[]> = {
  plantuml: ['puml', 'plantuml', 'pu', 'iuml', 'wsd'],
  mermaid: ['mmd', 'mermaid'],
};
const FALLBACK_EXTENSION = 'txt';
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'target']);
const MAX_DEPTH = 4;

export function languageForExtension(extension: string): string | undefined {
  const ext = extension.replace(/^\./, '').toLowerCase();
  return Object.keys(EXTENSIONS).find((language) => EXTENSIONS[language].includes(ext));
}

function isDiagramFile(name: string): boolean {
  const ext = extname(name).slice(1).toLowerCase();
  return ext === FALLBACK_EXTENSION || !!languageForExtension(ext);
}

/** Turns a diagram name into a file name that works on every operating system. */
export function fileNameFor(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.]+$/g, '')
    .slice(0, 120)
    .trim();
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned);
  return cleaned && !reserved ? cleaned : 'Untitled';
}

export interface FileChange {
  /** Paths relative to the store's directory, with forward slashes. */
  written: string[];
  removed: string[];
  /** Short description for a commit message. */
  summary: string;
}

/**
 * Keeps diagrams as plain source files (`Order flow.puml`) in a folder, so
 * they work with other tools and diff nicely in Git. The id of a diagram is
 * its path relative to the folder; renaming a diagram renames its file.
 */
export class SourceFileDiagramStore implements DiagramStore {
  /** Called after every change, e.g. to commit it. */
  onChange?: (change: FileChange) => Promise<void>;

  constructor(readonly directory: string) {}

  private path(id: string): string {
    const target = resolve(this.directory, id);
    const root = resolve(this.directory);
    if (!target.startsWith(root + sep) || !isDiagramFile(target)) throw new Error(`Invalid diagram id: ${id}`);
    return target;
  }

  private idFor(file: string): string {
    return relative(this.directory, file).split(sep).join('/');
  }

  private async files(directory: string, depth: number): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }
    const nested = await Promise.all(
      entries.map(async (entry) => {
        if (entry.name.startsWith('.')) return [];
        const full = join(directory, entry.name);
        if (entry.isDirectory()) return depth < MAX_DEPTH && !SKIPPED_DIRECTORIES.has(entry.name) ? this.files(full, depth + 1) : [];
        return entry.isFile() && isDiagramFile(entry.name) ? [full] : [];
      }),
    );
    return nested.flat();
  }

  private async meta(file: string): Promise<StoredDiagramMeta | null> {
    try {
      const info = await stat(file);
      const ext = extname(file);
      return {
        id: this.idFor(file),
        name: file.slice(dirname(file).length + 1, file.length - ext.length),
        languageId: languageForExtension(ext),
        createdAt: (info.birthtimeMs > 0 ? info.birthtime : info.mtime).toISOString(),
        updatedAt: info.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }

  async list(): Promise<StoredDiagramMeta[]> {
    const metas = await Promise.all((await this.files(this.directory, 0)).map((file) => this.meta(file)));
    return metas.filter((m): m is StoredDiagramMeta => m !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<StoredDiagram | null> {
    let file: string;
    try {
      file = this.path(id);
    } catch {
      return null;
    }
    const meta = await this.meta(file);
    if (!meta) return null;
    try {
      return { ...meta, source: await readFile(file, 'utf8') };
    } catch {
      return null;
    }
  }

  /** A free path for a diagram name next to `folder`, ignoring `keep` (the file being renamed). */
  private async freePath(folder: string, name: string, extension: string, keep?: string): Promise<string> {
    const base = fileNameFor(name);
    for (let n = 1; ; n++) {
      const candidate = join(folder, `${n === 1 ? base : `${base} ${n}`}.${extension}`);
      if (candidate === keep) return candidate;
      try {
        await stat(candidate);
      } catch {
        return candidate;
      }
    }
  }

  async save(draft: DiagramDraft): Promise<StoredDiagram> {
    const existing = draft.id ? await this.get(draft.id) : null;
    const previous = existing ? this.path(existing.id) : undefined;
    const known = EXTENSIONS[draft.languageId ?? ''];
    const currentExt = previous ? extname(previous).slice(1) : undefined;
    // Keep the file's extension while it still fits the language.
    const extension = currentExt && (!known || known.includes(currentExt.toLowerCase())) ? currentExt : (known?.[0] ?? FALLBACK_EXTENSION);
    const folder = previous ? dirname(previous) : this.directory;
    const name = draft.name.trim() || existing?.name || 'Untitled';
    const unchangedName = existing && fileNameFor(name) === fileNameFor(existing.name) && extension === currentExt;
    const target = unchangedName ? previous! : await this.freePath(folder, name, extension, previous);

    await mkdir(dirname(target), { recursive: true });
    const temp = join(dirname(target), `.${process.pid}.${Date.now()}.sapia-tmp`);
    await writeFile(temp, draft.source, 'utf8');
    await rename(temp, target);
    if (previous && previous !== target) await rm(previous, { force: true });

    const id = this.idFor(target);
    const removed = previous && previous !== target ? [this.idFor(previous)] : [];
    const label = name;
    const summary = !existing ? `Add ${label}` : removed.length ? `Rename ${existing.name} to ${label}` : `Update ${label}`;
    await this.onChange?.({ written: [id], removed, summary });
    const saved = await this.get(id);
    if (!saved) throw new Error(`Could not read ${target} after saving it.`);
    return { ...saved, diagramType: draft.diagramType, languageId: draft.languageId ?? saved.languageId };
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;
    await rm(this.path(id), { force: true });
    await this.onChange?.({ written: [], removed: [id], summary: `Delete ${existing.name}` });
  }
}
