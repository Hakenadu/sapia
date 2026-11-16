import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, output, signal, viewChild } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiChatService } from '../core/ai-chat.service';
import type { ChatMessage } from '../core/ai-chat.service';
import { I18nService } from '../core/i18n.service';
import { formatBinding } from '../core/keys';
import { SapiaService } from '../core/sapia.service';
import { WorkspaceService } from '../core/workspace.service';
import { Icon } from '../ui/icon';
import { renderMarkdown } from './markdown';

/** Floating assistant: a command bar that grows into a conversation. */
@Component({
  selector: 'sapia-ai-widget',
  imports: [Icon, MatTooltipModule],
  templateUrl: './ai-widget.html',
  styleUrl: './ai-widget.scss',
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiWidget {
  protected readonly chat = inject(AiChatService);
  protected readonly sapia = inject(SapiaService);
  private readonly workspace = inject(WorkspaceService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly closed = output<void>();

  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  protected readonly draft = signal('');
  protected readonly shortcut = computed(() => formatBinding(this.sapia.config().keybindings.aiAssistant));

  protected readonly providerLabel = computed(() => this.chat.provider()?.model ?? '');

  protected readonly suggestions = computed(() => {
    const items: string[] = [];
    const hasDiagram = !!this.workspace.detection();
    if (hasDiagram && this.workspace.errorCount() > 0) items.push(this.t('ai.suggest.fix'));
    if (hasDiagram) items.push(this.t('ai.suggest.explain'), this.t('ai.suggest.improve'));
    const target = this.workspace.conversionTargets()[0];
    if (target) items.push(this.t('ai.suggest.convert', { language: target.name }));
    items.push(this.t('ai.suggest.create'));
    return items.slice(0, 4);
  });

  constructor() {
    afterNextRender(() => this.focus());
    // Keep the newest content in view while the answer streams in.
    effect(() => {
      this.chat.messages();
      const el = this.scroller()?.nativeElement;
      if (el) queueMicrotask(() => el.scrollTo({ top: el.scrollHeight }));
    });
  }

  focus(): void {
    this.input()?.nativeElement.focus();
  }

  protected html(text: string): string {
    return renderMarkdown(text);
  }

  protected isThinking(message: ChatMessage): boolean {
    if (!this.chat.busy() || message.role !== 'assistant' || message !== this.chat.messages().at(-1)) return false;
    const last = message.parts.at(-1);
    return !last || (last.type === 'tool' && last.status !== 'running');
  }

  protected toolLabel(name: string): string {
    const key = `ai.tool.${name}`;
    const label = this.t(key);
    return label === key ? name : label;
  }

  protected onInput(el: HTMLTextAreaElement): void {
    this.draft.set(el.value);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(text = this.draft()): void {
    if (!text.trim() || this.chat.busy() || !this.chat.available()) return;
    this.draft.set('');
    const el = this.input()?.nativeElement;
    if (el) {
      el.value = '';
      el.style.height = 'auto';
    }
    void this.chat.send(text);
  }

  protected onEscape(event: Event): void {
    event.stopPropagation();
    if (this.chat.busy()) this.chat.stop();
    else this.closed.emit();
  }
}
