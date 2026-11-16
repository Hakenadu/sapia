import { Injectable, computed, signal } from '@angular/core';
import type { RenderTheme, ThemePreference } from '@sapia/core';

const STORAGE_KEY = 'sapia.theme';

/** Light / dark mode. Follows the operating system unless the user chose explicitly. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media.matches);
  readonly preference = signal<ThemePreference>('system');

  /** The theme that is actually shown. */
  readonly active = computed<RenderTheme>(() => {
    const preference = this.preference();
    return preference === 'system' ? (this.systemDark() ? 'dark' : 'light') : preference;
  });

  constructor() {
    this.media.addEventListener('change', (e) => this.systemDark.set(e.matches));
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') this.preference.set(stored);
    } catch {
      /* storage may be unavailable */
    }
    this.apply();
  }

  /** Applies a preference coming from the config, unless the user already overrode it locally. */
  initialise(preference: ThemePreference, force = false): void {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (force || !stored) {
      this.preference.set(preference);
      this.apply();
    }
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* ignore */
    }
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement;
    const preference = this.preference();
    root.classList.add('theme-switching');
    if (preference === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = preference;
    setTimeout(() => root.classList.remove('theme-switching'), 250);
  }
}
