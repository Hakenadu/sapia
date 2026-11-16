export interface StoredDiagram {
  id: string;
  name: string;
  source: string;
  languageId?: string;
  diagramType?: string;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
}

export type StoredDiagramMeta = Omit<StoredDiagram, 'source'>;

export interface DiagramDraft {
  id?: string;
  name: string;
  source: string;
  languageId?: string;
  diagramType?: string;
}

/** Persistence for diagrams. Web and desktop provide their own implementation. */
export interface DiagramStore {
  list(): Promise<StoredDiagramMeta[]>;
  get(id: string): Promise<StoredDiagram | null>;
  /** Creates the diagram, or updates it when `draft.id` exists. */
  save(draft: DiagramDraft): Promise<StoredDiagram>;
  delete(id: string): Promise<void>;
}

/** The subset of the Web Storage API the key-value store needs. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createDiagramId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toMeta(d: StoredDiagram): StoredDiagramMeta {
  const { source: _source, ...meta } = d;
  return meta;
}

/** Applies a draft to an existing diagram (or creates a new one). */
export function applyDraft(existing: StoredDiagram | null, draft: DiagramDraft, now = new Date()): StoredDiagram {
  const iso = now.toISOString();
  return {
    id: existing?.id ?? draft.id ?? createDiagramId(),
    name: draft.name.trim() || existing?.name || 'Untitled',
    source: draft.source,
    languageId: draft.languageId,
    diagramType: draft.diagramType,
    createdAt: existing?.createdAt ?? iso,
    updatedAt: iso,
  };
}

/**
 * {@link DiagramStore} on top of a synchronous key-value storage such as
 * `localStorage`. Keeps an index entry plus one entry per diagram.
 */
export class KeyValueDiagramStore implements DiagramStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly prefix = 'sapia.diagrams',
  ) {}

  private readIndex(): StoredDiagramMeta[] {
    try {
      const raw = this.storage.getItem(`${this.prefix}.index`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeIndex(index: StoredDiagramMeta[]): void {
    this.storage.setItem(`${this.prefix}.index`, JSON.stringify(index));
  }

  async list(): Promise<StoredDiagramMeta[]> {
    return this.readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<StoredDiagram | null> {
    try {
      const raw = this.storage.getItem(`${this.prefix}.item.${id}`);
      return raw ? (JSON.parse(raw) as StoredDiagram) : null;
    } catch {
      return null;
    }
  }

  async save(draft: DiagramDraft): Promise<StoredDiagram> {
    const existing = draft.id ? await this.get(draft.id) : null;
    const diagram = applyDraft(existing, draft);
    this.storage.setItem(`${this.prefix}.item.${diagram.id}`, JSON.stringify(diagram));
    this.writeIndex([...this.readIndex().filter((d) => d.id !== diagram.id), toMeta(diagram)]);
    return diagram;
  }

  async delete(id: string): Promise<void> {
    this.storage.removeItem(`${this.prefix}.item.${id}`);
    this.writeIndex(this.readIndex().filter((d) => d.id !== id));
  }
}

/** In-memory storage, useful for tests and as a fallback when storage is blocked. */
export class MemoryStorage implements KeyValueStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}
