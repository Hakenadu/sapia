import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { LEGAL_DIALOG_OPTIONS, LegalDialog } from './legal-dialog';
import type { LegalDialogData } from './legal-dialog';
import type { LegalDocId } from './legal-content';

/** Address fragments that open a legal text directly, e.g. `https://…/#impressum`. */
const FRAGMENTS: Record<string, LegalDocId> = {
  imprint: 'imprint',
  impressum: 'imprint',
  privacy: 'privacy',
  datenschutz: 'privacy',
  terms: 'terms',
  nutzungsbedingungen: 'terms',
};

@Injectable({ providedIn: 'root' })
export class LegalService {
  private readonly dialog = inject(MatDialog);

  open(doc: LegalDocId): void {
    const current = this.dialog.openDialogs.find((ref) => ref.componentInstance instanceof LegalDialog);
    if (current) current.close();
    this.dialog.open<LegalDialog, LegalDialogData>(LegalDialog, { ...LEGAL_DIALOG_OPTIONS, data: { doc } });
  }

  /** The legal text a fragment such as `#datenschutz` points to. */
  static fromFragment(hash: string): LegalDocId | null {
    return FRAGMENTS[hash.replace(/^#\/?/, '').toLowerCase()] ?? null;
  }
}
