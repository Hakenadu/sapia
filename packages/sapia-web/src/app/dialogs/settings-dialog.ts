import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { formatBinding } from '../core/keys';
import { I18nService } from '../core/i18n.service';
import { SapiaService } from '../core/sapia.service';
import { LEGAL_DOCS } from '../legal/legal-content';
import type { LegalDocId } from '../legal/legal-content';
import { LegalService } from '../legal/legal.service';
import { Icon } from '../ui/icon';
import type { IconName } from '../ui/icon';
import { LanguageBadge } from '../ui/language-badge';

type Tab = 'plugins' | 'languages' | 'shortcuts' | 'config' | 'legal';

/** Read-only overview of plugins, languages, shortcuts and the configuration source. */
@Component({
  selector: 'sapia-settings-dialog',
  imports: [Icon, LanguageBadge],
  templateUrl: './settings-dialog.html',
  styleUrl: './settings-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDialog {
  protected readonly ref = inject<MatDialogRef<SettingsDialog>>(MatDialogRef);
  protected readonly i18n = inject(I18nService);
  protected readonly sapia = inject(SapiaService);
  protected readonly t = this.i18n.t;

  protected readonly tabs: Tab[] = ['plugins', 'languages', 'shortcuts', 'config', 'legal'];
  protected readonly tabIcons: Record<Tab, IconName> = { plugins: 'plugins', languages: 'languages', shortcuts: 'key', config: 'settings', legal: 'scale' };
  protected readonly legal = inject(LegalService);
  protected readonly legalDocs = LEGAL_DOCS;
  protected readonly legalIcons: Record<LegalDocId, IconName> = { imprint: 'info', privacy: 'shield', terms: 'file-text' };
  protected readonly year = new Date().getFullYear();
  protected readonly tab = signal<Tab>('plugins');

  protected readonly languages = computed(() => {
    this.sapia.registryVersion();
    const { languages, conversion } = this.sapia.core;
    return languages.all().map((l) => ({
      id: l.id,
      name: l.name,
      types: l.diagramTypes.map((type) => ({ id: type.id, convertible: conversion.targetsFor(l.id, type.id).length > 0 })),
    }));
  });

  protected readonly shortcuts = computed(() => {
    const keys = this.sapia.config().keybindings;
    return [
      { label: 'shortcut.ai', keys: formatBinding(keys.aiAssistant) },
      { label: 'shortcut.save', keys: formatBinding(keys.save) },
      { label: 'shortcut.new', keys: formatBinding(keys.newDiagram) },
      { label: 'shortcut.library', keys: formatBinding(keys.openLibrary) },
      { label: 'shortcut.convert', keys: formatBinding(keys.convert) },
      { label: 'shortcut.complete', keys: formatBinding('Ctrl-Space') },
      { label: 'shortcut.search', keys: formatBinding('Mod-f') },
      { label: 'shortcut.comment', keys: formatBinding('Mod-/') },
    ];
  });

  protected readonly aiProvider = computed(() => {
    const ai = this.sapia.config().ai;
    const provider = ai.enabled && ai.provider ? ai.providers[ai.provider] : null;
    if (!provider) return null;
    const type = this.sapia.bootstrap()?.aiProviderTypes.find((p) => p.id === provider.type)?.name ?? provider.type;
    const headers = Object.keys(provider.headers ?? {}).length;
    const extra = headers ? ` · ${headers === 1 ? this.t('settings.config.aiHeader') : this.t('settings.config.aiHeaders', { count: headers })}` : '';
    return `${type} · ${provider.model}${extra}`;
  });

  protected showConfig(): void {
    void this.sapia.host?.showConfigFile();
  }
}
