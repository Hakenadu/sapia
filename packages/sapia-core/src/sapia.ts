import { AiToolRegistry, createCoreAiTools } from './ai/ai';
import { ConversionService } from './conversion/conversion';
import { I18n } from './i18n/i18n';
import { coreMessagesDe, coreMessagesEn } from './i18n/messages';
import { LanguageRegistry } from './language/registry';
import { PluginManager } from './plugin/plugin';
import type { PluginLogger, SapiaPlatform } from './plugin/plugin';

export interface SapiaOptions {
  platform?: SapiaPlatform;
  /** Plugin ids that must not be activated. */
  disabledPlugins?: readonly string[];
  logger?: PluginLogger;
}

/** The assembled core: registries, services and the plugin manager. */
export interface Sapia {
  readonly languages: LanguageRegistry;
  readonly conversion: ConversionService;
  readonly i18n: I18n;
  readonly aiTools: AiToolRegistry;
  readonly plugins: PluginManager;
}

/**
 * Creates an empty Sapia instance. Language support is added exclusively
 * through plugins — including PlantUML and Mermaid, which ship as
 * `@sapia/plugin-plantuml` and `@sapia/plugin-mermaid`.
 */
export function createSapia(options: SapiaOptions = {}): Sapia {
  const languages = new LanguageRegistry();
  const conversion = new ConversionService();
  const i18n = new I18n();
  i18n.addMessages('en', coreMessagesEn);
  i18n.addMessages('de', coreMessagesDe);
  const aiTools = new AiToolRegistry();
  for (const tool of createCoreAiTools()) aiTools.register(tool);
  const plugins = new PluginManager(
    { languages, conversion, i18n, aiTools },
    { platform: options.platform ?? 'web', disabled: options.disabledPlugins, logger: options.logger },
  );
  return { languages, conversion, i18n, aiTools, plugins };
}
