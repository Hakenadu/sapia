import { Injectable, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { localizedText } from '@sapia/core';
import type { LocalizedText } from '@sapia/core';
import { SapiaService } from '../core/sapia.service';
import { renderLegalMarkdown } from './legal-markdown';
import { LEGAL_DOCS } from './legal-content';
import type { LegalDocId } from './legal-content';
import { LEGAL_DIALOG_OPTIONS, LegalDialog } from './legal-dialog';
import type { LegalDialogData } from './legal-dialog';

/** Address fragments that open a legal text directly, e.g. `https://…/#impressum`. */
const FRAGMENTS: Record<string, LegalDocId> = {
  imprint: 'imprint',
  impressum: 'imprint',
  privacy: 'privacy',
  datenschutz: 'privacy',
  terms: 'terms',
  nutzungsbedingungen: 'terms',
};

/**
 * One legal document as this deployment shows it: the bundled text, the
 * operator's own Markdown (inline or from a file), or a link to the
 * operator's own page.
 */
export type LegalEntry =
  | { id: LegalDocId; kind: 'builtin' }
  | { id: LegalDocId; kind: 'markdown'; markdown: LocalizedText }
  | { id: LegalDocId; kind: 'file'; file: LocalizedText }
  | { id: LegalDocId; kind: 'url'; url: string };

@Injectable({ providedIn: 'root' })
export class LegalService {
  private readonly dialog = inject(MatDialog);
  private readonly sapia = inject(SapiaService);
  private readonly files = new Map<string, Promise<string>>();

  /**
   * The documents to offer, in order. Imprint and privacy policy follow the
   * web deployment's `legal` config; the terms of use and everything in
   * Sapia Desktop are always the bundled texts.
   */
  readonly entries = computed<LegalEntry[]>(() => {
    const legal = this.sapia.host ? {} : this.sapia.config().legal;
    return LEGAL_DOCS.flatMap((id): LegalEntry[] => {
      const setting = id === 'terms' ? undefined : legal[id];
      if (setting === false) return [];
      if (setting === undefined || setting === 'default') return [{ id, kind: 'builtin' }];
      if ('url' in setting) return [{ id, kind: 'url', url: new URL(setting.url, document.baseURI).href }];
      if ('markdown' in setting) return [{ id, kind: 'markdown', markdown: setting.markdown }];
      return [{ id, kind: 'file', file: setting.file }];
    });
  });

  entry(doc: LegalDocId): LegalEntry | undefined {
    return this.entries().find((entry) => entry.id === doc);
  }

  /** Opens a document: in the legal dialog, or the operator's own page in a new tab. Hidden documents do nothing. */
  open(doc: LegalDocId): void {
    const entry = this.entry(doc);
    if (!entry) return;
    if (entry.kind === 'url') {
      window.open(entry.url, '_blank', 'noopener');
      return;
    }
    const current = this.dialog.openDialogs.find((ref) => ref.componentInstance instanceof LegalDialog);
    if (current) current.close();
    this.dialog.open<LegalDialog, LegalDialogData>(LegalDialog, { ...LEGAL_DIALOG_OPTIONS, data: { doc } });
  }

  /** HTML for an operator-provided document in the given locale. Files are fetched once, relative to the deployment. */
  async render(entry: LegalEntry, locale: string): Promise<string> {
    if (entry.kind === 'markdown') return renderLegalMarkdown(localizedText(entry.markdown, locale));
    if (entry.kind !== 'file') return '';
    const url = new URL(localizedText(entry.file, locale), document.baseURI).href;
    let text = this.files.get(url);
    if (!text) {
      text = fetch(url, { cache: 'no-cache' }).then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
        return response.text();
      });
      text.catch(() => this.files.delete(url));
      this.files.set(url, text);
    }
    return renderLegalMarkdown(await text);
  }

  /** The legal text a fragment such as `#datenschutz` points to. */
  static fromFragment(hash: string): LegalDocId | null {
    return FRAGMENTS[hash.replace(/^#\/?/, '').toLowerCase()] ?? null;
  }
}
