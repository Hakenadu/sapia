import { LIGHT_FILL, contrast, darkFill, formatColor, lightInk, over, parseColor, readableOn, toOklch } from '@sapia/core';
import type { RenderTheme, Rgba } from '@sapia/core';

/**
 * Keeps rendered diagrams readable in the adaptive theme.
 *
 * Renderers give us the Sapia palette for everything the author did not
 * colour, but explicit colours (`#LightGreen`, `#FFAAAA`, `style … fill:…`,
 * `classDef`, `rect rgb(…)`) come through unchanged. In dark mode those light
 * fills would sit under light text, so this pass works on the final DOM,
 * independent of the diagram language:
 *
 * 1. Dark mode: light fills become their dark counterpart (same hue), dark
 *    lines and small marks (arrow heads, dots) are lifted into the light range.
 * 2. Both modes: every text gets checked against the fill actually painted
 *    behind it and is nudged until it reaches WCAG AA contrast (4.5:1).
 *
 * The SVG must be attached to the document (it may be invisible) so that
 * computed styles and geometry are available. Changes are written as inline
 * styles, so exports contain them.
 */
export function adaptDiagramColors(svg: SVGSVGElement, theme: RenderTheme, canvas: string): void {
  const canvasColor = parseColor(canvas) ?? (theme === 'dark' ? { r: 11, g: 13, b: 19, a: 1 } : { r: 251, g: 251, b: 253, a: 1 });
  const dark = theme === 'dark';

  if (dark) {
    const root = parseColor(getComputedStyle(svg).backgroundColor);
    if (root && root.a > 0) svg.style.setProperty('background-color', 'transparent', 'important');
  }

  const bounds = svg.getBoundingClientRect();
  const backgrounds: Painted[] = [];
  for (const el of svg.querySelectorAll<SVGGraphicsElement>(SHAPES)) {
    const style = getComputedStyle(el);
    if (style.display === 'none') continue;
    const rect = el.getBoundingClientRect();
    let fill = parseColor(style.fill);
    const stroke = parseColor(style.stroke);
    const stroked = !!stroke && stroke.a > 0 && style.strokeWidth !== '0px';
    // Arrow heads and dots are drawn in the line colour: they are ink, not surfaces.
    const ink = !!el.closest('marker') || (rect.width <= 14 && rect.height <= 14 && (!stroked || same(fill, stroke)));
    if (fill && fill.a > 0 && dark) {
      // A sheet behind the whole diagram gives way to the canvas in dark mode.
      const sheet = !ink && rect.width >= bounds.width * 0.97 && rect.height >= bounds.height * 0.97;
      const adapted = ink ? lightInk(fill) : sheet ? { ...fill, a: 0 } : darkFill(fill);
      if (adapted !== fill) {
        set(el, 'fill', adapted);
        fill = adapted;
      }
    }
    if (stroked && dark) {
      const adapted = lightInk(stroke!);
      if (adapted !== stroke) set(el, 'stroke', adapted);
    }
    if (fill && fill.a > 0 && !ink && rect.width > 0 && rect.height > 0) {
      backgrounds.push({ el, rect, color: { ...fill, a: fill.a * opacity(style) } });
    }
  }
  backgrounds.push(...markerDots(svg));
  backgrounds.sort((a, b) => (a.el === b.el ? 0 : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  if (dark) {
    // Gradient fills (PlantUML `#Red/Blue`) are defined by their stops.
    for (const stop of svg.querySelectorAll<SVGStopElement>('stop')) {
      const color = parseColor(getComputedStyle(stop).stopColor);
      if (color && isLight(color)) set(stop, 'stop-color', darkFill(color));
    }
    // HTML labels (Mermaid) paint their own backgrounds.
    for (const el of svg.querySelectorAll<HTMLElement>('foreignObject *')) {
      const background = parseColor(getComputedStyle(el).backgroundColor);
      if (background && background.a > 0 && isLight(background)) set(el, 'background-color', darkFill(background));
    }
  }

  const backgroundAt = (el: Element, x: number, y: number): Rgba => {
    let found: Rgba | null = null;
    for (const candidate of backgrounds) {
      if (candidate.el === el || candidate.el.contains(el)) continue;
      // Only shapes painted before the text can be behind it.
      if (!(candidate.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const r = candidate.rect;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        found = found ? over(candidate.color, found) : over(candidate.color, canvasColor);
      }
    }
    return found ?? canvasColor;
  };

  // SVG text: the fill may sit on <text> or on individual <tspan>s.
  for (const el of svg.querySelectorAll<SVGTextContentElement>('text, tspan')) {
    if (!el.textContent?.trim()) continue;
    if (el.tagName.toLowerCase() === 'text' && el.querySelector('tspan') && !hasOwnText(el)) continue;
    const color = parseColor(getComputedStyle(el).fill);
    if (!color || color.a === 0) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width) continue;
    const background = backgroundAt(el, rect.left + rect.width / 2, rect.top + rect.height / 2);
    const text = over(color, background);
    if (contrast(text, background) < 4.5) set(el, 'fill', readableOn(text, background));
  }

  // HTML text inside foreignObject.
  for (const el of svg.querySelectorAll<HTMLElement>('foreignObject *')) {
    if (!hasOwnText(el)) continue;
    const style = getComputedStyle(el);
    const color = parseColor(style.color);
    if (!color || color.a === 0) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width) continue;
    const background = htmlBackground(el) ?? backgroundAt(el, rect.left + rect.width / 2, rect.top + rect.height / 2);
    const text = over(color, background);
    if (contrast(text, background) < 4.5) set(el, 'color', readableOn(text, background));
  }
}

interface Painted {
  el: Element;
  rect: DOMRect;
  color: Rgba;
}

const SHAPES = 'rect, path, polygon, polyline, ellipse, circle, line';

const isLight = (c: Rgba) => toOklch(c).l > LIGHT_FILL;

const same = (a: Rgba | null, b: Rgba | null) => !!a && !!b && formatColor(a) === formatColor(b);

function opacity(style: CSSStyleDeclaration): number {
  const value = parseFloat(style.fillOpacity || '1') * parseFloat(style.opacity || '1');
  return Number.isFinite(value) ? value : 1;
}

/**
 * Filled circles drawn as line markers (Mermaid's autonumber badges, dots at
 * line ends) carry text on top, so they count as backgrounds at the line ends.
 */
function markerDots(svg: SVGSVGElement): Painted[] {
  const dots: Painted[] = [];
  for (const el of svg.querySelectorAll<SVGGeometryElement>('line, path, polyline')) {
    const style = getComputedStyle(el);
    const ends: [string, () => DOMPoint][] = [
      [style.markerStart, () => el.getPointAtLength(0)],
      [style.markerEnd, () => el.getPointAtLength(el.getTotalLength())],
    ];
    for (const [reference, point] of ends) {
      const id = /url\(\s*["']?#([^"')]+)["']?\s*\)/.exec(reference ?? '')?.[1];
      if (!id) continue;
      const marker = svg.querySelector<SVGMarkerElement>(`marker#${CSS.escape(id)}`);
      const circle = marker?.querySelector<SVGCircleElement>('circle');
      if (!marker || !circle) continue;
      const color = parseColor(getComputedStyle(circle).fill);
      const ctm = el.getScreenCTM();
      if (!color || color.a === 0 || !ctm) continue;
      const scale = Math.hypot(ctm.a, ctm.b) * (marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : parseFloat(style.strokeWidth) || 1);
      const radius = circle.r.baseVal.value * scale;
      if (radius < 5) continue;
      const centre = point().matrixTransform(ctm);
      dots.push({ el, rect: new DOMRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2), color });
    }
  }
  return dots;
}

function set(el: Element, property: string, color: Rgba): void {
  (el as HTMLElement | SVGElement).style.setProperty(property, formatColor(color), 'important');
}

function hasOwnText(el: Element): boolean {
  for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  return false;
}

/** The first opaque-enough background on the element or its HTML ancestors. */
function htmlBackground(el: HTMLElement): Rgba | null {
  let current: Element | null = el;
  while (current && current.namespaceURI === 'http://www.w3.org/1999/xhtml') {
    const color = parseColor(getComputedStyle(current).backgroundColor);
    if (color && color.a > 0.5) return { ...color, a: 1 };
    current = current.parentElement;
  }
  return null;
}
