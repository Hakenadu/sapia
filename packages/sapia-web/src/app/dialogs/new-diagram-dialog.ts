import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { I18nService } from '../core/i18n.service';
import { SapiaService } from '../core/sapia.service';
import { Icon } from '../ui/icon';
import { LanguageBadge } from '../ui/language-badge';
import { DomSanitizer } from '@angular/platform-browser';
import type { SafeHtml } from '@angular/platform-browser';
import { glyphMarkup } from './diagram-glyphs';

export type NewDiagramResult = { languageId: string; diagramType: string } | 'blank';

/** Template gallery: every language's diagram types that ship a starter. */
@Component({
  selector: 'sapia-new-diagram-dialog',
  imports: [Icon, LanguageBadge],
  template: `
    <header>
      <div>
        <h2>{{ t('new.title') }}</h2>
        <p>{{ t('new.subtitle') }}</p>
      </div>
      <button class="icon-button" (click)="ref.close()" [attr.aria-label]="t('action.close')"><sapia-icon name="close" /></button>
    </header>

    <div class="tabs" role="tablist">
      @for (language of languages(); track language.id) {
        <button role="tab" class="tab" [class.active]="language.id === selected()" [attr.aria-selected]="language.id === selected()" (click)="selected.set(language.id)">
          <sapia-language-badge [languageId]="language.id" [name]="language.name" [size]="22" />
          {{ language.name }}
        </button>
      }
    </div>

    <div class="grid">
      @for (type of templates(); track type.id) {
        <button class="card" (click)="ref.close({ languageId: selected(), diagramType: type.id })">
          <span class="glyph" [innerHTML]="glyph(type.id)"></span>
          <span class="label">{{ i18n.diagramType(type.id) }}</span>
        </button>
      }
      <button class="card blank" (click)="ref.close('blank')">
        <span class="glyph"><sapia-icon name="plus" [size]="26" [stroke]="1.4" /></span>
        <span class="label">{{ t('new.blank') }}</span>
      </button>
    </div>
  `,
  styleUrl: './new-diagram-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewDiagramDialog {
  protected readonly ref = inject<MatDialogRef<NewDiagramDialog, NewDiagramResult>>(MatDialogRef);
  protected readonly i18n = inject(I18nService);
  private readonly sapia = inject(SapiaService);
  protected readonly t = this.i18n.t;

  protected readonly languages = computed(() => {
    this.sapia.registryVersion();
    return this.sapia.core.languages.all().filter((l) => l.diagramTypes.some((t) => t.template));
  });
  protected readonly selected = signal(this.languages()[0]?.id ?? '');
  protected readonly templates = computed(() => this.sapia.core.languages.get(this.selected())?.diagramTypes.filter((t) => t.template) ?? []);

  private readonly sanitizer = inject(DomSanitizer);
  private readonly glyphs = new Map<string, SafeHtml>();

  protected glyph(type: string): SafeHtml {
    let value = this.glyphs.get(type);
    if (!value) {
      // Bundled artwork only, never user content.
      value = this.sanitizer.bypassSecurityTrustHtml(glyphMarkup(type));
      this.glyphs.set(type, value);
    }
    return value;
  }
}
