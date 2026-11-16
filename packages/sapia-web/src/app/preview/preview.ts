import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import type { OnDestroy } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { RenderedElement, TextRange } from '@sapia/core';
import { I18nService } from '../core/i18n.service';
import type { PreviewState } from '../core/workspace.service';
import { Icon } from '../ui/icon';

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const PADDING = 48;

/** Removes anything executable from renderer output before it enters the DOM. */
function sanitize(root: Element): void {
  root.querySelectorAll('script, iframe, object, embed').forEach((el) => el.remove());
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'xlink:href') && /^\s*(javascript|data|vbscript):/i.test(attr.value)) el.removeAttribute(attr.name);
    }
  });
}

function describe(el: Element): RenderedElement {
  const attributes: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (attr.name === 'name' || attr.name === 'title' || attr.name.startsWith('data-')) attributes[attr.name] = attr.value;
  }
  const title = el.querySelector(':scope > title')?.textContent?.trim();
  if (title && !attributes['title']) attributes['title'] = title;
  const text = el.textContent?.replace(/\s+/g, ' ').trim();
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: [...el.classList],
    attributes,
    text: text && text.length <= 200 ? text : undefined,
  };
}

/** The rendered diagram with pan, zoom and click-to-source. */
@Component({
  selector: 'sapia-preview',
  imports: [Icon, MatTooltipModule, MatMenuModule],
  templateUrl: './preview.html',
  styleUrl: './preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Preview implements OnDestroy {
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly svg = input<string | null>(null);
  readonly state = input<PreviewState>('empty');
  readonly stale = input(false);
  readonly failure = input<string | null>(null);
  readonly errorMessage = input<string | null>(null);
  readonly fileName = input('diagram');
  /** Resolves an element path to a source range (without navigating). */
  readonly resolve = input<(path: RenderedElement[]) => TextRange | null>(() => null);

  readonly locate = output<RenderedElement[]>();
  readonly exported = output<'svg' | 'png' | 'copy'>();

  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');

  protected readonly scale = signal(1);
  private readonly x = signal(0);
  private readonly y = signal(0);
  protected readonly transform = computed(() => `translate(${this.x()}px, ${this.y()}px) scale(${this.scale()})`);
  protected readonly gridPosition = computed(() => `${this.x()}px ${this.y()}px`);
  protected readonly gridSize = computed(() => {
    const size = 22 * this.scale();
    const visible = size < 9 ? size * 4 : size;
    return `${visible}px ${visible}px`;
  });
  protected readonly percent = computed(() => `${Math.round(this.scale() * 100)}%`);
  protected readonly panning = signal(false);
  protected readonly hasDiagram = computed(() => !!this.svg());

  /** While true the diagram is re-fitted after every render and resize. */
  private autoFit = true;
  private natural = { width: 0, height: 0 };
  private hovered: Element | null = null;
  private locatable = new WeakMap<Element, boolean>();
  private readonly resizeObserver: ResizeObserver;
  private drag: { startX: number; startY: number; originX: number; originY: number; moved: boolean; pointerId: number } | null = null;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.autoFit) this.fit(false);
    });
    this.resizeObserver.observe(host.nativeElement);

    effect(() => {
      const svg = this.svg();
      const stage = this.stage().nativeElement;
      untracked(() => {
        this.hovered = null;
        this.locatable = new WeakMap();
        if (!svg) {
          stage.replaceChildren();
          this.natural = { width: 0, height: 0 };
          return;
        }
        const container = document.createElement('div');
        container.innerHTML = svg;
        sanitize(container);
        const element = container.querySelector('svg');
        if (!element) {
          stage.replaceChildren();
          return;
        }
        const previous = this.natural;
        this.natural = this.measure(element);
        element.style.width = `${this.natural.width}px`;
        element.style.height = `${this.natural.height}px`;
        element.style.maxWidth = 'none';
        element.style.display = 'block';
        element.removeAttribute('width');
        element.removeAttribute('height');
        stage.replaceChildren(element);
        if (this.autoFit || previous.width === 0) this.fit(false);
      });
    });
  }

  private measure(svg: SVGSVGElement): { width: number; height: number } {
    const viewBox = svg.viewBox?.baseVal;
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) return { width: viewBox.width, height: viewBox.height };
    const width = parseFloat(svg.getAttribute('width') ?? '');
    const height = parseFloat(svg.getAttribute('height') ?? '');
    if (width > 0 && height > 0) return { width, height };
    return { width: 800, height: 600 };
  }

  // -- zoom and pan ----------------------------------------------------------
  protected fit(animate = true): void {
    const viewport = this.viewport().nativeElement;
    const { width, height } = this.natural;
    if (!width || !height || !viewport.clientWidth) return;
    const scale = Math.max(
      MIN_SCALE,
      Math.min((viewport.clientWidth - PADDING * 2) / width, (viewport.clientHeight - PADDING * 2) / height, 1.4),
    );
    this.autoFit = true;
    this.apply(scale, (viewport.clientWidth - width * scale) / 2, (viewport.clientHeight - height * scale) / 2, animate);
  }

  protected zoomBy(factor: number): void {
    const viewport = this.viewport().nativeElement;
    this.zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, this.scale() * factor, true);
  }

  protected resetZoom(): void {
    const viewport = this.viewport().nativeElement;
    this.zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1, true);
  }

  private zoomAt(cx: number, cy: number, target: number, animate = false): void {
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, target));
    const ratio = scale / this.scale();
    this.autoFit = false;
    this.apply(scale, cx - (cx - this.x()) * ratio, cy - (cy - this.y()) * ratio, animate);
  }

  private apply(scale: number, x: number, y: number, animate: boolean): void {
    const stage = this.stage().nativeElement;
    stage.style.transition = animate ? 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    this.scale.set(scale);
    this.x.set(x);
    this.y.set(y);
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.hasDiagram()) return;
    event.preventDefault();
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey) {
      // Pinch gestures arrive as ctrl+wheel with small deltas.
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0022) * (Math.abs(event.deltaY) < 50 ? 4 : 1));
      this.zoomAt(event.clientX - rect.left, event.clientY - rect.top, this.scale() * factor);
    } else {
      this.autoFit = false;
      this.apply(this.scale(), this.x() - event.deltaX, this.y() - event.deltaY, false);
    }
  }

  /** Active touch / pen / mouse pointers, for pinch zoom with two fingers. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { distance: number; midX: number; midY: number; scale: number; x: number; y: number } | null = null;

  private pinchState(): { distance: number; midX: number; midY: number } {
    const [a, b] = [...this.pointers.values()];
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), midX: (a.x + b.x) / 2 - rect.left, midY: (a.y + b.y) / 2 - rect.top };
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.hasDiagram()) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      // A second finger turns the gesture into a pinch; it never counts as a tap.
      const viewport = this.viewport().nativeElement;
      for (const id of this.pointers.keys()) if (!viewport.hasPointerCapture(id)) viewport.setPointerCapture(id);
      this.drag = null;
      this.pinch = { ...this.pinchState(), scale: this.scale(), x: this.x(), y: this.y() };
      this.panning.set(true);
      this.setHovered(null);
      return;
    }
    if (this.pointers.size > 2) return;
    this.drag = { startX: event.clientX, startY: event.clientY, originX: this.x(), originY: this.y(), moved: false, pointerId: event.pointerId };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = this.pinch;
    if (pinch && this.pointers.size >= 2) {
      const now = this.pinchState();
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinch.scale * (now.distance / pinch.distance)));
      const ratio = scale / pinch.scale;
      // Keep the point under the fingers' midpoint in place while zooming and moving.
      this.autoFit = false;
      this.apply(scale, now.midX - (pinch.midX - pinch.x) * ratio, now.midY - (pinch.midY - pinch.y) * ratio, false);
      return;
    }
    const drag = this.drag;
    if (drag) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      // Fingers wobble more than a mouse: allow more slack before a tap becomes a pan.
      const slop = event.pointerType === 'mouse' ? 4 : 10;
      if (!drag.moved && Math.hypot(dx, dy) > slop) {
        drag.moved = true;
        this.panning.set(true);
        this.viewport().nativeElement.setPointerCapture(drag.pointerId);
        this.setHovered(null);
      }
      if (drag.moved) {
        this.autoFit = false;
        this.apply(this.scale(), drag.originX + dx, drag.originY + dy, false);
      }
      return;
    }
    if (event.pointerType === 'mouse') this.setHovered(this.findLocatable(event.target));
  }

  protected onPointerUp(event: PointerEvent): void {
    const viewport = this.viewport().nativeElement;
    this.pointers.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) this.panning.set(false);
      // Lifting one finger after a pinch must not start a pan from a stale origin.
      this.drag = null;
      return;
    }
    const drag = this.drag;
    this.drag = null;
    this.panning.set(false);
    if (!drag || drag.pointerId !== event.pointerId || event.type === 'pointercancel') return;
    if (drag.moved) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const path = this.pathOf(target);
    if (path.length) {
      // On touch there is no hover; flash the tapped element instead.
      if (event.pointerType !== 'mouse') this.flash(this.findLocatable(target));
      this.locate.emit(path);
    }
  }

  private flash(element: Element | null): void {
    if (!element) return;
    this.setHovered(element);
    setTimeout(() => {
      if (this.hovered === element) this.setHovered(null);
    }, 650);
  }

  protected onPointerLeave(): void {
    if (!this.drag) this.setHovered(null);
  }

  protected onDoubleClick(event: MouseEvent): void {
    if (this.findLocatable(event.target)) return;
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    this.zoomAt(event.clientX - rect.left, event.clientY - rect.top, this.scale() * (event.shiftKey ? 0.6 : 1.6), true);
  }

  // -- click to source ---------------------------------------------------------
  private pathOf(target: EventTarget | null): RenderedElement[] {
    const stage = this.stage().nativeElement;
    const path: RenderedElement[] = [];
    let el = target instanceof Element ? target : null;
    if (!el || !stage.contains(el)) return path;
    while (el && el !== stage) {
      path.push(describe(el));
      el = el.parentElement;
    }
    return path;
  }

  /** The element to highlight for a pointer target, if it maps to source. */
  private findLocatable(target: EventTarget | null): Element | null {
    const stage = this.stage().nativeElement;
    let el = target instanceof Element ? target : null;
    if (!el || !stage.contains(el) || el instanceof SVGSVGElement) return null;
    const cached = this.locatable.get(el);
    const resolvable = cached ?? this.resolve()(this.pathOf(el)) !== null;
    if (cached === undefined) this.locatable.set(el, resolvable);
    if (!resolvable) return null;
    // Highlight the closest group that looks like a diagram element.
    let group: Element | null = el;
    for (let depth = 0; group && group !== stage && depth < 6; depth++, group = group.parentElement) {
      if (group.tagName.toLowerCase() === 'g' && (group.id || group.hasAttribute('data-source-line') || group.classList.length > 0)) {
        if (group.parentElement instanceof SVGSVGElement && group.children.length > 12) break;
        return group;
      }
    }
    return el;
  }

  private setHovered(el: Element | null): void {
    if (this.hovered === el) return;
    this.hovered?.classList.remove('sapia-hover');
    this.hovered = el;
    el?.classList.add('sapia-hover');
    this.viewport().nativeElement.classList.toggle('can-locate', !!el);
  }

  // -- export ---------------------------------------------------------------
  private exportableSvg(): { markup: string; width: number; height: number } | null {
    const svg = this.stage().nativeElement.querySelector('svg');
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('.sapia-hover').forEach((el) => el.classList.remove('sapia-hover'));
    clone.removeAttribute('style');
    clone.setAttribute('width', String(this.natural.width));
    clone.setAttribute('height', String(this.natural.height));
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return { markup: new XMLSerializer().serializeToString(clone), ...this.natural };
  }

  private download(blob: Blob, extension: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.fileName().replace(/[^\w\- .()äöüÄÖÜß]+/g, '_') || 'diagram'}.${extension}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  protected exportSvg(): void {
    const svg = this.exportableSvg();
    if (!svg) return;
    this.download(new Blob([svg.markup], { type: 'image/svg+xml' }), 'svg');
    this.exported.emit('svg');
  }

  protected async copySvg(): Promise<void> {
    const svg = this.exportableSvg();
    if (!svg) return;
    await navigator.clipboard.writeText(svg.markup);
    this.exported.emit('copy');
  }

  protected exportPng(): void {
    const svg = this.exportableSvg();
    if (!svg) return;
    const ratio = 2;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(svg.width * ratio);
      canvas.height = Math.ceil(svg.height * ratio);
      const context = canvas.getContext('2d')!;
      context.fillStyle = getComputedStyle(this.viewport().nativeElement).getPropertyValue('--canvas-bg').trim() || '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) this.download(blob, 'png');
        this.exported.emit('png');
      }, 'image/png');
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.markup)}`;
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
  }
}
