import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defaultConfig, normalizeConfig } from '@sapia/core';
import type { HostPreferences, OnboardingResult, SapiaConfig } from '@sapia/core';

export interface LoadedConfig {
  config: SapiaConfig;
  exists: boolean;
  issues: string[];
}

/**
 * Reads and writes `~/.sapia/config.json`. The file belongs to the user:
 * updates change only the keys they are about and keep everything else,
 * including keys this version of Sapia does not know.
 */
export class ConfigStore {
  private raw: Record<string, unknown> = {};
  private loaded: LoadedConfig = { config: defaultConfig(), exists: false, issues: [] };

  constructor(readonly path: string) {}

  get current(): LoadedConfig {
    return this.loaded;
  }

  async load(): Promise<LoadedConfig> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        return (this.loaded = { config: defaultConfig(), exists: true, issues: [`config.json could not be read: ${(e as Error).message}`] });
      }
      this.raw = {};
      return (this.loaded = { config: defaultConfig(), exists: false, issues: [] });
    }
    try {
      const parsed: unknown = JSON.parse(text.replace(/^﻿/, ''));
      this.raw = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
      const { config, issues } = normalizeConfig(parsed);
      return (this.loaded = { config, exists: true, issues });
    } catch (e) {
      // Never overwrite a file we could not parse – the user has to fix it.
      this.raw = {};
      return (this.loaded = { config: defaultConfig(), exists: true, issues: [`config.json is not valid JSON: ${(e as Error).message}`] });
    }
  }

  private async write(raw: Record<string, unknown>): Promise<LoadedConfig> {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    // The file may hold an API key: readable by the user only.
    await writeFile(temp, `${JSON.stringify(raw, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temp, this.path);
    return this.load();
  }

  /** Creates the initial config from the answers of the first-run flow. */
  async createFromOnboarding(result: OnboardingResult): Promise<LoadedConfig> {
    const defaults = defaultConfig();
    const raw: Record<string, unknown> = {
      version: defaults.version,
      locale: result.locale || 'auto',
      theme: result.theme,
      editor: defaults.editor,
      plugins: [],
      disabledPlugins: [],
      pluginOptions: {},
      ai: result.ai
        ? { enabled: true, provider: result.ai.id, maxSteps: defaults.ai.maxSteps, providers: { [result.ai.id]: clean(result.ai.provider) } }
        : { enabled: false, maxSteps: defaults.ai.maxSteps, providers: {} },
      storage: {},
      keybindings: defaults.keybindings,
    };
    return this.write(raw);
  }

  /** Persists UI preferences without touching the rest of the file. */
  async updatePreferences(preferences: HostPreferences): Promise<LoadedConfig> {
    if (this.loaded.exists && this.loaded.issues.some((i) => i.startsWith('config.json'))) return this.loaded;
    const raw = { ...this.raw };
    if (preferences.locale !== undefined) raw['locale'] = preferences.locale;
    if (preferences.theme !== undefined) raw['theme'] = preferences.theme;
    return this.write(raw);
  }
}

function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as T;
}
