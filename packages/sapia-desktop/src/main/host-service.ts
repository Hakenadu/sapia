import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { redactConfig } from '@sapia/core';
import type { HostBootstrap, HostPlugin, HostPreferences, OnboardingResult, ProjectManager, SapiaConfig } from '@sapia/core';
import { AiService } from './ai-service';
import { ConfigStore } from './config-store';
import { createGitRunner } from './git-store';
import { createDesktopProjects, projectFolder } from './projects';
import { expandPath } from './paths';
import type { SapiaPaths } from './paths';
import { globalNpmRoot, resolvePlugins } from './plugins';
import type { ResolvedPlugin } from './plugins';
import { createDefaultProviderRegistry } from './providers';
import type { AiProviderFactory, AiProviderRegistry } from './providers';
import type { StaticRoots } from './protocol';

export interface HostServiceOptions {
  paths: SapiaPaths;
  webRoot: string;
  appVersion: string;
  systemLocales: () => string[];
  /** `node_modules` directory this package is installed in, if any. */
  siblingModules?: string;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}

/** What a plugin's main-process entry receives. */
export interface DesktopPluginContext {
  options: Record<string, unknown>;
  /** Adds an AI provider type that can be used as `ai.providers.<id>.type`. */
  registerAiProvider(factory: AiProviderFactory): void;
  log(message: string): void;
}

/**
 * Everything the desktop shell does besides windows: config, plugins,
 * diagram files and the AI backend. Free of Electron APIs so it can be tested.
 */
export class HostService {
  readonly configStore: ConfigStore;
  readonly providers: AiProviderRegistry = createDefaultProviderRegistry();
  readonly ai: AiService;
  readonly roots: StaticRoots;
  /** Projects and their diagrams (default project, folders, Git repositories). */
  readonly projects: ProjectManager;
  private plugins: ResolvedPlugin[] = [];
  private pluginErrors: { origin: string; error: string }[] = [];
  private hostPlugins: HostPlugin[] = [];
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly options: HostServiceOptions) {
    this.env = options.env ?? process.env;
    this.configStore = new ConfigStore(options.paths.config);
    this.roots = { web: options.webRoot, plugins: new Map(), remoteOrigins: [] };
    this.ai = new AiService({ config: () => this.config, providers: this.providers, env: this.env });
    this.projects = createDesktopProjects({
      home: options.paths.home,
      defaultDirectory: () => this.defaultDirectory,
      git: createGitRunner({ env: this.env }),
    });
  }

  get config(): SapiaConfig {
    return this.configStore.current.config;
  }

  /** Where the default project keeps its diagrams: `storage.directory` or `~/.sapia/diagrams`. */
  get defaultDirectory(): string {
    const configured = this.config.storage.directory;
    return configured ? expandPath(configured, this.options.paths.home) : this.options.paths.diagrams;
  }

  /** The folder holding a project's diagram files, for revealing it in the file manager. */
  async projectFolder(projectId: string): Promise<string | null> {
    const project = (await this.projects.listProjects()).find((p) => p.id === projectId);
    return project ? projectFolder(project, { home: this.options.paths.home, defaultDirectory: () => this.defaultDirectory }) : null;
  }

  /** Loads the config and resolves the plugins it references. Call once at startup. */
  async initialise(): Promise<void> {
    const { config } = await this.configStore.load();
    const { paths } = this.options;
    const moduleDirs = [
      join(paths.plugins, 'node_modules'),
      join(paths.home, 'node_modules'),
      ...(this.options.siblingModules ? [this.options.siblingModules] : []),
      ...(this.env['NODE_PATH']?.split(process.platform === 'win32' ? ';' : ':').filter(Boolean) ?? []),
    ];
    const resolution = await resolvePlugins(config.plugins, { baseDir: dirname(paths.config), moduleDirs, lazyModuleDirs: globalNpmRoot });
    this.plugins = resolution.plugins;
    this.pluginErrors = resolution.errors;

    this.roots.plugins.clear();
    this.roots.remoteOrigins = [];
    this.hostPlugins = this.plugins.map((plugin, index) => {
      if (!plugin.root) {
        const url = new URL(plugin.entry);
        if (!this.roots.remoteOrigins.includes(url.origin)) this.roots.remoteOrigins.push(url.origin);
        return { origin: plugin.origin, url: url.href, assetBase: new URL('.', url).href, options: plugin.options };
      }
      const host = `plugin-${index}`;
      this.roots.plugins.set(host, plugin.root);
      const entry = plugin.entry.split('/').map(encodeURIComponent).join('/');
      return { origin: plugin.origin, url: `sapia://${host}/${entry}`, assetBase: `sapia://${host}/`, options: plugin.options };
    });

    for (const plugin of this.plugins) {
      if (!plugin.mainEntry) continue;
      try {
        const module = (await import(pathToFileURL(plugin.mainEntry).href)) as { activate?: unknown; default?: { activate?: unknown } };
        const activate = module.activate ?? module.default?.activate;
        if (typeof activate !== 'function') throw new Error('The main entry does not export an activate() function.');
        const context: DesktopPluginContext = {
          options: { ...(config.pluginOptions[plugin.origin] ?? {}), ...plugin.options },
          registerAiProvider: (factory) => this.providers.register(factory),
          log: (message) => this.options.log?.(`[${plugin.origin}] ${message}`),
        };
        await (activate as (context: DesktopPluginContext) => unknown)(context);
      } catch (e) {
        this.pluginErrors.push({ origin: plugin.origin, error: `Main process entry failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }

  bootstrap(): HostBootstrap {
    const { config, exists, issues } = this.configStore.current;
    return {
      config: redactConfig(config),
      configPath: this.options.paths.config,
      configExists: exists,
      issues,
      plugins: this.hostPlugins,
      pluginErrors: this.pluginErrors,
      systemLocales: this.options.systemLocales(),
      appVersion: this.options.appVersion,
      aiProviderTypes: this.providers.types(),
    };
  }

  async completeOnboarding(result: OnboardingResult): Promise<HostBootstrap> {
    // The first-run flow must never replace an existing config.
    if (!this.configStore.current.exists) await this.configStore.createFromOnboarding(result);
    return this.bootstrap();
  }

  async updatePreferences(preferences: HostPreferences): Promise<void> {
    if (!this.configStore.current.exists) return;
    await this.configStore.updatePreferences(preferences);
  }
}
