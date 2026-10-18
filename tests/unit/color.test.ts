import { describe, expect, it } from 'vitest';
import { contrastRatio, formatColor, normalizeHex, parseColor, rgbaToOklab, oklabToRgba } from '../../extension/src/shared/color';

describe('parseColor', () => {
  it.each([
    ['#fff', { r: 255, g: 255, b: 255, a: 1 }],
    ['#00000080', { r: 0, g: 0, b: 0, a: 128 / 255 }],
    ['rgb(10, 20, 30)', { r: 10, g: 20, b: 30, a: 1 }],
    ['rgba(10,20,30,.5)', { r: 10, g: 20, b: 30, a: 0.5 }],
    ['rgb(10 20 30 / 50%)', { r: 10, g: 20, b: 30, a: 0.5 }],
    ['hsl(0, 100%, 50%)', { r: 255, g: 0, b: 0, a: 1 }],
    ['hsl(120deg 100% 25%)', { r: 0, g: 128, b: 0, a: 1 }],
    ['rebeccapurple', { r: 102, g: 51, b: 153, a: 1 }],
    ['transparent', { r: 0, g: 0, b: 0, a: 0 }],
    ['Canvas', { r: 255, g: 255, b: 255, a: 1 }],
  ])('%s', (input, expected) => {
    const c = parseColor(input)!;
    expect(c.r).toBe(expected.r);
    expect(c.g).toBe(expected.g);
    expect(c.b).toBe(expected.b);
    expect(c.a).toBeCloseTo(expected.a, 3);
  });

  it('rejects values it cannot resolve', () => {
    expect(parseColor('var(--x)')).toBeNull();
    expect(parseColor('rgb(var(--r), 0, 0)')).toBeNull();
    expect(parseColor('currentcolor')).toBeNull();
    expect(parseColor('#ggg')).toBeNull();
  });
});

describe('oklab round trip', () => {
  it.each(['#000000', '#ffffff', '#ff0000', '#1c1c1e', '#3a7bd5'])('%s', (hex) => {
    expect(formatColor(oklabToRgba(rgbaToOklab(parseColor(hex)!)))).toBe(hex);
  });
});

describe('helpers', () => {
  it('normalizes share-link hex values', () => {
    expect(normalizeHex('182530')).toBe('#182530');
    expect(normalizeHex('#DBB745')).toBe('#dbb745');
    expect(normalizeHex('FFF')).toBe('#ffffff');
    expect(normalizeHex('nope')).toBeNull();
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio(parseColor('#000')!, parseColor('#fff')!)).toBeCloseTo(21, 1);
  });

  it('parses lab, lch and color() spaces (Tailwind v4 / design tokens)', () => {
    expect(parseColor('lab(98% 0 0)')).toMatchObject({ r: 249, g: 249, b: 249 });
    expect(parseColor('lab(0 0 0)')).toMatchObject({ r: 0, g: 0, b: 0 });
    const red = parseColor('lch(54.29 106.84 40.85)')!;
    expect(red.r).toBeGreaterThan(240);
    expect(red.g).toBeLessThan(20);
    expect(parseColor('color(display-p3 1 1 1)')).toMatchObject({ r: 255, g: 255, b: 255 });
    expect(parseColor('color(display-p3 0 0 0 / 50%)')).toMatchObject({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseColor('color(srgb-linear 1 1 1)')).toMatchObject({ r: 255, g: 255, b: 255 });
  });
});
