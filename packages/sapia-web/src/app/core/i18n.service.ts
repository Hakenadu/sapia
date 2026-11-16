import { Injectable, signal } from '@angular/core';
import type { I18n, MessageParams } from '@sapia/core';
import { I18n as CoreI18n } from '@sapia/core';

/**
 * Signal-aware facade over the core message catalogue. Templates call
 * `t('key')`; reading the internal version signal makes them re-render
 * when the locale or the catalogue changes.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private i18n: I18n = new CoreI18n();
  private readonly version = signal(0);
  readonly locale = signal('en');

  connect(i18n: I18n): void {
    this.i18n = i18n;
    this.locale.set(i18n.locale);
    i18n.onChange(() => {
      this.locale.set(i18n.locale);
      this.version.update((v) => v + 1);
    });
    this.version.update((v) => v + 1);
  }

  get locales(): string[] {
    this.version();
    return this.i18n.locales;
  }

  setLocale(locale: string | readonly string[]): void {
    const resolved = this.i18n.setLocale(locale);
    document.documentElement.lang = resolved;
  }

  readonly t = (key: string, params?: MessageParams): string => {
    this.version();
    return this.i18n.t(key, params);
  };

  /** Display name of a diagram type, falling back to its id. */
  diagramType(id: string | null | undefined): string {
    const key = `diagramType.${id ?? 'unknown'}`;
    const label = this.t(key);
    return label === key ? (id ?? '') : label;
  }

  /** "3 minutes ago" style formatting in the active locale. */
  relativeTime(iso: string): string {
    const diff = (new Date(iso).getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(this.locale(), { numeric: 'auto' });
    const steps: [number, Intl.RelativeTimeFormatUnit][] = [
      [60, 'second'],
      [60, 'minute'],
      [24, 'hour'],
      [7, 'day'],
      [4.35, 'week'],
      [12, 'month'],
      [Infinity, 'year'],
    ];
    let value = diff;
    for (const [size, unit] of steps) {
      if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
      value /= size;
    }
    return '';
  }
}
