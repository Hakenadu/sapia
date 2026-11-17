import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { I18nService } from '../core/i18n.service';
import { Icon } from '../ui/icon';
import type { IconName } from '../ui/icon';
import { LEGAL_PROVIDER, LEGAL_UPDATED, legalTexts } from './legal-content';
import { LegalService } from './legal.service';
import type { LegalDocId } from './legal-content';

export interface LegalDialogData {
  doc: LegalDocId;
}

const ICONS: Record<LegalDocId, IconName> = { imprint: 'info', privacy: 'shield', terms: 'file-text' };

/** Imprint, privacy policy and terms of use, one tab each. */
@Component({
  selector: 'sapia-legal-dialog',
  imports: [Icon],
  template: `
    <header>
      <div class="glyph"><sapia-icon name="scale" [size]="18" /></div>
      <h2>{{ t('legal.title') }}</h2>
      <button class="icon-button close" (click)="ref.close()" [attr.aria-label]="t('action.close')"><sapia-icon name="close" /></button>
    </header>

    <nav class="tabs" role="tablist">
      @for (entry of legal.entries(); track entry.id) {
        <button role="tab" [class.active]="doc() === entry.id" [attr.aria-selected]="doc() === entry.id" (click)="select(entry.id)">
          <sapia-icon [name]="icons[entry.id]" [size]="14" />
          <span class="long">{{ t('legal.' + entry.id) }}</span>
          <span class="short">{{ t('legal.' + entry.id + '.short') }}</span>
          @if (entry.kind === 'url') {
            <sapia-icon class="external" name="external" [size]="12" />
          }
        </button>
      }
    </nav>

    <article #scroller tabindex="-1">
      @if (custom(); as state) {
        @if (state.html !== null) {
          <div class="custom" [innerHTML]="state.html"></div>
        } @else if (state.error) {
          <p class="load-error"><sapia-icon name="alert" [size]="15" /> {{ t('legal.loadFailed', { message: state.error }) }}</p>
        } @else {
          <p class="loading"><sapia-icon name="loader" [size]="15" /></p>
        }
      } @else {
      <h1>{{ text().title }}</h1>
      @if (text().lead; as lead) {
        <p class="lead">{{ lead }}</p>
      }
      @for (section of text().sections; track section.heading) {
        <section>
          <h3>{{ section.heading }}</h3>
          @for (block of section.blocks; track $index) {
            @if ('p' in block) {
              <p>{{ block.p }}</p>
            } @else if ('ul' in block) {
              <ul>
                @for (item of block.ul; track $index) {
                  <li>{{ item }}</li>
                }
              </ul>
            } @else {
              <address>
                <strong>{{ provider.name }}</strong>&nbsp;<span class="alias">({{ provider.alias }})</span><br />
                @for (line of provider.address; track line) {
                  {{ line }}<br />
                }
                {{ country() }}
                <a class="mail" [href]="'mailto:' + provider.email"><sapia-icon name="mail" [size]="14" /> {{ provider.email }}</a>
              </address>
            }
          }
        </section>
      }
      <footer>
        <span>{{ t('legal.updated', { date: updated() }) }}</span>
        @if (!german()) {
          <span>{{ t('legal.translation') }}</span>
        }
      </footer>
      }
    </article>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: min(760px, 94vw);
      height: min(84vh, 760px);
    }
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 14px 12px 20px;
    }
    .glyph {
      flex: none;
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 11px;
      background: var(--primary-soft);
      color: var(--primary);
    }
    h2 {
      flex: 1;
      margin: 0;
      font-size: 16px;
      font-weight: 680;
      letter-spacing: -0.015em;
    }
    .tabs {
      display: flex;
      gap: 4px;
      margin: 0 20px;
      padding: 3px;
      border-radius: 12px;
      background: var(--surface-3);
      button {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-width: 0;
        height: 34px;
        padding: 0 10px;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--text-2);
        font: inherit;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s var(--ease);
        .short {
          display: none;
        }
        span {
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        &:hover {
          color: var(--text);
        }
        &.active {
          background: var(--surface-1);
          color: var(--text);
          box-shadow: var(--shadow-1);
          sapia-icon {
            color: var(--primary);
          }
        }
      }
    }
    article {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      margin-top: 12px;
      padding: 8px 28px 24px;
      border-top: 1px solid var(--border);
      outline: none;
      color: var(--text-2);
      font-size: 13.5px;
      line-height: 1.65;
      animation: sapia-fade-in 0.2s var(--ease);
    }
    h1 {
      margin: 18px 0 6px;
      color: var(--text);
      font-size: 22px;
      font-weight: 720;
      letter-spacing: -0.025em;
    }
    .lead {
      margin: 0 0 6px;
      color: var(--text);
      font-size: 14px;
    }
    section {
      margin-top: 22px;
    }
    h3 {
      margin: 0 0 6px;
      color: var(--text);
      font-size: 14px;
      font-weight: 660;
      letter-spacing: -0.01em;
    }
    p {
      margin: 0 0 10px;
    }
    ul {
      margin: 0 0 10px;
      padding-left: 20px;
      li + li {
        margin-top: 4px;
      }
      li::marker {
        color: var(--primary);
      }
    }
    address {
      margin: 4px 0 12px;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface-2);
      color: var(--text);
      font-style: normal;
      line-height: 1.6;
      strong {
        font-weight: 650;
      }
      .alias {
        color: var(--text-3);
      }
    }
    .mail {
      display: flex;
      align-items: center;
      gap: 7px;
      width: fit-content;
      margin-top: 8px;
      color: var(--primary-strong);
      font-weight: 560;
      text-decoration: none;
      &:hover {
        text-decoration: underline;
      }
    }
    footer {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin-top: 26px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      color: var(--text-3);
      font-size: 12px;
    }
    .external {
      color: var(--text-3);
    }
    /* Operator Markdown arrives as innerHTML, outside the view encapsulation. */
    .custom {
      padding-top: 6px;
    }
    .custom ::ng-deep :is(h1, h2, h3) {
      color: var(--text);
      letter-spacing: -0.015em;
    }
    .custom ::ng-deep h1 {
      margin: 18px 0 6px;
      font-size: 22px;
      font-weight: 720;
      letter-spacing: -0.025em;
    }
    .custom ::ng-deep h2 {
      margin: 22px 0 6px;
      font-size: 14px;
      font-weight: 660;
    }
    .custom ::ng-deep h3 {
      margin: 18px 0 6px;
      font-size: 13.5px;
      font-weight: 650;
    }
    .custom ::ng-deep p {
      margin: 0 0 10px;
    }
    .custom ::ng-deep ul,
    .custom ::ng-deep ol {
      margin: 0 0 10px;
      padding-left: 20px;
    }
    .custom ::ng-deep li::marker {
      color: var(--primary);
    }
    .custom ::ng-deep a {
      color: var(--primary-strong);
      font-weight: 560;
      text-decoration: none;
    }
    .custom ::ng-deep a:hover {
      text-decoration: underline;
    }
    .custom ::ng-deep strong {
      color: var(--text);
      font-weight: 650;
    }
    .custom ::ng-deep code {
      font-family: var(--font-mono);
      font-size: 12.5px;
    }
    .custom ::ng-deep hr {
      margin: 20px 0;
      border: 0;
      border-top: 1px solid var(--border);
    }
    .loading {
      display: grid;
      place-items: center;
      padding: 40px 0;
      color: var(--text-3);
      sapia-icon {
        animation: sapia-spin 1s linear infinite;
      }
    }
    .load-error {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 20px;
      color: var(--danger);
    }
    @media (max-width: 600px) {
      :host {
        width: 100vw;
        height: 100dvh;
        padding-bottom: env(safe-area-inset-bottom);
      }
      header {
        padding-top: calc(14px + env(safe-area-inset-top));
      }
      .tabs {
        margin: 0 12px;
        button {
          flex-direction: column;
          gap: 2px;
          height: 46px;
          padding: 0 4px;
          font-size: 11.5px;
          .long {
            display: none;
          }
          .short {
            display: block;
          }
        }
      }
      article {
        padding: 4px 18px 24px;
        font-size: 13.5px;
      }
      h1 {
        font-size: 20px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalDialog {
  protected readonly ref = inject<MatDialogRef<LegalDialog>>(MatDialogRef);
  private readonly data = inject<LegalDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  protected readonly legal = inject(LegalService);
  protected readonly icons = ICONS;
  protected readonly provider = LEGAL_PROVIDER;
  protected readonly doc = signal<LegalDocId>(this.initialDoc());

  /** Loaded operator text for the current tab; `null` while the bundled text is shown. */
  protected readonly custom = signal<{ html: string | null; error?: string } | null>(null);

  protected readonly german = computed(() => this.i18n.locale().toLowerCase().startsWith('de'));
  protected readonly text = computed(() => legalTexts(this.i18n.locale())[this.doc()]);
  protected readonly country = computed(() => (this.german() ? LEGAL_PROVIDER.country.de : LEGAL_PROVIDER.country.en));
  protected readonly updated = computed(() =>
    new Date(`${LEGAL_UPDATED}T12:00:00`).toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }),
  );

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Each document starts at its top.
    effect(() => {
      this.doc();
      this.scroller()?.nativeElement.scrollTo({ top: 0 });
    });
    effect(() => {
      const entry = this.legal.entry(this.doc());
      const locale = this.i18n.locale();
      if (!entry || entry.kind === 'builtin' || entry.kind === 'url') return this.custom.set(null);
      this.custom.set({ html: null });
      this.legal.render(entry, locale).then(
        (html) => this.doc() === entry.id && this.custom.set({ html }),
        (e: unknown) => this.doc() === entry.id && this.custom.set({ html: null, error: e instanceof Error ? e.message : String(e) }),
      );
    });
  }

  private initialDoc(): LegalDocId {
    const entries = this.legal.entries().filter((entry) => entry.kind !== 'url');
    const wanted = this.data?.doc;
    return entries.find((entry) => entry.id === wanted)?.id ?? entries[0]?.id ?? 'terms';
  }

  protected select(doc: LegalDocId): void {
    if (this.legal.entry(doc)?.kind === 'url') this.legal.open(doc);
    else this.doc.set(doc);
  }
}

/** Dialog options that let the legal texts fill the screen on phones. */
export const LEGAL_DIALOG_OPTIONS = { maxWidth: '100vw', maxHeight: '100dvh', autoFocus: 'dialog', panelClass: 'sapia-legal-panel' } as const;
