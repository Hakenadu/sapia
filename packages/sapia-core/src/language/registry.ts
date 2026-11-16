import type { Detection, DocumentSymbol, LanguageSupport, LocateRequest } from './language';
import { UNKNOWN_DIAGRAM_TYPE } from './language';
import type { TextRange } from '../text/text';

export type Disposable = () => void;

/** Holds all language supports contributed by plugins. */
export class LanguageRegistry {
  private readonly languages = new Map<string, LanguageSupport>();
  private readonly listeners = new Set<() => void>();

  register(language: LanguageSupport): Disposable {
    if (this.languages.has(language.id)) {
      throw new Error(`Language "${language.id}" is already registered`);
    }
    this.languages.set(language.id, language);
    this.emit();
    return () => {
      if (this.languages.get(language.id) === language) {
        this.languages.delete(language.id);
        this.emit();
      }
    };
  }

  get(id: string | null | undefined): LanguageSupport | undefined {
    return id ? this.languages.get(id) : undefined;
  }

  all(): LanguageSupport[] {
    return [...this.languages.values()];
  }

  onChange(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Asks every language whether it recognises the source and returns the
   * most confident answer, or `null` when nobody does.
   */
  detect(source: string): Detection | null {
    if (!source.trim()) return null;
    let best: Detection | null = null;
    for (const language of this.languages.values()) {
      let result;
      try {
        result = language.detect(source);
      } catch {
        result = null;
      }
      if (!result || result.confidence <= 0) continue;
      if (!best || result.confidence > best.confidence) {
        best = {
          languageId: language.id,
          diagramType: result.diagramType || UNKNOWN_DIAGRAM_TYPE,
          confidence: Math.min(1, result.confidence),
        };
      }
    }
    return best;
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Generic fallback for {@link LanguageSupport.locate}: matches the text of
 * the clicked element (and its ancestors) against the document symbols.
 */
export function locateByText(request: LocateRequest, symbols: DocumentSymbol[]): TextRange | null {
  const candidates: string[] = [];
  for (const el of request.path.slice(0, 6)) {
    const title = el.attributes['title'];
    if (el.text) candidates.push(el.text);
    if (title) candidates.push(title);
  }
  for (const raw of candidates) {
    const text = normalise(raw);
    if (!text || text.length > 200) continue;
    const exact = symbols.find((s) => normalise(s.label ?? s.name) === text || normalise(s.name) === text);
    if (exact) return exact.selectionRange ?? exact.range;
  }
  // Fall back to a literal occurrence of the clicked text in the source.
  const first = request.path[0]?.text?.trim();
  if (first && first.length >= 2 && first.length <= 120) {
    const idx = request.source.indexOf(first);
    if (idx >= 0) return { from: idx, to: idx + first.length };
  }
  return null;
}
