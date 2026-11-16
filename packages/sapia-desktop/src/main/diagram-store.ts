import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyDraft } from '@sapia/core';
import type { DiagramDraft, DiagramStore, StoredDiagram, StoredDiagramMeta } from '@sapia/core';

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Keeps every diagram as one JSON file in a directory (default `~/.sapia/diagrams`). */
export class FileDiagramStore implements DiagramStore {
  constructor(private readonly directory: string) {}

  private file(id: string): string {
    if (!SAFE_ID.test(id)) throw new Error(`Invalid diagram id: ${id}`);
    return join(this.directory, `${id}.json`);
  }

  private async read(file: string): Promise<StoredDiagram | null> {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<StoredDiagram>;
      if (typeof parsed.id !== 'string' || typeof parsed.source !== 'string') return null;
      return {
        id: parsed.id,
        name: typeof parsed.name === 'string' ? parsed.name : parsed.id,
        source: parsed.source,
        languageId: parsed.languageId,
        diagramType: parsed.diagramType,
        createdAt: parsed.createdAt ?? new Date(0).toISOString(),
        updatedAt: parsed.updatedAt ?? parsed.createdAt ?? new Date(0).toISOString(),
      };
    } catch {
      return null;
    }
  }

  async list(): Promise<StoredDiagramMeta[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch {
      return [];
    }
    const diagrams = await Promise.all(names.filter((n) => n.endsWith('.json')).map((n) => this.read(join(this.directory, n))));
    return diagrams
      .filter((d): d is StoredDiagram => d !== null)
      .map(({ source: _source, ...meta }) => meta)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<StoredDiagram | null> {
    if (!SAFE_ID.test(id)) return null;
    return this.read(this.file(id));
  }

  async save(draft: DiagramDraft): Promise<StoredDiagram> {
    const existing = draft.id ? await this.get(draft.id) : null;
    const diagram = applyDraft(existing, draft);
    await mkdir(this.directory, { recursive: true });
    const file = this.file(diagram.id);
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(diagram, null, 2)}\n`, 'utf8');
    await rename(temp, file);
    return diagram;
  }

  async delete(id: string): Promise<void> {
    if (!SAFE_ID.test(id)) return;
    await rm(this.file(id), { force: true });
  }
}
