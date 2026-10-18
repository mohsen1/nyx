// Color parsing, conversion and perceptual helpers.
// All math happens in OKLab/OKLCH so that lightness remapping keeps hues intact.

export interface RGBA {
  r: number; // 0..255
  g: number;
  b: number;
  a: number; // 0..1
}

export interface OKLab {
  L: number; // 0..1
  a: number;
  b: number;
  alpha: number;
}

export interface OKLCH {
  L: number;
  C: number;
  h: number; // degrees
  alpha: number;
}

const NAMED: Record<string, number> = {
  aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4,
  azure: 0xf0ffff, beige: 0xf5f5dc, bisque: 0xffe4c4, black: 0x000000,
  blanchedalmond: 0xffebcd, blue: 0x0000ff, blueviolet: 0x8a2be2, brown: 0xa52a2a,
  burlywood: 0xdeb887, cadetblue: 0x5f9ea0, chartreuse: 0x7fff00, chocolate: 0xd2691e,
  coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc, crimson: 0xdc143c,
  cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9, darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b, darkolivegreen: 0x556b2f, darkorange: 0xff8c00, darkorchid: 0x9932cc,
  darkred: 0x8b0000, darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f, darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f, darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1, darkviolet: 0x9400d3,
  deeppink: 0xff1493, deepskyblue: 0x00bfff, dimgray: 0x696969, dimgrey: 0x696969,
  dodgerblue: 0x1e90ff, firebrick: 0xb22222, floralwhite: 0xfffaf0, forestgreen: 0x228b22,
  fuchsia: 0xff00ff, gainsboro: 0xdcdcdc, ghostwhite: 0xf8f8ff, gold: 0xffd700,
  goldenrod: 0xdaa520, gray: 0x808080, green: 0x008000, greenyellow: 0xadff2f,
  grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4, indianred: 0xcd5c5c,
  indigo: 0x4b0082, ivory: 0xfffff0, khaki: 0xf0e68c, lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5, lawngreen: 0x7cfc00, lemonchiffon: 0xfffacd, lightblue: 0xadd8e6,
  lightcoral: 0xf08080, lightcyan: 0xe0ffff, lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90, lightgrey: 0xd3d3d3, lightpink: 0xffb6c1, lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa, lightslategray: 0x778899, lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0, lime: 0x00ff00, limegreen: 0x32cd32,
  linen: 0xfaf0e6, magenta: 0xff00ff, maroon: 0x800000, mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd, mediumorchid: 0xba55d3, mediumpurple: 0x9370db, mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee, mediumspringgreen: 0x00fa9a, mediumturquoise: 0x48d1cc, mediumvioletred: 0xc71585,
  midnightblue: 0x191970, mintcream: 0xf5fffa, mistyrose: 0xffe4e1, moccasin: 0xffe4b5,
  navajowhite: 0xffdead, navy: 0x000080, oldlace: 0xfdf5e6, olive: 0x808000,
  olivedrab: 0x6b8e23, orange: 0xffa500, orangered: 0xff4500, orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa, palegreen: 0x98fb98, paleturquoise: 0xafeeee, palevioletred: 0xdb7093,
  papayawhip: 0xffefd5, peachpuff: 0xffdab9, peru: 0xcd853f, pink: 0xffc0cb,
  plum: 0xdda0dd, powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399,
  red: 0xff0000, rosybrown: 0xbc8f8f, royalblue: 0x4169e1, saddlebrown: 0x8b4513,
  salmon: 0xfa8072, sandybrown: 0xf4a460, seagreen: 0x2e8b57, seashell: 0xfff5ee,
  sienna: 0xa0522d, silver: 0xc0c0c0, skyblue: 0x87ceeb, slateblue: 0x6a5acd,
  slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa, springgreen: 0x00ff7f,
  steelblue: 0x4682b4, tan: 0xd2b48c, teal: 0x008080, thistle: 0xd8bfd8,
  tomato: 0xff6347, turquoise: 0x40e0d0, violet: 0xee82ee, wheat: 0xf5deb3,
  white: 0xffffff, whitesmoke: 0xf5f5f5, yellow: 0xffff00, yellowgreen: 0x9acd32,
};

// CSS system colors, resolved to their light-scheme defaults (what a page that
// has not opted into dark mode renders with).
const SYSTEM: Record<string, number> = {
  canvas: 0xffffff, canvastext: 0x000000, linktext: 0x0000ee, visitedtext: 0x551a8b,
  activetext: 0xff0000, buttonface: 0xefefef, buttontext: 0x000000, buttonborder: 0x767676,
  field: 0xffffff, fieldtext: 0x000000, highlight: 0xb5d5ff, highlighttext: 0x000000,
  selecteditem: 0x0060df, selecteditemtext: 0xffffff, mark: 0xffff00, marktext: 0x000000,
  graytext: 0x808080, accentcolor: 0x0060df, accentcolortext: 0xffffff,
  window: 0xffffff, windowtext: 0x000000,
};

export const NAMED_COLOR_NAMES: readonly string[] = [...Object.keys(NAMED), ...Object.keys(SYSTEM), 'transparent'];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function fromInt(n: number, a = 1): RGBA {
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

function parseNumberOrPercent(token: string, scaleFor100: number): number {
  token = token.trim();
  if (token === 'none') return 0;
  if (token.endsWith('%')) return (parseFloat(token) / 100) * scaleFor100;
  return parseFloat(token);
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  token = token.trim();
  if (token === 'none') return 0;
  const v = token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token);
  return Number.isFinite(v) ? clamp(v, 0, 1) : 1;
}

function parseHue(token: string): number {
  token = token.trim();
  if (token === 'none') return 0;
  const v = parseFloat(token);
  if (token.endsWith('turn')) return v * 360;
  if (token.endsWith('grad')) return v * 0.9;
  if (token.endsWith('rad')) return (v * 180) / Math.PI;
  return v;
}

/** Splits the inside of a functional color notation into channel tokens and alpha. */
function splitArgs(inner: string): { channels: string[]; alpha?: string } {
  inner = inner.trim();
  let alpha: string | undefined;
  let body = inner;
  const slash = inner.indexOf('/');
  if (slash >= 0) {
    alpha = inner.slice(slash + 1).trim();
    body = inner.slice(0, slash);
  }
  const channels = body.includes(',')
    ? body.split(',').map((s) => s.trim()).filter(Boolean)
    : body.split(/\s+/).filter(Boolean);
  if (alpha === undefined && channels.length === 4) alpha = channels.pop();
  return { channels, alpha };
}

export function parseColor(input: string): RGBA | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s[0] === '#') return parseHex(s.slice(1));
  if (s in NAMED) return fromInt(NAMED[s]);
  if (s in SYSTEM) return fromInt(SYSTEM[s]);
  const m = /^(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\((.*)\)$/s.exec(s);
  if (!m) return null;
  const fn = m[1];
  const inner = m[2];
  if (inner.includes('var(') || inner.includes('calc(') || inner.includes(' from ')) return null;
  const { channels, alpha } = splitArgs(inner);
  const a = parseAlpha(alpha);
  if (fn === 'rgb' || fn === 'rgba') {
    if (channels.length < 3) return null;
    const [r, g, b] = channels.map((c) => parseNumberOrPercent(c, 255));
    if (![r, g, b].every(Number.isFinite)) return null;
    return { r: clamp(Math.round(r), 0, 255), g: clamp(Math.round(g), 0, 255), b: clamp(Math.round(b), 0, 255), a };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    if (channels.length < 3) return null;
    const h = parseHue(channels[0]);
    const sat = parseFloat(channels[1]) / 100;
    const l = parseFloat(channels[2]) / 100;
    if (![h, sat, l].every(Number.isFinite)) return null;
    return { ...hslToRgb(h, clamp(sat, 0, 1), clamp(l, 0, 1)), a };
  }
  if (fn === 'hwb') {
    if (channels.length < 3) return null;
    const h = parseHue(channels[0]);
    const w = clamp(parseFloat(channels[1]) / 100, 0, 1);
    const bl = clamp(parseFloat(channels[2]) / 100, 0, 1);
    if (![h, w, bl].every(Number.isFinite)) return null;
    if (w + bl >= 1) {
      const gray = Math.round((w / (w + bl)) * 255);
      return { r: gray, g: gray, b: gray, a };
    }
    const base = hslToRgb(h, 1, 0.5);
    const f = (c: number) => Math.round((c / 255) * (1 - w - bl) * 255 + w * 255);
    return { r: f(base.r), g: f(base.g), b: f(base.b), a };
  }
  if (fn === 'oklch' || fn === 'oklab') {
    if (channels.length < 3) return null;
    const L = parseNumberOrPercent(channels[0], 1);
    if (fn === 'oklab') {
      const A = parseNumberOrPercent(channels[1], 0.4);
      const B = parseNumberOrPercent(channels[2], 0.4);
      return oklabToRgba({ L, a: A, b: B, alpha: a });
    }
    const C = parseNumberOrPercent(channels[1], 0.4);
    const h = parseHue(channels[2]);
    return oklabToRgba(oklchToOklab({ L, C, h, alpha: a }));
  }
  if (fn === 'lab' || fn === 'lch') {
    if (channels.length < 3) return null;
    const L = parseNumberOrPercent(channels[0], 100);
    let A: number, B: number;
    if (fn === 'lab') {
      A = parseNumberOrPercent(channels[1], 125);
      B = parseNumberOrPercent(channels[2], 125);
    } else {
      const C = parseNumberOrPercent(channels[1], 150);
      const h = (parseHue(channels[2]) * Math.PI) / 180;
      A = C * Math.cos(h);
      B = C * Math.sin(h);
    }
    if (![L, A, B].every(Number.isFinite)) return null;
    return { ...linearToSrgb(mul(D65_TO_SRGB, mul(D50_TO_D65, labToXyzD50(L, A, B)))), a };
  }
  if (fn === 'color') {
    if (channels.length < 4) return null;
    const space = channels[0];
    const v = channels.slice(1, 4).map((c) => parseNumberOrPercent(c, 1));
    if (!v.every(Number.isFinite)) return null;
    if (space === 'srgb') return { r: clamp(Math.round(v[0] * 255), 0, 255), g: clamp(Math.round(v[1] * 255), 0, 255), b: clamp(Math.round(v[2] * 255), 0, 255), a };
    if (space === 'srgb-linear') return { ...linearToSrgb(v), a };
    if (space === 'display-p3') return { ...linearToSrgb(mul(D65_TO_SRGB, mul(P3_TO_D65, v.map(srgbToLinear)))), a };
    return null;
  }
  return null; // lab()/lch(): uncommon in the wild, leave as-is
}

function parseHex(h: string): RGBA | null {
  if (!/^[0-9a-f]+$/.test(h)) return null;
  if (h.length === 3 || h.length === 4) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
    return { r, g, b, a };
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

type Mat = number[][];
const mul = (m: Mat, v: number[]) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const D50_TO_D65: Mat = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];
const D65_TO_SRGB: Mat = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const P3_TO_D65: Mat = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];

/** CIE Lab (D50) to XYZ (D50). */
function labToXyzD50(L: number, a: number, b: number): number[] {
  const k = 24389 / 27, e = 216 / 24389;
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const x = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const y = L > k * e ? fy ** 3 : L / k;
  const z = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  return [x * 0.9642956764295677, y, z * 0.8251046025104602];
}

const srgbToLinear = (c: number) => (Math.abs(c) <= 0.04045 ? c / 12.92 : Math.sign(c) * ((Math.abs(c) + 0.055) / 1.055) ** 2.4);

function linearToSrgb(v: number[]): { r: number; g: number; b: number } {
  const [r, g, b] = v.map((c) => {
    const x = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return clamp(Math.round(x * 255), 0, 255);
  });
  return { r, g, b };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

const toLinear = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const fromLinear = (c: number) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clamp(Math.round(v * 255), 0, 255);
};

export function rgbaToOklab({ r, g, b, a }: RGBA): OKLab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: a,
  };
}

export function oklabToRgba({ L, a, b, alpha }: OKLab): RGBA {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  };
}

export function oklabToOklch({ L, a, b, alpha }: OKLab): OKLCH {
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h, alpha };
}

export function oklchToOklab({ L, C, h, alpha }: OKLCH): OKLab {
  const rad = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad), alpha };
}

/** Converts an OKLCH color to sRGB, reducing chroma until it fits the gamut. */
export function oklchToRgbaInGamut(c: OKLCH): RGBA {
  let lo = 0, hi = c.C;
  const inGamut = (C: number) => {
    const lab = oklchToOklab({ ...c, C });
    const L = lab.L, A = lab.a, B = lab.b;
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    const e = 0.0005;
    return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e;
  };
  if (inGamut(hi)) return oklabToRgba(oklchToOklab(c));
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(mid)) lo = mid; else hi = mid;
  }
  return oklabToRgba(oklchToOklab({ ...c, C: lo }));
}

export function relativeLuminance({ r, g, b }: RGBA): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(x: RGBA, y: RGBA): number {
  const l1 = relativeLuminance(x), l2 = relativeLuminance(y);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Alpha-composites `top` over an opaque `bottom`. */
export function composite(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a;
  return {
    r: Math.round(top.r * a + bottom.r * (1 - a)),
    g: Math.round(top.g * a + bottom.g * (1 - a)),
    b: Math.round(top.b * a + bottom.b * (1 - a)),
    a: 1,
  };
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

export function toHex({ r, g, b }: RGBA): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

export function formatColor(c: RGBA): string {
  if (c.a >= 1) return toHex(c);
  const a = Math.round(c.a * 1000) / 1000;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

/** Normalizes user-entered hex like "182530", "#FFF" to "#182530"/"#ffffff". */
export function normalizeHex(input: string): string | null {
  const c = parseColor(input.trim().startsWith('#') ? input.trim() : `#${input.trim()}`);
  return c ? toHex(c) : null;
}

export function isDarkColor(c: RGBA): boolean {
  return rgbaToOklab(c).L < 0.6;
}
