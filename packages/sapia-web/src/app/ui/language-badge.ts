import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const COLORS: Record<string, string> = {
  plantuml: 'var(--primary)',
  mermaid: 'var(--accent)',
};

/** Small coloured tile with the language's initials. */
@Component({
  selector: 'sapia-language-badge',
  template: '{{ initials() }}',
  host: { '[style.--badge]': 'color()', '[style.width.px]': 'size()', '[style.height.px]': 'size()', '[style.font-size.px]': 'size() * 0.4' },
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      border-radius: 28%;
      background: color-mix(in srgb, var(--badge) 16%, transparent);
      color: var(--badge);
      font-weight: 750;
      letter-spacing: -0.02em;
      line-height: 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageBadge {
  readonly languageId = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>(null);
  readonly size = input(28);
  protected readonly color = computed(() => COLORS[this.languageId() ?? ''] ?? 'var(--text-2)');
  protected readonly initials = computed(() => {
    const name = this.name() ?? this.languageId() ?? '';
    if (!name) return '?';
    const caps = name.replace(/[^A-Z]/g, '');
    return (caps.length >= 2 ? caps.slice(0, 2) : name.slice(0, 2)).replace(/^./, (c) => c.toUpperCase());
  });
}
