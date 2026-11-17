import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ProjectLocationType } from '@sapia/core';
import { Icon } from './icon';
import type { IconName } from './icon';

const ICONS: Record<ProjectLocationType, IconName> = {
  'local-storage': 'database',
  directory: 'folder',
  git: 'folder-git',
};

/** Rounded tile that tells the kind of project at a glance: browser, folder or Git. */
@Component({
  selector: 'sapia-project-icon',
  imports: [Icon],
  template: `<sapia-icon [name]="icon()" [size]="iconSize()" [stroke]="1.9" />`,
  host: {
    '[attr.data-type]': 'type()',
    '[class.default]': 'isDefault()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.border-radius.px]': 'size() * 0.3',
  },
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      color: var(--tile-fg);
      background: linear-gradient(140deg, var(--tile-a), var(--tile-b));
      box-shadow: inset 0 0 0 1px var(--tile-ring);
      --tile-fg: light-dark(#4a3ad6, #b3a9ff);
      --tile-a: light-dark(#efedff, #262252);
      --tile-b: light-dark(#e3e9ff, #1b2547);
      --tile-ring: light-dark(rgba(91, 75, 234, 0.16), rgba(157, 145, 255, 0.2));
    }
    :host([data-type='directory']) {
      --tile-fg: light-dark(#a35d00, #ffc46b);
      --tile-a: light-dark(#fff4e0, #3a2a12);
      --tile-b: light-dark(#ffe9c7, #2c2214);
      --tile-ring: light-dark(rgba(201, 126, 18, 0.2), rgba(255, 196, 107, 0.18));
    }
    :host([data-type='git']) {
      --tile-fg: light-dark(#c2410c, #ff9a6b);
      --tile-a: light-dark(#ffece4, #3d1d16);
      --tile-b: light-dark(#ffe0e6, #361a26);
      --tile-ring: light-dark(rgba(194, 65, 12, 0.18), rgba(255, 154, 107, 0.18));
    }
    :host(.default) {
      --tile-fg: #fff;
      --tile-a: #8b7cf6;
      --tile-b: #4fb5d8;
      --tile-ring: transparent;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectIcon {
  readonly type = input.required<ProjectLocationType>();
  readonly isDefault = input(false);
  readonly size = input(32);

  protected readonly icon = computed<IconName>(() => (this.isDefault() ? 'layers' : ICONS[this.type()]));
  protected readonly iconSize = computed(() => Math.round(this.size() * 0.5));
}
