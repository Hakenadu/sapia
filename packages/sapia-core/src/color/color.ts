/**
 * Small colour toolkit used to keep diagrams readable when the UI switches
 * between light and dark mode: parsing, perceptual lightness (OKLab), WCAG
 * contrast and the rules that adapt explicit diagram colours.
 */

export interface Rgba {
  /** 0–255 */
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  l: number;
  c: number;
  /** Hue in degrees. */
  h: number;
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

/**
 * Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (comma or
 * space syntax) and `transparent`. Returns null for anything else, including
 * `none`, `currentColor` and gradients – callers leave those untouched.
 */
export function parseColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    const hex = m[1];
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a = 'f'] = hex.split('');
      return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16), a: parseInt(a + a, 16) / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const channel = (s: string) => (s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s));
    const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: clamp(channel(m[1]), 0, 255), g: clamp(channel(m[2]), 0, 255), b: clamp(channel(m[3]), 0, 255), a: clamp(alpha) };
  }
  return null;
}

export function formatColor({ r, g, b, a }: Rgba): string {
  const hex = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}${a < 1 ? hex(a * 255) : ''}`;
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG relative luminance. */
export function luminance(c: Rgba): number {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** WCAG contrast ratio between two opaque colours (1–21). */
export function contrast(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composites a translucent colour over an opaque background. */
export function over(top: Rgba, below: Rgba): Rgba {
  const a = top.a;
  return { r: top.r * a + below.r * (1 - a), g: top.g * a + below.g * (1 - a), b: top.b * a + below.b * (1 - a), a: 1 };
}

export function toOklch(c: Rgba): Oklch {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

export function fromOklch({ l, c, h }: Oklch, alpha = 1): Rgba {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return { r: clamp(fromLinear(r), 0, 255), g: clamp(fromLinear(g), 0, 255), b: clamp(fromLinear(b), 0, 255), a: alpha };
}

/** Perceptual lightness above which a fill counts as "light". */
export const LIGHT_FILL = 0.62;
/** Perceptual lightness below which a line or text colour counts as "dark". */
export const DARK_INK = 0.42;

/**
 * Dark-mode counterpart of a light fill: same hue, a little less chroma,
 * lightness mirrored into the dark range (white → near-black surface,
 * light green → deep green). Mid and dark fills are returned unchanged.
 */
export function darkFill(color: Rgba): Rgba {
  const o = toOklch(color);
  if (o.l <= LIGHT_FILL) return color;
  const t = (o.l - LIGHT_FILL) / (1 - LIGHT_FILL); // 0 at the threshold, 1 for white
  const l = 0.4 - t * 0.17; // 0.40 … 0.23
  return fromOklch({ l, c: Math.min(o.c * 0.55, 0.065), h: o.h }, color.a);
}

/** Dark-mode counterpart of a dark line colour: same hue, lifted into the light range. */
export function lightInk(color: Rgba): Rgba {
  const o = toOklch(color);
  if (o.l >= DARK_INK) return color;
  return fromOklch({ l: 0.86 - o.l * 0.3, c: Math.min(o.c, 0.1), h: o.h }, color.a);
}

/**
 * Text colour that is readable on `background`. Keeps `text` when it already
 * reaches `minContrast`; otherwise moves its lightness towards black or white
 * (keeping the hue) until it reaches `target` (default: AAA, 7:1), falling
 * back to whichever of near-black and near-white contrasts more.
 */
export function readableOn(text: Rgba, background: Rgba, minContrast = 4.5, target = 7): Rgba {
  if (contrast(text, background) >= minContrast) return text;
  const o = toOklch(text);
  const ink = { r: 21, g: 24, b: 33, a: 1 };
  const paper = { r: 241, g: 243, b: 250, a: 1 };
  const towardsDark = contrast(ink, background) >= contrast(paper, background);
  const fallback = () => {
    const end = towardsDark ? ink : paper;
    if (contrast(end, background) >= minContrast) return end;
    return towardsDark ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  };
  // Neutral text (default black or white) simply flips to the other end.
  if (o.c < 0.03) return fallback();
  for (let step = 1; step <= 20; step++) {
    const l = towardsDark ? o.l * (1 - step / 20) : o.l + (1 - o.l) * (step / 20);
    const candidate = fromOklch({ l, c: o.c * (1 - step / 25), h: o.h }, 1);
    if (contrast(candidate, background) >= target) return candidate;
  }
  return fallback();
}
