import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUp,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Contrast,
  Copy,
  CornerDownLeft,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FileImage,
  FilePlus2,
  FolderOpen,
  Globe,
  Info,
  KeyRound,
  Languages,
  Link,
  LibraryBig,
  LoaderCircle,
  Maximize,
  Monitor,
  Moon,
  Palette,
  MousePointerClick,
  PanelLeftClose,
  Pencil,
  Plug,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Wand2,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide';
import type { IconNode } from 'lucide';

const ICONS = {
  alert: AlertTriangle,
  convert: ArrowRightLeft,
  'arrow-up': ArrowUp,
  plugins: Blocks,
  bot: Bot,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  error: CircleAlert,
  'check-circle': CircleCheck,
  'x-circle': CircleX,
  copy: Copy,
  enter: CornerDownLeft,
  download: Download,
  more: Ellipsis,
  eye: Eye,
  'eye-off': EyeOff,
  image: FileImage,
  new: FilePlus2,
  open: FolderOpen,
  globe: Globe,
  info: Info,
  key: KeyRound,
  languages: Languages,
  link: Link,
  library: LibraryBig,
  loader: LoaderCircle,
  fit: Maximize,
  system: Monitor,
  moon: Moon,
  palette: Palette,
  contrast: Contrast,
  click: MousePointerClick,
  'panel-close': PanelLeftClose,
  pencil: Pencil,
  plug: Plug,
  plus: Plus,
  reset: RotateCcw,
  save: Save,
  search: Search,
  settings: Settings2,
  share: Share2,
  sparkles: Sparkles,
  stop: Square,
  sun: Sun,
  trash: Trash2,
  wand: Wand2,
  tool: Wrench,
  close: X,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

const escape = (v: unknown) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Lucide icon rendered as inline SVG. */
@Component({
  selector: 'sapia-icon',
  template: '',
  host: {
    '[innerHTML]': 'svg()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    'aria-hidden': 'true',
  },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(16);
  readonly stroke = input(1.85);

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly svg = computed(() => {
    const children = (ICONS[this.name()] as IconNode)
      .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${escape(v)}"`).join(' ')}/>`)
      .join('');
    const s = this.size();
    // The markup is assembled from the bundled icon set only, never from user input.
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${this.stroke()}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`,
    );
  });
}
