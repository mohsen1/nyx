// Decides which images to invert. Dark artwork on a transparent background (logos, icons,
// diagrams) would disappear on a dark page, so those images are inverted; photos are not.

export type ImageVerdictHandler = (el: HTMLImageElement, invert: boolean) => void;
type Fetcher = (url: string, as: 'text' | 'dataUrl') => Promise<string | null>;

const SAMPLE = 48;
const MAX_NATURAL_AREA = 1200 * 1200;

export interface PixelStats {
  transparent: number; // share of (mostly) transparent pixels
  dark: number; // share of opaque pixels that are dark
  light: number; // share of opaque pixels that are light
  colorful: number; // share of opaque pixels with noticeable saturation
}

/** Pure decision on pixel statistics; exported for tests. */
export function shouldInvert(s: PixelStats): boolean {
  return s.transparent > 0.12 && s.dark > 0.65 && s.light < 0.15 && s.colorful < 0.2;
}

export function computeStats(data: Uint8ClampedArray): PixelStats {
  let transparent = 0, opaque = 0, dark = 0, light = 0, colorful = 0;
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
  }
  const total = transparent + opaque || 1;
  const o = opaque || 1;
  return { transparent: transparent / total, dark: dark / o, light: light / o, colorful: colorful / o };
}

export class ImageAnalyzer {
  private verdicts = new Map<string, Promise<boolean>>();
  private tracked = new Set<HTMLImageElement>();

  constructor(
    private win: Window & typeof globalThis,
    private onVerdict: ImageVerdictHandler,
    private fetcher: Fetcher,
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

  private analyze(img: HTMLImageElement): void {
    const src = img.currentSrc || img.src;
    if (!src) return;
    if (img.naturalWidth * img.naturalHeight > MAX_NATURAL_AREA) return; // photos and large art
    let verdict = this.verdicts.get(src);
    if (!verdict) {
      verdict = this.measure(img, src).catch(() => false);
      this.verdicts.set(src, verdict);
    }
    verdict.then((invert) => {
      if (img.isConnected && (img.currentSrc || img.src) === src) this.onVerdict(img, invert);
    });
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

  private async measure(img: HTMLImageElement, src: string): Promise<boolean> {
    const w = img.naturalWidth || 32;
    const h = img.naturalHeight || 32;
    try {
      return shouldInvert(this.draw(img, w, h));
    } catch {
      // Cross-origin pixels are not readable from the page; load a copy through the extension.
    }
    if (src.startsWith('data:')) return false;
    const dataUrl = await this.fetcher(src, 'dataUrl');
    if (!dataUrl) return false;
    const copy = new this.win.Image();
    copy.decoding = 'async';
    copy.src = dataUrl;
    await copy.decode();
    return shouldInvert(this.draw(copy, copy.naturalWidth || w, copy.naturalHeight || h));
  }
}
