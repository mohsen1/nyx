// Decides which images to invert or recolor. Dark artwork on a transparent background (logos,
// icons, diagrams) would disappear on a dark page, so it is inverted, or for logos that mix color
// with dark parts, redrawn with only the dark parts lightened. Photos are left alone.

/**
 * invert: dark artwork on transparency, flipped with a CSS filter.
 * recolor: a logo mixing color with dark neutral parts (a colored mark next to a gray
 * wordmark); `url` is a copy with only the dark neutral pixels lightened.
 */
export type ImageVerdict = { kind: 'none' } | { kind: 'invert' } | { kind: 'recolor'; url: string };
export type ImageVerdictHandler = (el: HTMLImageElement, verdict: ImageVerdict) => void;
/** Called for a large pale image that has text on top of it (a hero backdrop). */
export type BackdropHandler = (el: HTMLImageElement) => void;
type Fetcher = (url: string, as: 'text' | 'dataUrl') => Promise<string | null>;

const SAMPLE = 48;
const MAX_NATURAL_AREA = 1200 * 1200;
/** Largest side of a recolored copy; bigger logos are scaled down for the copy. */
const RECOLOR_MAX = 640;
const NONE: ImageVerdict = { kind: 'none' };

export interface PixelStats {
  transparent: number; // share of (mostly) transparent pixels
  dark: number; // share of opaque pixels that are dark
  light: number; // share of opaque pixels that are light
  colorful: number; // share of opaque pixels with noticeable saturation
  darkNeutral: number; // share of opaque pixels that are gray-to-black (not colorful), up to #737373
  deep: number; // share of opaque pixels of any hue with HSL lightness under DEEP_L (navy, #5f6368, black)
}

/** Pixels darker than this (HSL lightness) vanish on a dark page; recoloring flips their lightness. */
const DEEP_L = 0.45;
const hslLightness = (r: number, g: number, b: number) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

/** Pure decision on pixel statistics; exported for tests. */
export function shouldInvert(s: PixelStats): boolean {
  return s.transparent > 0.12 && s.dark > 0.65 && s.light < 0.15 && s.colorful < 0.2;
}

/** A logo with dark gray or black parts mixed with color (Gmail's wordmark next to its M). */
export function shouldRecolor(s: PixelStats): boolean {
  return !shouldInvert(s) && s.transparent > 0.12 && s.deep >= 0.25 && s.light < 0.2;
}

/**
 * Flips the HSL lightness of dark pixels in place, keeping hue and saturation: black text turns
 * white, a navy wordmark light blue, while mid-tone and light colors (a red mark) stay as they are.
 */
export function recolorPixels(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (l >= DEEP_L) continue;
    const d = max - min;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const L = 1 - l;
    const c = (1 - Math.abs(2 * L - 1)) * sat;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = L - c / 2;
    const hh = (h + 6) % 6;
    const [R, G, B] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
    data[i] = Math.round((R + m) * 255);
    data[i + 1] = Math.round((G + m) * 255);
    data[i + 2] = Math.round((B + m) * 255);
  }
}

export function computeStats(data: Uint8ClampedArray): PixelStats {
  let transparent = 0, opaque = 0, dark = 0, light = 0, colorful = 0, darkNeutral = 0, deep = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 40) {
      transparent++;
      continue;
    }
    opaque++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 90) dark++;
    else if (lum > 180) light++;
    if (max - min > 60) colorful++;
    else if (lum < 115) darkNeutral++;
    if (hslLightness(r, g, b) < DEEP_L) deep++;
  }
  const total = transparent + opaque || 1;
  const o = opaque || 1;
  return { transparent: transparent / total, dark: dark / o, light: light / o, colorful: colorful / o, darkNeutral: darkNeutral / o, deep: deep / o };
}

/** A background image that reads as a pale surface (paper texture, light hero gradient), not a photo. */
export function isPaleSurface(s: PixelStats): boolean {
  return s.transparent < 0.5 && s.light > 0.6 && s.dark < 0.1 && s.colorful < 0.25;
}

export class ImageAnalyzer {
  private verdicts = new Map<string, Promise<ImageVerdict>>();
  private backgroundStats = new Map<string, Promise<PixelStats | null>>();
  private tracked = new Set<HTMLImageElement>();

  constructor(
    private win: Window & typeof globalThis,
    private onVerdict: ImageVerdictHandler,
    private fetcher: Fetcher,
    private onBackdrop: BackdropHandler = () => undefined,
  ) {}

  observe(img: HTMLImageElement): void {
    if (this.tracked.has(img)) return;
    this.tracked.add(img);
    if (img.complete && img.naturalWidth > 0) this.analyze(img);
    else img.addEventListener('load', () => this.analyze(img), { once: true });
  }

  reset(): void {
    this.tracked.clear();
  }

  reapply(): void {
    for (const img of this.tracked) if (img.isConnected) this.analyze(img);
  }

  private analyze(img: HTMLImageElement, retry = true): void {
    const src = img.currentSrc || img.src;
    if (!src) return;
    if (this.isBackdrop(img)) {
      void this.statsForUrl(src).then((stats) => {
        if (stats && isPaleSurface(stats) && img.isConnected) this.onBackdrop(img);
      });
      return;
    }
    // Text over a hero image often renders after the image loads (web components, hydration).
    if (retry && img.naturalWidth * img.naturalHeight > MAX_NATURAL_AREA / 4) {
      this.win.setTimeout(() => img.isConnected && this.tracked.has(img) && this.analyze(img, false), 1500);
    }
    if (img.naturalWidth * img.naturalHeight > MAX_NATURAL_AREA) return; // photos and large art
    let verdict = this.verdicts.get(src);
    if (!verdict) {
      verdict = this.measure(img, src).catch(() => NONE);
      this.verdicts.set(src, verdict);
    }
    verdict.then((v) => {
      if (img.isConnected && (img.currentSrc || img.src) === src) this.onVerdict(img, v);
    });
  }

  /** A large image with text drawn over it, found by hit-testing points across it. */
  private isBackdrop(img: HTMLImageElement): boolean {
    const r = img.getBoundingClientRect();
    const vw = this.win.innerWidth;
    if (r.width < Math.min(320, vw * 0.4) || r.height < 150) return false;
    const doc = this.win.document;
    for (const [fx, fy] of [[0.5, 0.3], [0.5, 0.5], [0.3, 0.4], [0.7, 0.4]]) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > vw || y > this.win.innerHeight) continue;
      // Descend into shadow roots: hero text often lives in a component around the image.
      let top = doc.elementFromPoint(x, y);
      for (let depth = 0; top?.shadowRoot && depth < 8; depth++) {
        const inner = top.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === top) break;
        top = inner;
      }
      if (!top || top === img || img.contains(top) || top.contains(img)) continue;
      if (top.textContent && top.textContent.trim().length > 2) return true;
    }
    return false;
  }

  /** Pixel statistics of a CSS background image, loaded through the extension when cross-origin. */
  statsForUrl(url: string): Promise<PixelStats | null> {
    let p = this.backgroundStats.get(url);
    if (!p) {
      p = (async () => {
        const src = url.startsWith('data:') ? url : await this.fetcher(url, 'dataUrl');
        if (!src) return null;
        const img = new this.win.Image();
        img.decoding = 'async';
        img.src = src;
        await img.decode();
        return this.draw(img, img.naturalWidth || 32, img.naturalHeight || 32);
      })().catch(() => null);
      this.backgroundStats.set(url, p);
    }
    return p;
  }

  private draw(source: CanvasImageSource, w: number, h: number): PixelStats {
    const canvas = this.win.document.createElement('canvas');
    const scale = Math.min(1, SAMPLE / Math.max(w, h, 1));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return computeStats(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  }

  private async measure(img: HTMLImageElement, src: string): Promise<ImageVerdict> {
    const w = img.naturalWidth || 32;
    const h = img.naturalHeight || 32;
    let source: CanvasImageSource = img;
    let stats: PixelStats;
    try {
      stats = this.draw(img, w, h);
    } catch {
      // Cross-origin pixels are not readable from the page; load a copy through the extension.
      if (src.startsWith('data:')) return NONE;
      const dataUrl = await this.fetcher(src, 'dataUrl');
      if (!dataUrl) return NONE;
      const copy = new this.win.Image();
      copy.decoding = 'async';
      copy.src = dataUrl;
      await copy.decode();
      source = copy;
      stats = this.draw(copy, copy.naturalWidth || w, copy.naturalHeight || h);
    }
    if (shouldInvert(stats)) return { kind: 'invert' };
    if (shouldRecolor(stats)) return { kind: 'recolor', url: this.recolor(source, w, h) };
    return NONE;
  }

  private recolor(source: CanvasImageSource, w: number, h: number): string {
    const scale = Math.min(1, RECOLOR_MAX / Math.max(w, h, 1));
    const canvas = this.win.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    recolorPixels(data.data);
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
  }
}
