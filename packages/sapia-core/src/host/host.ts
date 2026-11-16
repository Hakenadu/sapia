import type { AiBackend } from '../ai/ai';
import type { AiProviderConfig, AiProviderTypeInfo, DiagramThemeMode, SapiaConfig, ThemePreference } from '../config/config';
import type { DiagramStore } from '../storage/store';

/** A plugin the host resolved and can serve to the UI as an ES module. */
export interface HostPlugin {
  /** The reference from the config (package name or path). */
  origin: string;
  /** URL the UI imports the plugin module from. */
  url: string;
  /** Base URL of the plugin's static assets. */
  assetBase: string;
  options: Record<string, unknown>;
}

export interface HostBootstrap {
  /** Sanitised config: API keys are replaced by placeholders. */
  config: SapiaConfig;
  configPath: string;
  /** False on first start – the UI then runs the onboarding flow. */
  configExists: boolean;
  /** Problems found while reading the config. */
  issues: string[];
  plugins: HostPlugin[];
  pluginErrors: { origin: string; error: string }[];
  /** Locales preferred by the operating system, most preferred first. */
  systemLocales: string[];
  appVersion: string;
  aiProviderTypes: AiProviderTypeInfo[];
}

export interface OnboardingResult {
  locale: string;
  theme: ThemePreference;
  /** Present when the user connected an AI provider. */
  ai?: { id: string; provider: AiProviderConfig };
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  /**
   * Machine readable cause of a failure. `model-not-listed`: the endpoint works
   * but its model list does not contain the model; the user may add it anyway.
   */
  reason?: 'model-not-listed';
  /** Model ids offered by the endpoint, when it lists them. */
  models?: string[];
}

export interface HostPreferences {
  locale?: string;
  theme?: ThemePreference;
  diagramTheme?: DiagramThemeMode;
}

/**
 * Bridge between the UI and a native shell. The desktop app exposes an
 * implementation as `window.sapiaHost`; in a plain browser it is absent and
 * the UI falls back to web behaviour (`/config.json`, local storage, no AI).
 */
export interface SapiaHost {
  readonly platform: 'desktop';
  getBootstrap(): Promise<HostBootstrap>;
  /** Writes the initial config file and returns the refreshed bootstrap data. */
  completeOnboarding(result: OnboardingResult): Promise<HostBootstrap>;
  /** Persists UI preferences into the config file. */
  updatePreferences(preferences: HostPreferences): Promise<void>;
  readonly store: DiagramStore;
  readonly ai: AiBackend & {
    /** Checks credentials and endpoint of a provider before it is saved. */
    testProvider(provider: AiProviderConfig): Promise<ProviderTestResult>;
  };
  /** Reveals the config file in the system file manager. */
  showConfigFile(): Promise<void>;
  openExternal(url: string): Promise<void>;
  /**
   * Share links (`sapia://open/#d=…`) the operating system handed to the
   * app. The handler also receives a link that started the app.
   */
  onOpenLink(handler: (link: string) => void): void;
}
