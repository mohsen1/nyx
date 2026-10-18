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
export type BackdropHandler = (el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) => void;
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
  private media = new Set<HTMLVideoElement | HTMLCanvasElement>();

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
    this.media.clear();
  }

  reapply(): void {
    for (const img of this.tracked) if (img.isConnected) this.analyze(img);
  }

  private analyze(img: HTMLImageElement, retry = true): void {
    const src = img.currentSrc || img.src;
    if (!src) return;
    if (this.overlayText(img)) {
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
      if (!img.isConnected || (img.currentSrc || img.src) !== src) return;
      this.onVerdict(img, v.kind !== 'none' && this.paintsThroughMask(img) ? NONE : v);
    });
  }

  /**
   * An image used only as a mask shape over a CSS background color (Notion's logo wall paints
   * `background-color: currentColor` through the logo and moves the image's own pixels out of
   * view). The color shown is the page's, which is already themed, so the image is left alone.
   */
  private paintsThroughMask(img: HTMLImageElement): boolean {
    const style = this.win.getComputedStyle(img);
    const mask = style.maskImage || (style as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage || 'none';
    if (mask === 'none') return false;
    const bg = style.backgroundColor;
    return bg !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(bg);
  }

  /**
   * A video or canvas used as a backdrop (iCloud's animated hero, a drawn background) with text on
   * top. Darkened when it's pale, or, when its pixels can't be read, when the text on it is light.
   */
  observeMedia(el: HTMLVideoElement | HTMLCanvasElement): void {
    if (this.media.has(el)) return;
    this.media.add(el);
    const check = (retry: boolean) => {
      if (!el.isConnected || !this.media.has(el)) return;
      const text = this.overlayText(el);
      if (text) {
        const w = el instanceof HTMLVideoElement ? el.videoWidth : el.width;
        const h = el instanceof HTMLVideoElement ? el.videoHeight : el.height;
        let pale: boolean | null = null;
        try {
          if (w && h) {
            const stats = this.draw(el, w, h);
            // A WebGL canvas reads back as fully transparent once it has been shown (Asana's
            // three.js hero), which says nothing about what it paints.
            if (stats.transparent < 0.98) pale = isPaleSurface(stats);
          }
        } catch {
          /* cross-origin video or tainted canvas */
        }
        const light = (() => {
          const m = this.win.getComputedStyle(text).color.match(/[\d.]+/g);
          return !!m && (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255 > 0.55;
        })();
        if (pale === true || (pale === null && light)) {
          this.onBackdrop(el);
          return;
        }
      }
      if (retry) this.win.setTimeout(() => check(false), 1500);
    };
    if (el instanceof HTMLVideoElement && el.readyState < 2) el.addEventListener('loadeddata', () => check(true), { once: true });
    else check(true);
  }

  private backdropAttempts = new WeakMap<Element, number>();

  /** Re-checks media found under the viewport: text over it often renders late. */
  reconsiderBackdrop(el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): void {
    const n = this.backdropAttempts.get(el) ?? 0;
    if (n >= 5) return;
    this.backdropAttempts.set(el, n + 1);
    if (el instanceof HTMLImageElement) {
      const src = el.currentSrc || el.src;
      if (!src || !el.complete || !this.overlayText(el)) return;
      void this.statsForUrl(src).then((stats) => {
        if (stats && isPaleSurface(stats) && el.isConnected) this.onBackdrop(el);
      });
    } else {
      this.media.delete(el);
      this.observeMedia(el);
    }
  }

  /** The text element drawn over a large image/video/canvas, found by hit-testing across it. */
  private overlayText(img: Element): Element | null {
    // Backdrops are big images; skip the layout-forcing hit-test for thumbnails and icons.
    if (img instanceof HTMLImageElement && (img.naturalWidth < 600 || img.naturalHeight < 250)) return null;
    const r = img.getBoundingClientRect();
    const vw = this.win.innerWidth;
    if (r.width < Math.min(320, vw * 0.4) || r.height < 150) return null;
    const doc = this.win.document;
    // Sample the part that's on screen: a tall hero's heading is near its top.
    const top0 = Math.max(r.top, 0), bottom0 = Math.min(r.bottom, this.win.innerHeight);
    const left0 = Math.max(r.left, 0), right0 = Math.min(r.right, vw);
    if (bottom0 - top0 < 60 || right0 - left0 < 60) return null;
    const points: Array<[number, number]> = [];
    for (const fx of [0.3, 0.5, 0.7]) for (const fy of [0.2, 0.45, 0.7]) points.push([fx, fy]);
    for (const [fx, fy] of points) {
      const x = left0 + (right0 - left0) * fx;
      const y = top0 + (bottom0 - top0) * fy;
      // Descend into shadow roots: hero text often lives in a component around the image.
      let top = doc.elementFromPoint(x, y);
      for (let depth = 0; top?.shadowRoot && depth < 8; depth++) {
        const inner = top.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === top) break;
        top = inner;
      }
      if (!top || top === img || img.contains(top) || top.contains(img)) continue;
      if (top.textContent && top.textContent.trim().length > 2) return top;
    }
    return null;
  }

  private bgDone = new WeakMap<HTMLElement, string>();
  private bgOriginal = new Map<HTMLElement, [value: string, priority: string]>();
  private recolored = new Map<string, Promise<string | null>>();
  private noRecolor = new Set<string>();

  /**
   * A logo, icon or sprite drawn as a CSS background: dark artwork gets a recolored copy (dark
   * pixels lightened, colors kept) at its natural size, so sprite positions still line up.
   */
  analyzeBackground(el: HTMLElement): void {
    const bg = this.win.getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none' || bg.includes('data:image/png;base64,iVBOR') && this.bgOriginal.has(el)) return;
    const urls = bg.match(/url\(/g);
    if (!urls || urls.length !== 1 || bg.includes('gradient(')) return;
    const url = /url\(\s*(['"]?)(.*?)\1\s*\)/.exec(bg)?.[2];
    if (!url || this.bgDone.get(el) === url) return;
    // Repeated sprites (hundreds of vote arrows): once a URL is known not to need recoloring,
    // skip the layout read entirely.
    if (this.noRecolor.has(url)) {
      this.bgDone.set(el, url);
      return;
    }
    const r = el.getBoundingClientRect();
    // Off-screen ones wait for a later scan: decoding every icon on a long page up front is costly.
    if (r.width < 4 || r.height < 4 || r.bottom < -1000 || r.top > this.win.innerHeight + 1000) return;
    this.bgDone.set(el, url);
    // Large ones are backdrops (dimmed elsewhere), not artwork.
    if (r.width >= Math.min(320, this.win.innerWidth * 0.4) && r.height >= 120) return;
    let p = this.recolored.get(url);
    if (!p) {
      p = (async () => {
        const src = url.startsWith('data:') ? url : await this.fetcher(url, 'dataUrl');
        if (!src) return null;
        const img = new this.win.Image();
        img.decoding = 'async';
        img.src = src;
        await img.decode();
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h || w * h > MAX_NATURAL_AREA) return null;
        const stats = this.draw(img, w, h);
        if (!shouldInvert(stats) && !shouldRecolor(stats)) return null;
        const canvas = this.win.document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h);
        recolorPixels(data.data);
        ctx.putImageData(data, 0, 0);
        return canvas.toDataURL('image/png');
      })().catch(() => null);
      this.recolored.set(url, p);
    }
    void p.then((copy) => {
      if (!copy) this.noRecolor.add(url);
      if (!copy || !el.isConnected || this.bgDone.get(el) !== url) return;
      if (!this.bgOriginal.has(el)) this.bgOriginal.set(el, [el.style.getPropertyValue('background-image'), el.style.getPropertyPriority('background-image')]);
      el.style.setProperty('background-image', `url("${copy}")`, 'important');
      el.setAttribute('data-nyx-bg-recolor', '');
    });
  }

  /** Whether an element's background was already looked at (it's re-checked when its inline style changes). */
  analyzedBackground(el: Element): boolean {
    return this.bgDone.has(el as HTMLElement);
  }

  /** Puts back the page's own background images. */
  restoreBackgrounds(): void {
    for (const [el, [value, priority]] of this.bgOriginal) {
      if (value) el.style.setProperty('background-image', value, priority);
      else el.style.removeProperty('background-image');
      el.removeAttribute('data-nyx-bg-recolor');
    }
    this.bgOriginal.clear();
    this.bgDone = new WeakMap();
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
