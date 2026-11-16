import { Injectable, computed, signal } from '@angular/core';
import type { DiagramThemeMode, HostPreferences, RenderTheme, ThemePreference } from '@sapia/core';

const STORAGE_KEY = 'sapia.theme';
const DIAGRAM_KEY = 'sapia.diagramTheme';

/** Light / dark mode. Follows the operating system unless the user chose explicitly. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media.matches);
  readonly preference = signal<ThemePreference>('system');

  /** Whether diagrams follow the UI theme (`adaptive`) or always use the light look (`static`). */
  readonly diagramMode = signal<DiagramThemeMode>('adaptive');
  /** Persists preferences in the desktop config; set by the Sapia service. */
  persist: ((preferences: HostPreferences) => void) | null = null;

  /** The theme that is actually shown. */
  readonly active = computed<RenderTheme>(() => {
    const preference = this.preference();
    return preference === 'system' ? (this.systemDark() ? 'dark' : 'light') : preference;
  });

  /** The theme diagrams are rendered in. */
  readonly diagramTheme = computed<RenderTheme>(() => (this.diagramMode() === 'static' ? 'light' : this.active()));

  constructor() {
    this.media.addEventListener('change', (e) => this.systemDark.set(e.matches));
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') this.preference.set(stored);
      const diagram = localStorage.getItem(DIAGRAM_KEY);
      if (diagram === 'adaptive' || diagram === 'static') this.diagramMode.set(diagram);
    } catch {
      /* storage may be unavailable */
    }
    this.apply();
  }

  /** Applies preferences coming from the config, unless the user already overrode them locally. */
  initialise(preference: ThemePreference, diagramMode: DiagramThemeMode, force = false): void {
    let storedDiagram: string | null = null;
    try {
      storedDiagram = localStorage.getItem(DIAGRAM_KEY);
    } catch {
      /* ignore */
    }
    if (force || !storedDiagram) this.diagramMode.set(diagramMode);
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
    this.persist?.({ theme: preference });
  }

  setDiagramMode(mode: DiagramThemeMode): void {
    this.diagramMode.set(mode);
    try {
      localStorage.setItem(DIAGRAM_KEY, mode);
    } catch {
      /* ignore */
    }
    this.persist?.({ diagramTheme: mode });
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
