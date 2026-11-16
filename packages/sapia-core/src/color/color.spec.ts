import { describe, expect, it } from 'vitest';
import { contrast, darkFill, formatColor, lightInk, parseColor, readableOn, toOklch } from '../index';

describe('colour toolkit', () => {
  it('parses hex and rgb() notations', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#90EE90')).toEqual({ r: 144, g: 238, b: 144, a: 1 });
    expect(parseColor('#00000080')?.a).toBeCloseTo(0.5, 2);
    expect(parseColor('rgb(191, 223, 255)')).toEqual({ r: 191, g: 223, b: 255, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.25)')?.a).toBe(0.25);
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('transparent')?.a).toBe(0);
    expect(parseColor('none')).toBeNull();
    expect(parseColor('url(#g1)')).toBeNull();
    expect(formatColor({ r: 255, g: 0, b: 16, a: 1 })).toBe('#ff0010');
  });

  it('darkens light fills and keeps their hue', () => {
    const lightGreen = parseColor('#90EE90')!;
    const adapted = darkFill(lightGreen);
    expect(toOklch(adapted).l).toBeLessThan(0.45);
    expect(Math.abs(toOklch(adapted).h - toOklch(lightGreen).h)).toBeLessThan(3);
    // White text is readable on the result.
    expect(contrast(adapted, { r: 255, g: 255, b: 255, a: 1 })).toBeGreaterThan(4.5);
    const navy = parseColor('#000080')!;
    expect(darkFill(navy)).toBe(navy);
  });

  it('lifts dark lines and keeps light ones', () => {
    const black = parseColor('#000')!;
    expect(toOklch(lightInk(black)).l).toBeGreaterThan(0.8);
    const light = parseColor('#d0d4e0')!;
    expect(lightInk(light)).toBe(light);
  });

  it('finds a readable text colour for any background', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    for (const bg of ['#90EE90', '#ADD8E6', '#FFAAAA', '#ffff00', '#000080', '#333333', '#808080']) {
      const background = parseColor(bg)!;
      expect(contrast(readableOn(white, background), background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(readableOn(parseColor('#222')!, background), background)).toBeGreaterThanOrEqual(4.5);
    }
    // Already readable colours are kept.
    expect(readableOn(white, parseColor('#000080')!)).toBe(white);
  });
});
