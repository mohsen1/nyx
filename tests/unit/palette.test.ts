import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, rgbaToOklab, oklabToOklch } from '../../extension/src/shared/color';
import { Palette } from '../../extension/src/shared/palette';
import { BUILT_IN_THEMES } from '../../extension/src/shared/theme';

const lab = (s: string) => rgbaToOklab(parseColor(s)!);
const lch = (s: string) => oklabToOklch(lab(s));

describe('Palette', () => {
  const p = new Palette({ background: '#1c1c1e', text: '#e3e3e6', dynamicColors: true });

  it('turns a white page into the theme background and black text into the theme text', () => {
    expect(p.map('#ffffff', 'background')).toBe('#1c1c1e');
    expect(p.map('#000000', 'text')).toBe('#e3e3e6');
  });

  it('keeps light surfaces ordered (cards stay distinguishable from the page)', () => {
    const page = lab(p.map('#ffffff', 'background')!).L;
    const card = lab(p.map('#f2f2f2', 'background')!).L;
    const panel = lab(p.map('#dddddd', 'background')!).L;
    expect(page).toBeLessThan(card);
    expect(card).toBeLessThan(panel);
  });

  it('keeps accent hues and makes accent text readable', () => {
    for (const link of ['#0645ad', '#1a0dab', '#d93025', '#188038']) {
      const mapped = p.map(link, 'text')!;
      expect(Math.abs(lch(mapped).h - lch(link).h)).toBeLessThan(25);
      expect(contrastRatio(parseColor(mapped)!, parseColor('#1c1c1e')!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps saturated buttons saturated but dark enough for light text', () => {
    const mapped = p.map('#0d6efd', 'background')!;
    expect(lch(mapped).C).toBeGreaterThan(0.08);
    expect(contrastRatio(parseColor(mapped)!, parseColor('#ffffff')!)).toBeGreaterThan(3);
  });

  it('maps everything onto the theme line when dynamic colors are off', () => {
    const flat = new Palette({ background: '#182530', text: '#dbb745', dynamicColors: false });
    const mapped = lch(flat.map('#0645ad', 'text')!);
    expect(Math.abs(mapped.h - lch('#dbb745').h)).toBeLessThan(15);
  });

  it('preserves alpha and leaves transparent alone', () => {
    expect(p.map('rgba(0,0,0,0.5)', 'text')).toMatch(/^rgba\(.*0\.5\)$/);
    expect(p.map('transparent', 'background')).toMatch(/, 0\)$/);
  });

  it('keeps body text readable for every built-in theme', () => {
    for (const t of BUILT_IN_THEMES) {
      const tp = new Palette({ background: t.background, text: t.text, dynamicColors: true });
      const bg = parseColor(tp.map('#ffffff', 'background')!)!;
      const fg = parseColor(tp.map('#222222', 'text')!)!;
      expect(contrastRatio(bg, fg), t.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});
