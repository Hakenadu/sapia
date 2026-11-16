import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import type { AiProviderConfig, AiProviderTypeInfo, ThemePreference } from '@sapia/core';
import { formatBinding } from '../core/keys';
import { I18nService } from '../core/i18n.service';
import { SapiaService } from '../core/sapia.service';
import { ThemeService } from '../core/theme.service';
import { Icon } from '../ui/icon';
import type { IconName } from '../ui/icon';

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok'; message: string } | { status: 'failed'; message: string };

/**
 * First-run flow of the desktop app: appearance, optional AI provider, then
 * the host writes `~/.sapia/config.json` with the collected answers.
 */
@Component({
  selector: 'sapia-onboarding',
  imports: [Icon],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Onboarding {
  protected readonly i18n = inject(I18nService);
  protected readonly sapia = inject(SapiaService);
  protected readonly theme = inject(ThemeService);
  protected readonly t = this.i18n.t;

  readonly finished = output<void>();

  protected readonly steps = ['appearance', 'ai', 'done'] as const;
  protected readonly step = signal(0);
  protected readonly themes: { id: ThemePreference; icon: IconName }[] = [
    { id: 'system', icon: 'system' },
    { id: 'light', icon: 'sun' },
    { id: 'dark', icon: 'moon' },
  ];

  protected readonly providerTypes = computed<AiProviderTypeInfo[]>(() => this.sapia.bootstrap()?.aiProviderTypes ?? []);
  protected readonly type = signal('');
  protected readonly baseUrl = signal('');
  protected readonly apiKey = signal('');
  protected readonly model = signal('');
  protected readonly models = signal<string[]>([]);
  protected readonly test = signal<TestState>({ status: 'idle' });
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly connected = signal<AiProviderConfig | null>(null);
  protected readonly configPath = signal('');

  protected readonly selectedType = computed(() => this.providerTypes().find((p) => p.id === this.type()));
  protected readonly canConnect = computed(() => !!this.type() && !!this.model().trim() && !this.saving() && this.test().status !== 'testing');
  protected readonly shortcut = computed(() => formatBinding(this.sapia.config().keybindings.aiAssistant));
  protected readonly connectedSummary = computed(() => {
    const provider = this.connected();
    if (!provider) return this.t('onboarding.done.noAi');
    const name = this.providerTypes().find((p) => p.id === provider.type)?.name ?? provider.type;
    return this.t('onboarding.done.ai', { provider: name, model: provider.model });
  });

  constructor() {
    const first = this.providerTypes()[0];
    if (first) this.selectType(first);
  }

  protected hint(type: AiProviderTypeInfo): string {
    const key = `onboarding.ai.hint.${type.id}`;
    const text = this.t(key);
    return text === key ? '' : text;
  }

  protected selectType(type: AiProviderTypeInfo): void {
    const previous = this.selectedType();
    this.type.set(type.id);
    if (!this.baseUrl() || this.baseUrl() === (previous?.defaultBaseUrl ?? '')) this.baseUrl.set(type.defaultBaseUrl ?? '');
    if (!this.model() || this.model() === (previous?.defaultModel ?? '')) this.model.set(type.defaultModel ?? '');
    this.test.set({ status: 'idle' });
  }

  protected edited(): void {
    if (this.test().status !== 'testing') this.test.set({ status: 'idle' });
  }

  private provider(): AiProviderConfig {
    const provider: AiProviderConfig = { type: this.type(), model: this.model().trim() };
    const baseUrl = this.baseUrl().trim();
    if (baseUrl && baseUrl !== this.selectedType()?.defaultBaseUrl) provider.baseUrl = baseUrl;
    if (this.apiKey().trim()) provider.apiKey = this.apiKey().trim();
    return provider;
  }

  protected async runTest(): Promise<boolean> {
    const host = this.sapia.host;
    if (!host) return false;
    this.test.set({ status: 'testing' });
    try {
      const result = await host.ai.testProvider({ ...this.provider(), baseUrl: this.baseUrl().trim() || undefined });
      if (result.models?.length) this.models.set(result.models);
      this.test.set(result.ok ? { status: 'ok', message: result.message || this.t('onboarding.ai.ok') } : { status: 'failed', message: result.message });
      return result.ok;
    } catch (e) {
      this.test.set({ status: 'failed', message: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  /** Verifies the provider and, when it works, writes the config with it. */
  protected async connect(): Promise<void> {
    if (this.test().status !== 'ok' && !(await this.runTest())) return;
    await this.complete(this.provider());
  }

  protected async complete(provider: AiProviderConfig | null): Promise<void> {
    const host = this.sapia.host;
    if (!host || this.saving()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const bootstrap = await host.completeOnboarding({
        locale: this.i18n.locale(),
        theme: this.theme.preference(),
        ...(provider ? { ai: { id: 'default', provider } } : {}),
      });
      this.configPath.set(bootstrap.configPath);
      this.connected.set(provider);
      // Keep showing the flow until the user leaves the last step.
      this.pending = bootstrap;
      this.step.set(2);
    } catch (e) {
      this.saveError.set(this.t('onboarding.failed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      this.saving.set(false);
    }
  }

  private pending: Awaited<ReturnType<NonNullable<SapiaService['host']>['completeOnboarding']>> | null = null;

  protected start(): void {
    if (this.pending) this.sapia.applyBootstrap(this.pending);
    this.finished.emit();
  }
}
