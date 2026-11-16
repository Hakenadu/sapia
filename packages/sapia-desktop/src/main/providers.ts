import { createOpenAI } from '@ai-sdk/openai';
import { BUILTIN_AI_PROVIDER_TYPES } from '@sapia/core';
import type { AiProviderConfig, AiProviderTypeInfo } from '@sapia/core';
import type { LanguageModel } from 'ai';

export interface ProviderContext {
  /** The provider entry from the config, with the API key resolved. */
  config: AiProviderConfig;
  apiKey: string | undefined;
}

/** Turns a provider entry of the config into an AI SDK language model. */
export interface AiProviderFactory {
  info: AiProviderTypeInfo;
  createModel(context: ProviderContext): LanguageModel | Promise<LanguageModel>;
  /** Lists the model ids the endpoint offers; used by "Test connection". */
  listModels?(context: ProviderContext): Promise<string[]>;
}

/** Provider types by id. Plugins add their own through their main-process entry. */
export class AiProviderRegistry {
  private readonly factories = new Map<string, AiProviderFactory>();

  register(factory: AiProviderFactory): void {
    this.factories.set(factory.info.id, factory);
  }

  get(type: string): AiProviderFactory | undefined {
    return this.factories.get(type);
  }

  types(): AiProviderTypeInfo[] {
    return [...this.factories.values()].map((f) => f.info);
  }
}

export function resolveApiKey(config: AiProviderConfig, info: AiProviderTypeInfo | undefined, env: NodeJS.ProcessEnv): string | undefined {
  if (config.apiKey) return config.apiKey;
  const name = config.apiKeyEnv ?? info?.apiKeyEnv;
  return name ? env[name] || undefined : undefined;
}

function openAi(context: ProviderContext) {
  return createOpenAI({
    // Local servers often need no key, but the client insists on one.
    apiKey: context.apiKey ?? 'not-needed',
    baseURL: context.config.baseUrl?.replace(/\/+$/, '') || undefined,
    headers: context.config.headers,
  });
}

/** `GET {baseUrl}/models`, the de-facto standard of OpenAI compatible servers. */
async function listOpenAiModels(context: ProviderContext, defaultBaseUrl: string): Promise<string[]> {
  const base = (context.config.baseUrl || defaultBaseUrl).replace(/\/+$/, '');
  const response = await fetch(`${base}/models`, {
    headers: { ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}), ...context.config.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: { message?: string } | string };
      detail = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    } catch {
      /* no JSON body */
    }
    throw new Error(`${response.status} ${response.statusText}${detail ? ` – ${detail}` : ''}`.trim());
  }
  const body = (await response.json()) as { data?: { id?: unknown }[] };
  return (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string').sort();
}

export function createDefaultProviderRegistry(): AiProviderRegistry {
  const registry = new AiProviderRegistry();
  const info = (id: string) => BUILTIN_AI_PROVIDER_TYPES.find((t) => t.id === id)!;
  const responses = info('openai-responses');
  const chat = info('openai-chat');
  registry.register({
    info: responses,
    createModel: (context) => openAi(context).responses(context.config.model),
    listModels: (context) => listOpenAiModels(context, responses.defaultBaseUrl!),
  });
  registry.register({
    info: chat,
    createModel: (context) => openAi(context).chat(context.config.model),
    listModels: (context) => listOpenAiModels(context, chat.defaultBaseUrl!),
  });
  return registry;
}
