// Maps a page's original colors onto the active theme.
//
// Neutral colors are placed on the line between the theme's background and text colors,
// so every theme (even a navy/gold one) produces a coherent page. Colorful ("dynamic")
// colors keep their hue and get a lightness that works on the dark background, which is
// what keeps highlights, buttons and links recognizable.

import {
  contrastRatio,
  formatColor,
  oklabToOklch,
  oklabToRgba,
  oklchToRgbaInGamut,
  parseColor,
  rgbaToOklab,
  type OKLab,
  type RGBA,
} from './color';

export type ColorRole = 'background' | 'text' | 'border' | 'shadow';

export interface PaletteOptions {
  background: string;
  text: string;
  dynamicColors: boolean;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Chroma above which a color is treated as an accent rather than a neutral. */
const ACCENT_CHROMA = 0.045;

export class Palette {
  readonly bg: OKLab;
  readonly fg: OKLab;
  readonly bgRgb: RGBA;
  readonly fgRgb: RGBA;
  readonly dynamicColors: boolean;
  private cache = new Map<string, string>();

  constructor(opts: PaletteOptions) {
    this.bgRgb = parseColor(opts.background) ?? { r: 28, g: 28, b: 30, a: 1 };
    this.fgRgb = parseColor(opts.text) ?? { r: 227, g: 227, b: 230, a: 1 };
    this.bg = rgbaToOklab(this.bgRgb);
    this.fg = rgbaToOklab(this.fgRgb);
    this.dynamicColors = opts.dynamicColors;
  }

  /** A point on the theme's background→text line. 0 = background, 1 = text. */
  neutral(t: number, alpha = 1): RGBA {
    const { bg, fg } = this;
    return oklabToRgba({
      L: lerp(bg.L, fg.L, t),
      a: lerp(bg.a, fg.a, t),
      b: lerp(bg.b, fg.b, t),
      alpha,
    });
  }

  /** Where on the background→text line a perceptual lightness falls. */
  private span(): number {
    return Math.max(0.05, this.fg.L - this.bg.L);
  }

  mapRgba(c: RGBA, role: ColorRole): RGBA {
    const lab = rgbaToOklab(c);
    const lch = oklabToOklch(lab);
    const L = lab.L;
    const accent = this.dynamicColors && lch.C > ACCENT_CHROMA;

    switch (role) {
      case 'background': {
        if (!accent) {
          // Light surfaces become the theme background with elevation steps. The curve is steep
          // near white so faint distinctions (cards, pills, zebra rows) survive. Dark surfaces
          // (headers, footers, code blocks) become slightly raised panels.
          const t = L >= 0.5 ? 0.26 * Math.pow((1 - L) / 0.5, 0.6) : 0.07 + L * 0.26;
          const out = rgbaToOklab(this.neutral(clamp(t, 0, 0.3), c.a));
          // Keep a hint of the original tint (bluish pills, pinkish quotes) when dynamic colors are on.
          const tint = this.dynamicColors ? 0.6 : 0;
          return oklabToRgba({ ...out, a: out.a + lab.a * tint, b: out.b + lab.b * tint });
        }
        // Pastel surfaces turn into deep tints; saturated ones (buttons, badges) stay vivid but darker.
        const targetL = L > 0.72 ? this.bg.L + (1 - L) * 0.55 + 0.06 : clamp(Math.min(L, 0.62) * 0.9, this.bg.L + 0.12, 0.6);
        const chroma = L > 0.72 ? Math.min(lch.C * 1.1, 0.07) : lch.C * 0.92;
        return oklchToRgbaInGamut({ L: targetL, C: chroma, h: lch.h, alpha: c.a });
      }
      case 'border': {
        if (!accent) {
          const t = L >= 0.5 ? 0.12 + (1 - L) * 0.45 : 0.42 - L * 0.3;
          return this.neutral(clamp(t, 0.1, 0.5), c.a);
        }
        return oklchToRgbaInGamut({ L: clamp(L > 0.7 ? 1.05 - L : L, this.bg.L + 0.18, 0.62), C: lch.C * 0.85, h: lch.h, alpha: c.a });
      }
      case 'shadow': {
        // Dark shadows stay shadows (darker than the background); light "shadows" are
        // usually rings or outlines and are treated like borders.
        if (L < 0.6) return { ...darken(this.bgRgb, 0.55), a: c.a };
        return this.mapRgba(c, 'border');
      }
      case 'text':
      default: {
        if (!accent) {
          // Dark text becomes theme text; mid grays become dimmer theme text; light text
          // (usually sitting on a colored surface) stays light.
          const t = L <= 0.6 ? 1 - L * 0.42 : 0.72 + (L - 0.6) * 0.7;
          return this.neutral(clamp(t, 0.55, 1), c.a);
        }
        let targetL = L < 0.72 ? 0.72 + (0.72 - L) * 0.25 : L;
        targetL = Math.max(targetL, this.bg.L + this.span() * 0.62);
        let out = oklchToRgbaInGamut({ L: clamp(targetL, 0, 0.96), C: lch.C, h: lch.h, alpha: c.a });
        // Guarantee legible contrast against the theme background.
        for (let i = 0; i < 8 && contrastRatio(out, this.bgRgb) < 4.5; i++) {
          targetL = Math.min(0.97, targetL + 0.04);
          out = oklchToRgbaInGamut({ L: targetL, C: lch.C * 0.9, h: lch.h, alpha: c.a });
        }
        return out;
      }
    }
  }

  /** Maps a CSS color string; returns null when it cannot be parsed (e.g. contains var()). */
  map(value: string, role: ColorRole): string | null {
    const key = `${role}:${value}`; // not role[0]: background and border both start with "b"
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const parsed = parseColor(value);
    if (!parsed) return null;
    const out = formatColor(this.mapRgba(parsed, role));
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(key, out);
    return out;
  }
}

function darken(c: RGBA, f: number): RGBA {
  return { r: Math.round(c.r * f), g: Math.round(c.g * f), b: Math.round(c.b * f), a: c.a };
}

