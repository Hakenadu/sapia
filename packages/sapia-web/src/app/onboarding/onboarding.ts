import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { isValidHeaderName, isValidHeaderValue } from '@sapia/core';
import type { AiProviderConfig, AiProviderTypeInfo, ThemePreference } from '@sapia/core';
import { formatBinding } from '../core/keys';
import { I18nService } from '../core/i18n.service';
import { SapiaService } from '../core/sapia.service';
import { ThemeService } from '../core/theme.service';
import { LEGAL_DOCS } from '../legal/legal-content';
import { LegalService } from '../legal/legal.service';
import { Icon } from '../ui/icon';
import type { IconName } from '../ui/icon';
import { Logo } from '../ui/logo';

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; message: string }
  | { status: 'failed'; message: string }
  /** The endpoint answers but does not list the model: the user decides. */
  | { status: 'unlisted'; models: string[] };

/** One editable row of the custom header list. */
interface HeaderRow {
  id: number;
  name: string;
  value: string;
  /** Shows the value in plain text; values are masked like the API key by default. */
  revealed: boolean;
}

/**
 * First-run flow of the desktop app: appearance, optional AI provider, then
 * the host writes `~/.sapia/config.json` with the collected answers.
 */
@Component({
  selector: 'sapia-onboarding',
  imports: [Icon, Logo],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Onboarding {
  protected readonly i18n = inject(I18nService);
  protected readonly sapia = inject(SapiaService);
  protected readonly theme = inject(ThemeService);
  protected readonly legal = inject(LegalService);
  protected readonly legalDocs = LEGAL_DOCS;
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
  protected readonly headers = signal<HeaderRow[]>([]);
  protected readonly headersOpen = signal(false);
  private nextHeaderId = 0;
  protected readonly envExample = '${env:NAME}';
  /** Per row id: the problem with that row, if any. */
  protected readonly headerErrors = computed(() => {
    const errors = new Map<number, string>();
    const seen = new Set<string>();
    for (const row of this.headers()) {
      const name = row.name.trim();
      if (!name && !row.value) continue;
      const key = name.toLowerCase();
      if (!name) errors.set(row.id, this.t('onboarding.ai.headers.missingName'));
      else if (!isValidHeaderName(name)) errors.set(row.id, this.t('onboarding.ai.headers.invalidName'));
      else if (seen.has(key)) errors.set(row.id, this.t('onboarding.ai.headers.duplicate', { name }));
      else if (!isValidHeaderValue(row.value)) errors.set(row.id, this.t('onboarding.ai.headers.invalidValue'));
      seen.add(key);
    }
    return errors;
  });
  protected readonly headerCount = computed(() => this.headers().filter((h) => h.name.trim()).length);
  protected readonly models = signal<string[]>([]);
  protected readonly test = signal<TestState>({ status: 'idle' });
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly connected = signal<AiProviderConfig | null>(null);
  protected readonly configPath = signal('');

  protected readonly selectedType = computed(() => this.providerTypes().find((p) => p.id === this.type()));
  protected readonly canConnect = computed(
    () => !!this.type() && !!this.model().trim() && this.headerErrors().size === 0 && !this.saving() && this.test().status !== 'testing',
  );
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

  protected toggleHeaders(): void {
    const open = !this.headersOpen();
    this.headersOpen.set(open);
    if (open && !this.headers().length) this.addHeader();
  }

  protected addHeader(): void {
    this.headers.update((rows) => [...rows, { id: this.nextHeaderId++, name: '', value: '', revealed: false }]);
  }

  protected updateHeader(id: number, change: Partial<Omit<HeaderRow, 'id'>>): void {
    this.headers.update((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
    if (!('revealed' in change)) this.edited();
  }

  protected removeHeader(id: number): void {
    this.headers.update((rows) => rows.filter((row) => row.id !== id));
    this.edited();
  }

  private provider(): AiProviderConfig {
    const provider: AiProviderConfig = { type: this.type(), model: this.model().trim() };
    const baseUrl = this.baseUrl().trim();
    if (baseUrl && baseUrl !== this.selectedType()?.defaultBaseUrl) provider.baseUrl = baseUrl;
    if (this.apiKey().trim()) provider.apiKey = this.apiKey().trim();
    const headers = this.headers().filter((h) => h.name.trim());
    if (headers.length) provider.headers = Object.fromEntries(headers.map((h) => [h.name.trim(), h.value.trim()]));
    return provider;
  }

  protected async runTest(): Promise<boolean> {
    const host = this.sapia.host;
    if (!host) return false;
    this.test.set({ status: 'testing' });
    try {
      const result = await host.ai.testProvider({ ...this.provider(), baseUrl: this.baseUrl().trim() || undefined });
      if (result.models?.length) this.models.set(result.models);
      if (result.ok) this.test.set({ status: 'ok', message: result.message || this.t('onboarding.ai.ok') });
      else if (result.reason === 'model-not-listed') this.test.set({ status: 'unlisted', models: this.closest(this.model(), result.models ?? []) });
      else this.test.set({ status: 'failed', message: result.message });
      return result.ok;
    } catch (e) {
      this.test.set({ status: 'failed', message: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  /** Up to six offered models, the ones most similar to what was typed first. */
  private closest(wanted: string, models: string[]): string[] {
    const w = wanted.toLowerCase();
    const score = (id: string): number => {
      const m = id.toLowerCase();
      if (m.includes(w) || w.includes(m)) return 0;
      let common = 0;
      while (common < Math.min(m.length, w.length) && m[common] === w[common]) common++;
      return 100 - common;
    };
    return [...models].sort((a, b) => score(a) - score(b) || a.localeCompare(b)).slice(0, 6);
  }

  protected pickModel(id: string): void {
    this.model.set(id);
    void this.runTest();
  }

  /** Saves a provider whose model the endpoint does not list, without further checks. */
  protected async addAnyway(): Promise<void> {
    await this.complete(this.provider());
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
