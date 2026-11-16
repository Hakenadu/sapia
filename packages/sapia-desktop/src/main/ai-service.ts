import type { AiBackend, AiChatHandlers, AiChatRequest, AiProviderConfig, ProviderTestResult, SapiaConfig } from '@sapia/core';
import { dynamicTool, generateText, isStepCount, jsonSchema, streamText } from 'ai';
import type { ModelMessage, ToolSet } from 'ai';
import { resolveApiKey } from './providers';
import type { AiProviderRegistry } from './providers';

export interface AiServiceOptions {
  config: () => SapiaConfig;
  providers: AiProviderRegistry;
  env?: NodeJS.ProcessEnv;
}

function describe(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; statusCode?: unknown; responseBody?: unknown; cause?: unknown };
    let message = typeof e.message === 'string' ? e.message : String(error);
    if (typeof e.statusCode === 'number' && !message.includes(String(e.statusCode))) message = `${e.statusCode} – ${message}`;
    const cause = e.cause as { code?: unknown; message?: unknown } | undefined;
    if (cause && typeof cause.message === 'string' && !message.includes(cause.message)) message += ` (${cause.message})`;
    return message;
  }
  return String(error);
}

/**
 * Runs the assistant's model in the main process with the Vercel AI SDK.
 * Credentials stay here; the tools themselves run in the UI through
 * {@link AiChatHandlers.executeTool}.
 */
export class AiService implements AiBackend {
  private readonly sessions = new Map<string, ModelMessage[]>();
  private readonly running = new Map<string, AbortController>();
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly options: AiServiceOptions) {
    this.env = options.env ?? process.env;
  }

  private async model(provider: AiProviderConfig) {
    const factory = this.options.providers.get(provider.type);
    if (!factory) {
      const known = this.options.providers.types().map((t) => t.id).join(', ');
      throw new Error(`Unknown AI provider type "${provider.type}". Available: ${known}`);
    }
    const context = { config: provider, apiKey: resolveApiKey(provider, factory.info, this.env) };
    return { factory, context, model: await factory.createModel(context) };
  }

  async chat(request: AiChatRequest, handlers: AiChatHandlers, signal?: AbortSignal): Promise<void> {
    const config = this.options.config();
    const providerId = request.provider ?? config.ai.provider;
    const provider = providerId ? config.ai.providers[providerId] : undefined;
    if (!config.ai.enabled || !provider) throw new Error('No AI provider is configured.');

    this.running.get(request.sessionId)?.abort();
    const controller = new AbortController();
    this.running.set(request.sessionId, controller);
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', () => controller.abort(), { once: true });

    const history = this.sessions.get(request.sessionId) ?? [];
    const messages: ModelMessage[] = [...history, { role: 'user', content: request.message }];

    const tools: ToolSet = {};
    for (const spec of request.tools) {
      tools[spec.name] = dynamicTool({
        description: spec.description,
        inputSchema: jsonSchema(spec.inputSchema as Parameters<typeof jsonSchema>[0]),
        execute: (input: unknown) => handlers.executeTool(spec.name, input),
      });
    }

    let failure: string | undefined;
    try {
      const { model } = await this.model(provider);
      const result = streamText({
        model,
        system: request.system,
        messages,
        tools,
        stopWhen: isStepCount(config.ai.maxSteps),
        abortSignal: controller.signal,
        providerOptions: provider.options as Parameters<typeof streamText>[0]['providerOptions'],
        onError: () => {
          /* errors arrive as stream parts; keep them off the console */
        },
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            if (part.text) handlers.onEvent({ type: 'text-delta', text: part.text });
            break;
          case 'reasoning-delta':
            if (part.text) handlers.onEvent({ type: 'reasoning-delta', text: part.text });
            break;
          case 'tool-call':
            handlers.onEvent({ type: 'tool-call', id: part.toolCallId, name: part.toolName, input: part.input });
            break;
          case 'tool-result':
            handlers.onEvent({ type: 'tool-result', id: part.toolCallId, name: part.toolName, output: part.output });
            break;
          case 'tool-error':
            handlers.onEvent({ type: 'tool-result', id: part.toolCallId, name: part.toolName, output: { error: describe(part.error) }, isError: true });
            break;
          case 'error':
            failure = describe(part.error);
            break;
          default:
            break;
        }
      }

      if (!failure && !controller.signal.aborted) {
        // Keep the whole exchange, tool calls included, for follow-up questions.
        this.sessions.set(request.sessionId, [...messages, ...(await result.responseMessages)]);
      }
    } catch (e) {
      if (!controller.signal.aborted) failure = describe(e);
    } finally {
      if (this.running.get(request.sessionId) === controller) this.running.delete(request.sessionId);
    }

    if (failure && !controller.signal.aborted) handlers.onEvent({ type: 'error', message: failure });
    handlers.onEvent({ type: 'finish' });
  }

  /** Stops the running request of a session, if any. */
  async abort(sessionId: string): Promise<void> {
    this.running.get(sessionId)?.abort();
  }

  async reset(sessionId: string): Promise<void> {
    this.running.get(sessionId)?.abort();
    this.sessions.delete(sessionId);
  }

  /** Checks endpoint, credentials and model of a provider that is not saved yet. */
  async testProvider(provider: AiProviderConfig): Promise<ProviderTestResult> {
    let models: string[] | undefined;
    try {
      const { factory, context, model } = await this.model(provider);
      if (factory.listModels) {
        try {
          models = await factory.listModels(context);
        } catch (e) {
          const message = describe(e);
          // Wrong credentials or host: no point in trying a completion.
          if (/\b(401|403)\b|ENOTFOUND|ECONNREFUSED|fetch failed|Invalid URL/i.test(message)) return { ok: false, message };
        }
        if (models?.length && !models.includes(provider.model)) {
          return { ok: false, reason: 'model-not-listed', message: `The endpoint does not offer the model "${provider.model}".`, models };
        }
      }
      await generateText({ model, prompt: 'Reply with the single word: ok', maxRetries: 0, abortSignal: AbortSignal.timeout(30000) });
      return { ok: true, message: '', models };
    } catch (e) {
      return { ok: false, message: describe(e), models };
    }
  }
}
