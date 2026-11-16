import { Injectable, inject, signal } from '@angular/core';
import { KeyValueDiagramStore, MemoryStorage, createSapia, normalizeConfig, pluginFromModule, resolvePluginReference } from '@sapia/core';
import type { DiagramStore, HostBootstrap, KeyValueStorage, PluginInfo, Sapia, SapiaConfig, SapiaHost } from '@sapia/core';
import { mermaidPlugin } from '@sapia/plugin-mermaid';
import { plantUmlPlugin } from '@sapia/plugin-plantuml';
import { I18nService } from './i18n.service';
import { ThemeService } from './theme.service';
import { uiMessagesDe, uiMessagesEn } from './ui-messages';

declare global {
  interface Window {
    /** Injected by the desktop shell's preload script. */
    sapiaHost?: SapiaHost;
  }
}

const LOCALE_KEY = 'sapia.locale';

function browserStorage(): KeyValueStorage {
  try {
    localStorage.setItem('sapia.probe', '1');
    localStorage.removeItem('sapia.probe');
    return localStorage;
  } catch {
    return new MemoryStorage();
  }
}

/**
 * Owns the Sapia core instance: loads the configuration, activates the
 * bundled and the configured plugins and exposes the resulting services.
 */
@Injectable({ providedIn: 'root' })
export class SapiaService {
  private readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);

  readonly host: SapiaHost | undefined = window.sapiaHost;
  readonly platform = this.host ? 'desktop' : 'web';

  core!: Sapia;
  store!: DiagramStore;
  readonly config = signal<SapiaConfig>(normalizeConfig(undefined).config);
  readonly configIssues = signal<string[]>([]);
  readonly plugins = signal<PluginInfo[]>([]);
  readonly bootstrap = signal<HostBootstrap | null>(null);
  /** True while the desktop first-run flow has to be shown. */
  readonly needsOnboarding = signal(false);
  /** Bumped whenever languages or converters change. */
  readonly registryVersion = signal(0);

  async initialise(): Promise<void> {
    let bootstrap: HostBootstrap | null = null;
    let config: SapiaConfig;
    let issues: string[] = [];

    if (this.host) {
      bootstrap = await this.host.getBootstrap();
      config = bootstrap.config;
      issues = bootstrap.issues;
      this.store = this.host.store;
      this.needsOnboarding.set(!bootstrap.configExists);
    } else {
      ({ config, issues } = await this.loadWebConfig());
      this.store = new KeyValueDiagramStore(browserStorage());
    }
    this.bootstrap.set(bootstrap);
    this.config.set(config);
    this.configIssues.set(issues);

    this.core = createSapia({ platform: this.platform, disabledPlugins: config.disabledPlugins });
    this.core.i18n.addMessages('en', uiMessagesEn);
    this.core.i18n.addMessages('de', uiMessagesDe);
    this.i18n.connect(this.core.i18n);
    this.core.plugins.onChange(() => this.plugins.set(this.core.plugins.list()));
    const bump = () => this.registryVersion.update((v) => v + 1);
    this.core.languages.onChange(bump);
    this.core.conversion.onChange(bump);

    // Built-in language support ships as regular plugins.
    await this.core.plugins.activate(plantUmlPlugin, {
      assetBase: 'plugins/plantuml/',
      options: config.pluginOptions[plantUmlPlugin.id],
    });
    await this.core.plugins.activate(mermaidPlugin, { options: config.pluginOptions[mermaidPlugin.id] });

    await this.loadExternalPlugins(config, bootstrap);
    this.plugins.set(this.core.plugins.list());

    this.applyLocale(config, bootstrap);
    this.theme.initialise(config.theme, config.diagramTheme, !!this.host);
    const host = this.host;
    if (host) this.theme.persist = (preferences) => void host.updatePreferences(preferences);
  }

  /** The web app reads an optional `config.json` next to its deployment. */
  private async loadWebConfig(): Promise<{ config: SapiaConfig; issues: string[] }> {
    try {
      const response = await fetch(new URL('config.json', document.baseURI), { cache: 'no-cache' });
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.includes('json')) return normalizeConfig(undefined);
      return normalizeConfig(await response.json());
    } catch (e) {
      return { config: normalizeConfig(undefined).config, issues: [] };
    }
  }

  private async loadExternalPlugins(config: SapiaConfig, bootstrap: HostBootstrap | null): Promise<void> {
    const entries: { origin: string; url: string; assetBase?: string; options: Record<string, unknown> }[] = [];
    if (bootstrap) {
      entries.push(...bootstrap.plugins);
      for (const failure of bootstrap.pluginErrors) this.core.plugins.reportLoadFailure(failure.origin, failure.error);
    } else {
      for (const ref of config.plugins) {
        const resolved = resolvePluginReference(ref);
        if (!resolved?.enabled) continue;
        // A browser can only import modules by URL; paths are resolved against the deployment.
        if (resolved.kind === 'package') {
          this.core.plugins.reportLoadFailure(resolved.target, 'npm packages can only be loaded by Sapia Desktop; use a URL here.');
          continue;
        }
        const url = new URL(resolved.target, document.baseURI).href;
        entries.push({ origin: resolved.target, url, assetBase: new URL('.', url).href, options: resolved.options });
      }
    }
    for (const entry of entries) {
      try {
        const module: unknown = await import(/* @vite-ignore */ entry.url);
        const plugin = pluginFromModule(module);
        if (!plugin) throw new Error('The module does not export a Sapia plugin.');
        await this.core.plugins.activate(plugin, {
          origin: entry.origin,
          assetBase: entry.assetBase,
          options: { ...(config.pluginOptions[plugin.id] ?? {}), ...entry.options },
        });
      } catch (e) {
        this.core.plugins.reportLoadFailure(entry.origin, e);
      }
    }
  }

  private applyLocale(config: SapiaConfig, bootstrap: HostBootstrap | null): void {
    let stored: string | null = null;
    try {
      stored = this.host ? null : localStorage.getItem(LOCALE_KEY);
    } catch {
      /* ignore */
    }
    const configured = config.locale && config.locale !== 'auto' ? config.locale : null;
    const system = bootstrap?.systemLocales?.length ? bootstrap.systemLocales : navigator.languages;
    this.i18n.setLocale([stored, configured, ...system].filter((l): l is string => !!l));
  }

  /** Changes the UI language and remembers the choice. */
  setLocale(locale: string): void {
    this.i18n.setLocale(locale);
    if (this.host) void this.host.updatePreferences({ locale });
    else {
      try {
        localStorage.setItem(LOCALE_KEY, locale);
      } catch {
        /* ignore */
      }
    }
  }

  /** Re-reads host state after the onboarding flow wrote the config. */
  applyBootstrap(bootstrap: HostBootstrap): void {
    this.bootstrap.set(bootstrap);
    this.config.set(bootstrap.config);
    this.configIssues.set(bootstrap.issues);
    this.needsOnboarding.set(!bootstrap.configExists);
  }
}
