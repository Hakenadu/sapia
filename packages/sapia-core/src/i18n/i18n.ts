import type { Disposable } from '../language/registry';

export type Messages = Record<string, string>;
export type MessageParams = Record<string, string | number>;

export const DEFAULT_LOCALE = 'en';

/**
 * Picks the best supported locale for a list of preferences (e.g.
 * `navigator.languages`). Region subtags are ignored (`de-AT` → `de`).
 * Unknown or missing preferences resolve to the fallback (English).
 */
export function resolveLocale(
  preferred: readonly (string | null | undefined)[] | string | null | undefined,
  supported: readonly string[],
  fallback: string = DEFAULT_LOCALE,
): string {
  const list = typeof preferred === 'string' ? [preferred] : (preferred ?? []);
  for (const candidate of list) {
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    if (supported.includes(lower)) return lower;
    const base = lower.split(/[-_]/)[0];
    if (supported.includes(base)) return base;
  }
  return fallback;
}

/**
 * Small message catalogue with `{param}` interpolation and simple plurals
 * (`key` / `key_one`). The core, the UI and every plugin add their messages
 * to the same instance.
 */
export class I18n {
  private readonly catalogs = new Map<string, Messages>();
  private readonly listeners = new Set<() => void>();
  private current = DEFAULT_LOCALE;

  constructor(readonly fallbackLocale: string = DEFAULT_LOCALE) {}

  get locale(): string {
    return this.current;
  }

  /** Locales that have at least one message registered. */
  get locales(): string[] {
    return [...this.catalogs.keys()];
  }

  addMessages(locale: string, messages: Messages): void {
    const key = locale.toLowerCase();
    this.catalogs.set(key, { ...(this.catalogs.get(key) ?? {}), ...messages });
    this.emit();
  }

  /** Sets the active locale; unsupported values fall back to English. */
  setLocale(locale: string | readonly string[] | null | undefined): string {
    const next = resolveLocale(locale, this.locales, this.fallbackLocale);
    if (next !== this.current) {
      this.current = next;
      this.emit();
    }
    return this.current;
  }

  has(key: string): boolean {
    return (
      key in (this.catalogs.get(this.current) ?? {}) || key in (this.catalogs.get(this.fallbackLocale) ?? {})
    );
  }

  t(key: string, params?: MessageParams): string {
    let lookup = key;
    if (params && params['count'] === 1 && this.has(`${key}_one`)) lookup = `${key}_one`;
    const template =
      this.catalogs.get(this.current)?.[lookup] ?? this.catalogs.get(this.fallbackLocale)?.[lookup] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  }

  onChange(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
