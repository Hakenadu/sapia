import { Injectable, computed, inject, signal } from '@angular/core';
import { buildAiSystemPrompt } from '@sapia/core';
import type { AiStreamEvent } from '@sapia/core';
import { I18nService } from './i18n.service';
import { SapiaService } from './sapia.service';
import { WorkspaceService } from './workspace.service';

export interface ToolRun {
  type: 'tool';
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
  mutating: boolean;
  detail?: string;
}

export type ChatPart = { type: 'text'; text: string } | ToolRun;

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  parts: ChatPart[];
  error?: string;
  stopped?: boolean;
}

let nextId = 1;
const newSession = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Conversation with the AI assistant. The model itself runs in the host process. */
@Injectable({ providedIn: 'root' })
export class AiChatService {
  private readonly sapia = inject(SapiaService);
  private readonly workspace = inject(WorkspaceService);
  private readonly i18n = inject(I18nService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly busy = signal(false);
  private sessionId = newSession();
  private controller: AbortController | null = null;

  readonly provider = computed(() => {
    const ai = this.sapia.config().ai;
    return ai.enabled && ai.provider ? { id: ai.provider, ...ai.providers[ai.provider] } : null;
  });
  readonly available = computed(() => !!this.sapia.host && !!this.provider());

  private update(id: number, change: (message: ChatMessage) => ChatMessage): void {
    this.messages.update((list) => list.map((m) => (m.id === id ? change(m) : m)));
  }

  async send(text: string): Promise<void> {
    const host = this.sapia.host;
    const message = text.trim();
    if (!host || !message || this.busy()) return;

    const assistantId = nextId++;
    this.messages.update((list) => [
      ...list,
      { id: nextId++, role: 'user', parts: [{ type: 'text', text: message }] },
      { id: assistantId, role: 'assistant', parts: [] },
    ]);
    this.busy.set(true);
    this.controller = new AbortController();
    const tools = this.sapia.core.aiTools;

    const onEvent = (event: AiStreamEvent) => {
      switch (event.type) {
        case 'text-delta':
          this.update(assistantId, (m) => {
            const last = m.parts[m.parts.length - 1];
            if (last?.type === 'text') return { ...m, parts: [...m.parts.slice(0, -1), { type: 'text', text: last.text + event.text }] };
            return { ...m, parts: [...m.parts, { type: 'text', text: event.text }] };
          });
          break;
        case 'tool-call':
          this.update(assistantId, (m) => ({
            ...m,
            parts: [...m.parts, { type: 'tool', id: event.id, name: event.name, status: 'running', mutating: !!tools.get(event.name)?.mutating }],
          }));
          break;
        case 'error':
          this.update(assistantId, (m) => ({ ...m, error: event.message }));
          break;
        default:
          break;
      }
    };

    const executeTool = async (name: string, input: unknown): Promise<unknown> => {
      const { output, isError } = await tools.execute(name, input, { workspace: this.workspace.aiWorkspace });
      this.update(assistantId, (m) => ({
        ...m,
        parts: m.parts.map((p) =>
          p.type === 'tool' && p.name === name && p.status === 'running'
            ? { ...p, status: isError ? 'error' : 'done', detail: isError ? String((output as { error?: unknown }).error ?? '') : undefined }
            : p,
        ),
      }));
      return output;
    };

    try {
      await host.ai.chat(
        {
          sessionId: this.sessionId,
          message,
          system: buildAiSystemPrompt({ locale: this.i18n.locale(), capabilities: this.workspace.capabilities(), projects: this.workspace.aiProjects() }),
          tools: tools.specs(),
        },
        { onEvent, executeTool },
        this.controller.signal,
      );
    } catch (e) {
      if (!this.controller.signal.aborted) this.update(assistantId, (m) => ({ ...m, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      const aborted = this.controller?.signal.aborted;
      this.update(assistantId, (m) => ({
        ...m,
        stopped: aborted || undefined,
        parts: m.parts.map((p) => (p.type === 'tool' && p.status === 'running' ? { ...p, status: 'error' } : p)),
      }));
      this.controller = null;
      this.busy.set(false);
    }
  }

  stop(): void {
    if (!this.controller) return;
    this.controller.abort();
    void this.sapia.host?.ai.abort(this.sessionId);
  }

  reset(): void {
    this.stop();
    const old = this.sessionId;
    this.sessionId = newSession();
    this.messages.set([]);
    void this.sapia.host?.ai.reset(old);
  }
}
