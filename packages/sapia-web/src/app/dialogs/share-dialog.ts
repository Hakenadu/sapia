import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import type { AfterViewInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SHARE_LINK_SOFT_LIMIT, sharePayloadFrom } from '@sapia/core';
import { I18nService } from '../core/i18n.service';
import { Icon } from '../ui/icon';

export type ShareDialogData =
  | { mode: 'share'; name: string; link: string; desktopLink: boolean }
  | { mode: 'open'; error?: string };

/** Shows a share link, or asks for one to open (the result is the pasted link). */
@Component({
  selector: 'sapia-share-dialog',
  imports: [Icon],
  template: `
    <header>
      <div class="glyph"><sapia-icon [name]="data.mode === 'share' ? 'share' : 'link'" [size]="18" /></div>
      <div>
        <h2>{{ t(data.mode === 'share' ? 'share.title' : 'share.openTitle') }}</h2>
        <p>{{ data.mode === 'share' ? t('share.text', { name: data.name }) : t('share.openText') }}</p>
      </div>
    </header>

    @if (data.mode === 'share') {
      <div class="link-row">
        <input #field class="link" readonly [value]="data.link" (focus)="field.select()" [attr.aria-label]="t('share.title')" />
        <button class="text-button primary" (click)="copy()">
          <sapia-icon [name]="copied() ? 'check' : 'copy'" [size]="15" />
          {{ t(copied() ? 'share.copied' : 'share.copy') }}
        </button>
      </div>
      <div class="meta">
        <span>{{ t('share.length', { count: data.link.length.toLocaleString(i18n.locale()) }) }}</span>
      </div>
      @if (long()) {
        <p class="note warn"><sapia-icon name="alert" [size]="14" /> {{ t('share.long') }}</p>
      }
      @if (data.desktopLink) {
        <p class="note"><sapia-icon name="info" [size]="14" /> {{ t('share.desktopHint') }}</p>
      }
      <div class="actions">
        <button class="text-button ghost" (click)="ref.close()">{{ t('action.close') }}</button>
      </div>
    } @else {
      <input
        #field
        class="link paste"
        spellcheck="false"
        placeholder="https://…/#d=…"
        [value]="pasted()"
        (input)="pasted.set(field.value); error.set(null)"
        (keydown.enter)="open()"
        [attr.aria-label]="t('share.openTitle')"
      />
      @if (error()) {
        <p class="note error"><sapia-icon name="error" [size]="14" /> {{ error() }}</p>
      }
      <div class="actions">
        <button class="text-button ghost" (click)="ref.close()">{{ t('action.cancel') }}</button>
        <button class="text-button primary" [disabled]="!pasted().trim()" (click)="open()">{{ t('share.openAction') }}</button>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: min(560px, 92vw);
      padding: 22px 24px 20px;
    }
    header {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    .glyph {
      flex: none;
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: var(--primary-soft);
      color: var(--primary);
    }
    h2 {
      margin: 2px 0 4px;
      font-size: 17px;
      font-weight: 680;
      letter-spacing: -0.02em;
    }
    header p {
      margin: 0;
      color: var(--text-2);
      font-size: 13px;
      line-height: 1.5;
    }
    .link-row {
      display: flex;
      gap: 8px;
    }
    .link {
      flex: 1;
      min-width: 0;
      width: 100%;
      height: 40px;
      padding: 0 13px;
      border-radius: 11px;
      border: 1px solid var(--border-strong);
      background: light-dark(rgba(255, 255, 255, 0.7), rgba(9, 11, 16, 0.5));
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 12.5px;
      color: var(--text-2);
      outline: none;
      text-overflow: ellipsis;
      &:focus {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--primary-soft);
        color: var(--text);
      }
    }
    .link-row .text-button {
      flex: none;
      height: 40px;
    }
    .meta {
      margin-top: 8px;
      color: var(--text-3);
      font-size: 12px;
    }
    .note {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin: 12px 0 0;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--surface-3);
      color: var(--text-2);
      font-size: 12.5px;
      line-height: 1.5;
      sapia-icon {
        flex: none;
        margin-top: 2px;
      }
      &.warn {
        background: light-dark(rgba(217, 119, 6, 0.1), rgba(245, 158, 11, 0.12));
        color: light-dark(#92400e, #fbbf24);
      }
      &.error {
        background: light-dark(rgba(220, 38, 38, 0.08), rgba(248, 113, 113, 0.12));
        color: var(--danger);
      }
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }
    @media (max-width: 520px) {
      .link-row {
        flex-direction: column;
      }
      .link {
        font-size: 16px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareDialog implements AfterViewInit {
  protected readonly data = inject<ShareDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<ShareDialog, string>>(MatDialogRef);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly copied = signal(false);
  protected readonly pasted = signal('');
  protected readonly error = signal<string | null>(this.data.mode === 'open' ? (this.data.error ?? null) : null);
  protected readonly long = computed(() => this.data.mode === 'share' && this.data.link.length > SHARE_LINK_SOFT_LIMIT);

  ngAfterViewInit(): void {
    const field = this.field()?.nativeElement;
    if (!field) return;
    field.focus();
    if (this.data.mode === 'share') field.select();
  }

  protected async copy(): Promise<void> {
    if (this.data.mode !== 'share') return;
    try {
      await navigator.clipboard.writeText(this.data.link);
    } catch {
      this.field()?.nativeElement.select();
      document.execCommand('copy');
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1800);
  }

  protected open(): void {
    const text = this.pasted().trim();
    if (!text) return;
    if (!sharePayloadFrom(text)) {
      this.error.set(this.t('share.invalid'));
      return;
    }
    this.ref.close(text);
  }
}
