import type { AiTool } from '../ai/ai';
import { AiToolRegistry } from '../ai/ai';
import { ConversionService } from '../conversion/conversion';
import type { ModelMapper } from '../conversion/conversion';
import { I18n } from '../i18n/i18n';
import type { MessageParams, Messages } from '../i18n/i18n';
import type { LanguageSupport } from '../language/language';
import { LanguageRegistry } from '../language/registry';
import type { Disposable } from '../language/registry';
import type { DiagramModel } from '../metamodel';

export type SapiaPlatform = 'web' | 'desktop';

export interface PluginLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** The API surface a plugin gets when it is activated. */
export interface PluginContext {
  readonly pluginId: string;
  /** Options from `pluginOptions.<id>` (or the plugin reference) in the config. */
  readonly options: Readonly<Record<string, unknown>>;
  readonly platform: SapiaPlatform;
  readonly logger: PluginLogger;

  /** Resolves a path relative to where the plugin's static assets are served. */
  assetUrl(path: string): string;

  readonly languages: {
    /** Adds a diagram language: detection, highlighting, completion, validation, rendering. */
    register(language: LanguageSupport): Disposable;
  };

  readonly conversion: {
    /** Adds a mapping between one language and the metamodel of one diagram type. */
    registerMapper<M extends DiagramModel>(mapper: ModelMapper<M>): Disposable;
  };

  readonly i18n: {
    addMessages(locale: string, messages: Messages): void;
    t(key: string, params?: MessageParams): string;
    readonly locale: string;
  };

  readonly ai: {
    /** Adds a tool the AI assistant can call. */
    registerTool(tool: AiTool): Disposable;
  };
}

export interface SapiaPlugin {
  /** Globally unique id, e.g. `sapia.plantuml` or `acme.d2`. */
  id: string;
  name: string;
  version?: string;
  description?: string;
  /**
   * Called once when the plugin is loaded. Everything registered through
   * the context is removed automatically when the plugin is deactivated; a
   * returned function runs additionally at that point.
   */
  activate(context: PluginContext): void | Disposable | Promise<void | Disposable>;
}

/** Identity helper that gives plugin authors type checking and editor support. */
export function definePlugin(plugin: SapiaPlugin): SapiaPlugin {
  return plugin;
}

/** Extracts the plugin from a dynamically imported module. */
export function pluginFromModule(module: unknown): SapiaPlugin | null {
  const candidates = [
    (module as { default?: unknown })?.default,
    (module as { plugin?: unknown })?.plugin,
    module,
    ((module as { default?: { default?: unknown } })?.default as { default?: unknown } | undefined)?.default,
  ];
  for (const c of candidates) {
    const p = typeof c === 'function' ? safeCall(c as () => unknown) : c;
    if (isPlugin(p)) return p;
  }
  return null;
}

function safeCall(fn: () => unknown): unknown {
  try {
    // Plugin factories take no arguments; classes and other functions are ignored.
    return fn.length === 0 && !/^class\s/.test(Function.prototype.toString.call(fn)) ? fn() : null;
  } catch {
    return null;
  }
}

function isPlugin(value: unknown): value is SapiaPlugin {
  const p = value as SapiaPlugin | null;
  return !!p && typeof p === 'object' && typeof p.id === 'string' && typeof p.activate === 'function';
}

export type PluginStatus = 'active' | 'failed' | 'disabled';

export interface PluginInfo {
  id: string;
  name: string;
  version?: string;
  description?: string;
  status: PluginStatus;
  /** `builtin` for bundled plugins, otherwise the reference it was loaded from. */
  origin: string;
  error?: string;
}

export interface PluginServices {
  languages: LanguageRegistry;
  conversion: ConversionService;
  i18n: I18n;
  aiTools: AiToolRegistry;
}

export interface ActivateOptions {
  origin?: string;
  options?: Record<string, unknown>;
  /** Base URL for the plugin's static assets. */
  assetBase?: string;
}

export interface PluginManagerOptions {
  platform: SapiaPlatform;
  disabled?: readonly string[];
  logger?: PluginLogger;
}

/**
 * Activates plugins and tracks their contributions. A failing plugin is
 * isolated: it is reported as `failed`, its partial registrations are rolled
 * back, and the rest of the application keeps working.
 */
export class PluginManager {
  private readonly entries = new Map<string, { info: PluginInfo; disposables: Disposable[] }>();
  private readonly listeners = new Set<() => void>();
  private readonly logger: PluginLogger;

  constructor(
    private readonly services: PluginServices,
    private readonly options: PluginManagerOptions,
  ) {
    this.logger = options.logger ?? console;
  }

  list(): PluginInfo[] {
    return [...this.entries.values()].map((e) => ({ ...e.info }));
  }

  get(id: string): PluginInfo | undefined {
    const info = this.entries.get(id)?.info;
    return info && { ...info };
  }

  onChange(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Records a plugin that could not even be loaded, so the UI can show it. */
  reportLoadFailure(origin: string, error: unknown): void {
    this.entries.set(`failed:${origin}`, {
      info: { id: origin, name: origin, status: 'failed', origin, error: errorMessage(error) },
      disposables: [],
    });
    this.emit();
  }

  async activate(plugin: SapiaPlugin, opts: ActivateOptions = {}): Promise<PluginInfo> {
    const origin = opts.origin ?? 'builtin';
    const info: PluginInfo = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      status: 'active',
      origin,
    };
    if (this.entries.get(plugin.id)?.info.status === 'active') {
      throw new Error(`Plugin "${plugin.id}" is already active`);
    }
    if (this.options.disabled?.includes(plugin.id)) {
      info.status = 'disabled';
      this.entries.set(plugin.id, { info, disposables: [] });
      this.emit();
      return { ...info };
    }

    const disposables: Disposable[] = [];
    const track = (d: Disposable): Disposable => {
      disposables.push(d);
      return d;
    };
    const prefix = `[${plugin.id}]`;
    const base = (opts.assetBase ?? '').replace(/\/?$/, opts.assetBase ? '/' : '');
    const { languages, conversion, i18n, aiTools } = this.services;
    const context: PluginContext = {
      pluginId: plugin.id,
      options: Object.freeze({ ...(opts.options ?? {}) }),
      platform: this.options.platform,
      logger: {
        info: (...a) => this.logger.info(prefix, ...a),
        warn: (...a) => this.logger.warn(prefix, ...a),
        error: (...a) => this.logger.error(prefix, ...a),
      },
      assetUrl: (path) => base + path.replace(/^\/+/, ''),
      languages: { register: (l) => track(languages.register(l)) },
      conversion: { registerMapper: (m) => track(conversion.registerMapper(m)) },
      i18n: {
        addMessages: (locale, messages) => i18n.addMessages(locale, messages),
        t: (key, params) => i18n.t(key, params),
        get locale() {
          return i18n.locale;
        },
      },
      ai: { registerTool: (t) => track(aiTools.register(t)) },
    };

    try {
      const result = await plugin.activate(context);
      if (typeof result === 'function') disposables.push(result);
    } catch (e) {
      for (const d of disposables.reverse()) safeDispose(d);
      info.status = 'failed';
      info.error = errorMessage(e);
      this.logger.error(prefix, 'activation failed:', e);
      this.entries.set(plugin.id, { info, disposables: [] });
      this.emit();
      return { ...info };
    }
    this.entries.set(plugin.id, { info, disposables });
    this.emit();
    return { ...info };
  }

  deactivate(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const d of entry.disposables.reverse()) safeDispose(d);
    this.entries.delete(id);
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

function safeDispose(d: Disposable): void {
  try {
    d();
  } catch {
    /* a broken disposer must not block the others */
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
