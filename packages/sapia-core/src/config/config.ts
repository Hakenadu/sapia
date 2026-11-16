/**
 * Sapia configuration. The web app loads it (optionally) from `/config.json`
 * next to its deployment, the desktop app from `~/.sapia/config.json`.
 */
export interface SapiaConfig {
  version: 1;
  /** `auto` follows the system; otherwise a locale id such as `en` or `de`. */
  locale: string;
  theme: ThemePreference;
  editor: EditorConfig;
  /** Additional plugins: npm package names, local paths or URLs. */
  plugins: PluginReference[];
  /** Ids of plugins (including built-in ones) that must not be activated. */
  disabledPlugins: string[];
  /** Free-form options handed to plugins, keyed by plugin id. */
  pluginOptions: Record<string, Record<string, unknown>>;
  ai: AiConfig;
  storage: StorageConfig;
  keybindings: KeybindingConfig;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export interface EditorConfig {
  fontSize: number;
  tabSize: number;
  lineNumbers: boolean;
  wordWrap: boolean;
  /** Milliseconds to wait after the last keystroke before re-rendering. */
  renderDelay: number;
}

export interface PluginReferenceObject {
  /** npm package name, resolved from `~/.sapia/plugins` and the global npm root. */
  package?: string;
  /** Path to a plugin directory or module, absolute or relative to the config file. */
  path?: string;
  /** URL of an ES module (the only form available to the web app). */
  url?: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export type PluginReference = string | PluginReferenceObject;

export interface AiConfig {
  enabled: boolean;
  /** Key of the provider in `providers` that the assistant uses. */
  provider?: string;
  providers: Record<string, AiProviderConfig>;
  /** Upper bound for model/tool round trips per request. */
  maxSteps: number;
}

export interface AiProviderConfig {
  /** Provider implementation, e.g. `openai-chat` or `openai-responses`. */
  type: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  /** Name of an environment variable holding the API key (preferred over `apiKey`). */
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  /** Provider specific extras. */
  options?: Record<string, unknown>;
}

export interface StorageConfig {
  /** Directory for saved diagrams (desktop). Defaults to `~/.sapia/diagrams`. */
  directory?: string;
}

/** Key bindings in CodeMirror notation (`Mod` = Cmd on macOS, Ctrl elsewhere). */
export interface KeybindingConfig {
  aiAssistant: string;
  save: string;
  newDiagram: string;
  openLibrary: string;
  convert: string;
}

export interface AiProviderTypeInfo {
  id: string;
  name: string;
  defaultBaseUrl?: string;
  defaultModel?: string;
  apiKeyEnv?: string;
}

/** Provider types every Sapia desktop build understands. */
export const BUILTIN_AI_PROVIDER_TYPES: AiProviderTypeInfo[] = [
  {
    id: 'openai-responses',
    name: 'OpenAI Responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  {
    id: 'openai-chat',
    name: 'OpenAI Chat Completions',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
];

export const DEFAULT_CONFIG: SapiaConfig = {
  version: 1,
  locale: 'auto',
  theme: 'system',
  editor: { fontSize: 14, tabSize: 2, lineNumbers: true, wordWrap: false, renderDelay: 250 },
  plugins: [],
  disabledPlugins: [],
  pluginOptions: {},
  ai: { enabled: false, providers: {}, maxSteps: 12 },
  storage: {},
  keybindings: {
    aiAssistant: 'Mod-k',
    save: 'Mod-s',
    newDiagram: 'Mod-Alt-n',
    openLibrary: 'Mod-o',
    convert: 'Mod-Shift-e',
  },
};

export function defaultConfig(): SapiaConfig {
  return structuredClone(DEFAULT_CONFIG);
}

export interface NormalizedConfig {
  config: SapiaConfig;
  /** Problems found in the raw config. Invalid values fall back to defaults. */
  issues: string[];
}

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates an untrusted config object and fills in defaults. Never throws:
 * a broken config must not keep the application from starting.
 */
export function normalizeConfig(raw: unknown): NormalizedConfig {
  const config = defaultConfig();
  const issues: string[] = [];
  if (raw == null) return { config, issues };
  if (!isDict(raw)) return { config, issues: ['config must be a JSON object'] };

  const str = (v: unknown, path: string): string | undefined => {
    if (v === undefined) return undefined;
    if (typeof v === 'string') return v;
    issues.push(`${path} must be a string`);
    return undefined;
  };
  const bool = (v: unknown, path: string, fallback: boolean): boolean => {
    if (v === undefined) return fallback;
    if (typeof v === 'boolean') return v;
    issues.push(`${path} must be a boolean`);
    return fallback;
  };
  const num = (v: unknown, path: string, fallback: number, min: number, max: number): number => {
    if (v === undefined) return fallback;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(min, Math.min(max, v));
    issues.push(`${path} must be a number`);
    return fallback;
  };

  config.locale = str(raw['locale'], 'locale') ?? config.locale;

  const theme = str(raw['theme'], 'theme');
  if (theme === 'system' || theme === 'light' || theme === 'dark') config.theme = theme;
  else if (theme !== undefined) issues.push('theme must be "system", "light" or "dark"');

  if (isDict(raw['editor'])) {
    const e = raw['editor'];
    config.editor = {
      fontSize: num(e['fontSize'], 'editor.fontSize', config.editor.fontSize, 8, 40),
      tabSize: num(e['tabSize'], 'editor.tabSize', config.editor.tabSize, 1, 8),
      lineNumbers: bool(e['lineNumbers'], 'editor.lineNumbers', config.editor.lineNumbers),
      wordWrap: bool(e['wordWrap'], 'editor.wordWrap', config.editor.wordWrap),
      renderDelay: num(e['renderDelay'], 'editor.renderDelay', config.editor.renderDelay, 0, 5000),
    };
  } else if (raw['editor'] !== undefined) issues.push('editor must be an object');

  if (Array.isArray(raw['plugins'])) {
    raw['plugins'].forEach((p, i) => {
      if (typeof p === 'string' && p.trim()) config.plugins.push(p.trim());
      else if (isDict(p) && (typeof p['package'] === 'string' || typeof p['path'] === 'string' || typeof p['url'] === 'string')) {
        config.plugins.push({
          package: typeof p['package'] === 'string' ? p['package'] : undefined,
          path: typeof p['path'] === 'string' ? p['path'] : undefined,
          url: typeof p['url'] === 'string' ? p['url'] : undefined,
          enabled: typeof p['enabled'] === 'boolean' ? p['enabled'] : undefined,
          options: isDict(p['options']) ? p['options'] : undefined,
        });
      } else issues.push(`plugins[${i}] must be a string or an object with "package", "path" or "url"`);
    });
  } else if (raw['plugins'] !== undefined) issues.push('plugins must be an array');

  if (Array.isArray(raw['disabledPlugins'])) {
    config.disabledPlugins = raw['disabledPlugins'].filter((p): p is string => typeof p === 'string');
  } else if (raw['disabledPlugins'] !== undefined) issues.push('disabledPlugins must be an array');

  if (isDict(raw['pluginOptions'])) {
    for (const [id, options] of Object.entries(raw['pluginOptions'])) {
      if (isDict(options)) config.pluginOptions[id] = options;
      else issues.push(`pluginOptions.${id} must be an object`);
    }
  } else if (raw['pluginOptions'] !== undefined) issues.push('pluginOptions must be an object');

  if (isDict(raw['ai'])) {
    const ai = raw['ai'];
    const providers: Record<string, AiProviderConfig> = {};
    if (isDict(ai['providers'])) {
      for (const [id, p] of Object.entries(ai['providers'])) {
        if (!isDict(p) || typeof p['type'] !== 'string' || typeof p['model'] !== 'string') {
          issues.push(`ai.providers.${id} needs a "type" and a "model"`);
          continue;
        }
        providers[id] = {
          type: p['type'],
          model: p['model'],
          baseUrl: str(p['baseUrl'], `ai.providers.${id}.baseUrl`),
          apiKey: str(p['apiKey'], `ai.providers.${id}.apiKey`),
          apiKeyEnv: str(p['apiKeyEnv'], `ai.providers.${id}.apiKeyEnv`),
          headers: isDict(p['headers'])
            ? Object.fromEntries(Object.entries(p['headers']).filter(([, v]) => typeof v === 'string') as [string, string][])
            : undefined,
          options: isDict(p['options']) ? p['options'] : undefined,
        };
      }
    } else if (ai['providers'] !== undefined) issues.push('ai.providers must be an object');

    let provider = str(ai['provider'], 'ai.provider');
    if (provider && !providers[provider]) {
      issues.push(`ai.provider "${provider}" is not defined in ai.providers`);
      provider = undefined;
    }
    provider ??= Object.keys(providers)[0];
    config.ai = {
      enabled: bool(ai['enabled'], 'ai.enabled', provider !== undefined) && provider !== undefined,
      provider,
      providers,
      maxSteps: num(ai['maxSteps'], 'ai.maxSteps', config.ai.maxSteps, 1, 50),
    };
  } else if (raw['ai'] !== undefined) issues.push('ai must be an object');

  if (isDict(raw['storage'])) {
    config.storage = { directory: str(raw['storage']['directory'], 'storage.directory') };
  } else if (raw['storage'] !== undefined) issues.push('storage must be an object');

  if (isDict(raw['keybindings'])) {
    for (const key of Object.keys(config.keybindings) as (keyof KeybindingConfig)[]) {
      const value = str(raw['keybindings'][key], `keybindings.${key}`);
      if (value?.trim()) config.keybindings[key] = value.trim();
    }
  } else if (raw['keybindings'] !== undefined) issues.push('keybindings must be an object');

  return { config, issues };
}

export type PluginReferenceKind = 'package' | 'path' | 'url';

export interface ResolvedPluginReference {
  kind: PluginReferenceKind;
  /** Package name, path or URL. */
  target: string;
  enabled: boolean;
  options: Record<string, unknown>;
}

/** Interprets the shorthand string form of a plugin reference. */
export function resolvePluginReference(ref: PluginReference): ResolvedPluginReference | null {
  if (typeof ref === 'string') {
    const target = ref.trim();
    if (!target) return null;
    let kind: PluginReferenceKind = 'package';
    if (/^https?:\/\//i.test(target)) kind = 'url';
    else if (/^(\.{1,2}[\\/]|[\\/]|~[\\/]|[a-zA-Z]:[\\/]|file:)/.test(target)) kind = 'path';
    return { kind, target, enabled: true, options: {} };
  }
  const enabled = ref.enabled !== false;
  const options = ref.options ?? {};
  if (ref.path) return { kind: 'path', target: ref.path, enabled, options };
  if (ref.package) return { kind: 'package', target: ref.package, enabled, options };
  if (ref.url) return { kind: 'url', target: ref.url, enabled, options };
  return null;
}

/** Returns a copy of the config that is safe to hand to UI code (no secrets). */
export function redactConfig(config: SapiaConfig): SapiaConfig {
  const copy = structuredClone(config);
  for (const provider of Object.values(copy.ai.providers)) {
    if (provider.apiKey) provider.apiKey = '••••••••';
    delete provider.headers;
  }
  return copy;
}
