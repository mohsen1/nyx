// Last line of defense against unreadable text. Whatever produced the final colors (a stylesheet
// we could not read, a variable set from script, a pattern the rewriter does not know), this
// checks the text that is actually on screen against the background actually behind it, and
// lifts text that ended up too close to it.

import {
  composite,
  contrastRatio,
  oklabToOklch,
  oklchToRgbaInGamut,
  parseColor,
  relativeLuminance,
  rgbaToOklab,
  type RGBA,
} from '../shared/color';
import { canvasColor } from './detect';
import { isPaleSurface, type ImageAnalyzer } from './images';

export const ATTR_FIX = 'data-nyx-fix';
export const FIX_VAR = '--nyx-fix-c';
export const ATTR_FIX_FILL = 'data-nyx-fix-fill';
export const ATTR_FIX_STROKE = 'data-nyx-fix-stroke';
export const ATTR_DIM = 'data-nyx-dim-bg';
export const DIM_VAR = '--nyx-dim-c';

/** Below this the text is unreadable, so it gets fixed. */
const MIN_RATIO = 3;
/** What fixed text is lifted to (WCAG AA for body text). */
const TARGET_RATIO = 4.5;
const BATCH = 300;
/** Icons are non-text: WCAG asks 3:1; below this they get lifted. */
const ICON_MIN_RATIO = 2.5;
const ICON_SHAPES = 'path, circle, rect, ellipse, line, polyline, polygon, use, text';

/** A text color with the same hue, moved away from `bg` until it reaches the target contrast. */
export function readableOn(fg: RGBA, bg: RGBA, opacity = 1): RGBA {
  const lch = oklabToOklch(rgbaToOklab({ ...fg, a: 1 }));
  const up = relativeLuminance(bg) < 0.18;
  let L = lch.L;
  let C = lch.C;
  let out = fg;
  // Opacity on the element or its ancestors fades whatever color we pick, so aim through it.
  const seen = (c: RGBA) => composite({ ...c, a: opacity }, bg);
  for (let i = 0; i < 24 && contrastRatio(seen(out), bg) < TARGET_RATIO; i++) {
    L = up ? Math.min(0.98, L + 0.04) : Math.max(0.02, L - 0.04);
    C *= 0.94;
    out = oklchToRgbaInGamut({ L, C, h: lch.h, alpha: 1 });
  }
  return out;
}

function unfixShape(shape: SVGElement): void {
  shape.removeAttribute(ATTR_FIX_FILL);
  shape.removeAttribute(ATTR_FIX_STROKE);
  shape.style.removeProperty('--nyx-fix-f');
  shape.style.removeProperty('--nyx-fix-s');
}

function hasOwnText(el: Element): boolean {
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) return true;
  }
  return false;
}

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'canvas', 'video', 'iframe', 'option', 'title']);

/**
 * A small non-repeating image beside the text, like the pencil on Gmail's Compose button. It
 * doesn't sit behind the text, so the background color still decides legibility.
 */
export function isIconBackground(s: CSSStyleDeclaration, el: Element): boolean {
  if (/gradient\(/.test(s.backgroundImage)) return false;
  if (!s.backgroundRepeat.split(',').every((r) => r.trim() === 'no-repeat')) return false;
  const sizes = s.backgroundSize.split(',').map((v) => v.trim());
  const small = (v: string) => v.split(/\s+/).every((p) => /^\d+(\.\d+)?px$/.test(p) && parseFloat(p) <= 64);
  if (sizes.every(small)) return true;
  // auto/contain on a control no taller than an icon row.
  return sizes.every((v) => v === 'auto' || v === 'contain') && el.getBoundingClientRect().height <= 64;
}

export class ContrastGuard {
  private io: IntersectionObserver;
  private visible = new Set<Element>();
  private queue = new Set<Element>();
  private fixed = new Set<HTMLElement>();
  private fixedShapes = new Set<SVGElement>();
  /** The page's own inline `color: … !important`, which only an inline override can beat. */
  private inlineOriginals = new Map<HTMLElement, string>();
  private scheduled = false;
  private recheckTimer: number | null = null;
  /** Elements whose pale background image was darkened, with the color now behind their text. */
  private dimmed = new Map<HTMLElement, RGBA>();
  private dimPending = new WeakSet<Element>();
  private lastBackdropScan = 0;
  private canvasCache: { at: number; color: RGBA } | null = null;

  /** The root background, re-read at most every 2 s (reading it forces a style recalc). */
  private canvas(): RGBA {
    const now = Date.now();
    if (!this.canvasCache || now - this.canvasCache.at > 2000) this.canvasCache = { at: now, color: canvasColor(this.win.document) };
    return this.canvasCache.color;
  }

  constructor(
    private readonly win: Window & typeof globalThis,
    private readonly images: ImageAnalyzer,
    private readonly themeBackground: () => RGBA,
  ) {
    this.io = new win.IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            this.visible.add(e.target);
            this.enqueue(e.target);
          } else this.visible.delete(e.target);
        }
      },
      { rootMargin: '300px 0px' },
    );
  }

  /** Starts watching an element if it directly holds text. */
  observe(el: Element): void {
    if (el.localName === 'svg') {
      // Outermost <svg> only: an icon.
      if (!el.parentElement?.closest('svg')) this.io.observe(el);
      return;
    }
    if (SKIP.has(el.localName)) return;
    if (hasOwnText(el) || this.isGlyphIcon(el)) this.io.observe(el);
  }

  /**
   * Maybe an icon-font glyph (<i class="fa fa-star"></i>): empty, with a class. Whether its
   * ::before really draws something is checked only once it's on screen.
   */
  private isGlyphIcon(el: Element): boolean {
    return !el.firstChild && (el.localName === 'i' || el.localName === 'span') && el.hasAttribute('class');
  }

  /** The element's text changed or it was just added: check it if it's on screen. */
  touch(el: Element): void {
    if (this.visible.has(el)) this.enqueue(el);
    else this.observe(el);
  }

  /** Styles changed somewhere: re-check everything on screen, soon. */
  recheckVisible(delay = 600): void {
    if (this.recheckTimer !== null) this.win.clearTimeout(this.recheckTimer);
    this.recheckTimer = this.win.setTimeout(() => {
      this.recheckTimer = null;
      this.scanBackdrops();
      for (const el of this.visible) this.enqueue(el);
    }, delay);
  }

  reset(): void {
    this.io.disconnect();
    this.visible.clear();
    this.queue.clear();
    if (this.recheckTimer !== null) this.win.clearTimeout(this.recheckTimer);
    this.recheckTimer = null;
    for (const el of this.fixed) this.unfix(el);
    this.fixed.clear();
    for (const shape of this.fixedShapes) unfixShape(shape);
    this.fixedShapes.clear();
    for (const el of this.dimmed.keys()) {
      el.removeAttribute(ATTR_DIM);
      el.style.removeProperty(DIM_VAR);
    }
    this.dimmed.clear();
    this.dimPending = new WeakSet();
  }

  private enqueue(el: Element): void {
    this.queue.add(el);
    if (this.scheduled) return;
    this.scheduled = true;
    this.win.requestAnimationFrame(() => this.flush());
  }

  private flush(): void {
    this.scheduled = false;
    // New content is being checked: its backdrop may have just appeared too.
    const now = Date.now();
    if (now - this.lastBackdropScan > 3000) {
      this.lastBackdropScan = now;
      this.scanBackdrops();
    }
    const batch: Element[] = [];
    for (const el of this.queue) {
      batch.push(el);
      this.queue.delete(el);
      if (batch.length >= BATCH) break;
    }
    // Measure fixed elements as the page would show them without our fix.
    const refixed = batch.filter((el): el is HTMLElement => this.fixed.has(el as HTMLElement));
    for (const el of refixed) {
      el.removeAttribute(ATTR_FIX);
      const original = this.inlineOriginals.get(el);
      if (original !== undefined) el.style.setProperty('color', original, 'important');
    }
    const icons = batch.filter((el): el is SVGSVGElement => el.localName === 'svg');
    for (const svg of icons) {
      for (const shape of Array.from(svg.querySelectorAll<SVGElement>(`[${ATTR_FIX_FILL}], [${ATTR_FIX_STROKE}]`))) {
        unfixShape(shape);
        this.fixedShapes.delete(shape);
      }
    }
    const canvas = this.canvas();
    const iconFixes = icons.flatMap((svg) => (svg.isConnected ? this.fixIcon(svg, canvas) : []));
    for (const [shape, prop, color] of iconFixes) {
      shape.style.setProperty(prop === 'fill' ? '--nyx-fix-f' : '--nyx-fix-s', color);
      shape.setAttribute(prop === 'fill' ? ATTR_FIX_FILL : ATTR_FIX_STROKE, '');
      this.fixedShapes.add(shape);
    }
    const decisions: Array<[HTMLElement, string | null]> = [];
    for (const el of batch) {
      if (!el.isConnected || el.localName === 'svg') continue;
      // Mid-transition colors are not the page's real colors; look again once it settles.
      if (typeof el.getAnimations === 'function' && el.getAnimations().some((a) => a.playState === 'running')) {
        this.win.setTimeout(() => this.enqueue(el), 600);
        continue;
      }
      decisions.push([el as HTMLElement, this.fixFor(el, canvas)]);
    }
    for (const [el, color] of decisions) {
      if (color) {
        el.style.setProperty(FIX_VAR, color);
        el.setAttribute(ATTR_FIX, '');
        if (el.style.getPropertyPriority('color') === 'important') {
          if (!this.inlineOriginals.has(el)) this.inlineOriginals.set(el, el.style.getPropertyValue('color'));
          el.style.setProperty('color', color, 'important');
        }
        this.fixed.add(el);
      } else if (this.fixed.has(el)) this.unfix(el);
    }
    if (this.queue.size) {
      this.scheduled = true;
      this.win.requestAnimationFrame(() => this.flush());
    }
  }

  private unfix(el: HTMLElement): void {
    el.removeAttribute(ATTR_FIX);
    el.style.removeProperty(FIX_VAR);
    const original = this.inlineOriginals.get(el);
    if (original !== undefined) {
      el.style.setProperty('color', original, 'important');
      this.inlineOriginals.delete(el);
    }
    this.fixed.delete(el);
  }

  /**
   * Gray icon shapes that ended up too close to the background. Colored icons keep their colors:
   * their color is part of what they mean.
   */
  private fixIcon(svg: SVGSVGElement, canvas: RGBA): Array<[SVGElement, 'fill' | 'stroke', string]> {
    const r = svg.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.width > 64 || r.height > 64) return [];
    const behind = this.backgroundBehind(svg, canvas);
    if (!behind || behind.opacity < 0.5) return [];
    const { bg, opacity } = behind;
    const out: Array<[SVGElement, 'fill' | 'stroke', string]> = [];
    const shapes = Array.from(svg.querySelectorAll<SVGElement>(ICON_SHAPES)).slice(0, 40);
    for (const shape of shapes) {
      const cs = this.win.getComputedStyle(shape);
      if (cs.display === 'none' || cs.visibility !== 'visible') continue;
      for (const prop of ['fill', 'stroke'] as const) {
        const c = parseColor(cs.getPropertyValue(prop));
        if (!c || c.a < 0.05) continue;
        if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 60) return []; // a colored icon
        const seen = composite({ ...composite(c, bg), a: opacity }, bg);
        if (contrastRatio(seen, bg) >= ICON_MIN_RATIO) continue;
        const fixed = readableOn(composite(c, bg), bg, opacity);
        out.push([shape, prop, `rgb(${fixed.r}, ${fixed.g}, ${fixed.b})`]);
      }
    }
    return out;
  }

  /** Returns a replacement text color when the element's text is unreadable, else null. */
  private fixFor(el: Element, canvas: RGBA): string | null {
    const cs = this.win.getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') return null;
    const fill = cs.getPropertyValue('-webkit-text-fill-color');
    // Icon-font glyphs draw in their ::before; read its color.
    let color = cs.color;
    if (!el.firstChild) {
      const before = this.win.getComputedStyle(el, '::before');
      const content = before.content;
      if (!content || content === 'none' || content === 'normal' || content === '""') {
        this.io.unobserve(el);
        this.visible.delete(el);
        return null;
      }
      color = before.color || color;
    }
    const fg = parseColor(fill && fill !== cs.color && !/currentcolor/i.test(fill) ? fill : color);
    if (!fg || fg.a < 0.05) return null;
    const behind = this.backgroundBehind(el, canvas);
    if (!behind) return null;
    const { bg, opacity } = behind;
    // Text faded on purpose (disabled controls, placeholders) stays faded.
    if (opacity < 0.5) return null;
    const text = composite(fg, bg);
    if (contrastRatio(composite({ ...text, a: opacity }, bg), bg) >= MIN_RATIO) return null;
    const c = readableOn(text, bg, opacity);
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
  }

  /**
   * Full-page background images often sit beside the content rather than under it in the tree
   * (a sign-in page's backdrop behind its card), so ancestor walks never meet them. Hit-test a
   * grid across the viewport for them.
   */
  private scanBackdrops(): void {
    const doc = this.win.document;
    const w = this.win.innerWidth, h = this.win.innerHeight;
    for (const fx of [0.1, 0.5, 0.9]) {
      for (const fy of [0.2, 0.5, 0.85]) {
        for (const el of doc.elementsFromPoint(w * fx, h * fy)) {
          if (el.localName === 'html') break;
          if ((el.localName === 'img' || el.localName === 'video' || el.localName === 'canvas') && !el.hasAttribute(ATTR_DIM)) {
            this.images.reconsiderBackdrop(el as HTMLImageElement | HTMLVideoElement | HTMLCanvasElement);
          }
          const s = this.win.getComputedStyle(el);
          if (s.backgroundImage.includes('url(') && !isIconBackground(s, el)) this.considerDimming(el, s.backgroundImage);
          const c = parseColor(s.backgroundColor);
          if (c && c.a >= 0.99) break; // anything further down is hidden
        }
      }
    }
  }

  /**
   * A large pale background image (a light hero, a paper texture) stays bright on a dark page and
   * leaves text on it unreadable. Multiply it with a dark gray so it lands near the theme background.
   */
  private considerDimming(el: Element, backgroundImage: string, textOnTop = false): void {
    if (this.dimPending.has(el)) return;
    const url = /url\(\s*(['"]?)(.*?)\1\s*\)/.exec(backgroundImage)?.[2];
    if (!url) return;
    // Not yet laid out, or small: may grow later, so don't remember it.
    const r = el.getBoundingClientRect();
    if (textOnTop ? r.width < 16 || r.height < 12 : r.width < Math.min(320, this.win.innerWidth * 0.4) || r.height < 120) return;
    this.dimPending.add(el);
    void this.images.statsForUrl(url).then((stats) => {
      if (!stats || !isPaleSurface(stats) || !el.isConnected) return;
      const bg = this.themeBackground();
      const k = Math.min(0.45, (relativeLuminance(bg) + 0.05) * 2.2);
      const gray = Math.round(255 * k);
      const behind = { r: Math.round(240 * k), g: Math.round(240 * k), b: Math.round(240 * k), a: 1 };
      const host = el as HTMLElement;
      host.style.setProperty(DIM_VAR, `rgb(${gray}, ${gray}, ${gray})`);
      host.setAttribute(ATTR_DIM, '');
      this.dimmed.set(host, behind);
      this.recheckVisible(50);
    });
  }

  /**
   * The solid color behind an element, or null when it can't be known (an image, gradient or
   * text clipped to a background is in the way).
   */
  private backgroundBehind(el: Element, canvas: RGBA): { bg: RGBA; opacity: number } | null {
    const layers: RGBA[] = [];
    let opacity = 1;
    for (let node: Element | null = el; node; node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host || null)) {
      if (node.localName === 'html') break;
      const dimmedTo = this.dimmed.get(node as HTMLElement);
      if (dimmedTo) {
        layers.push(dimmedTo);
        break;
      }
      const s = this.win.getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none' && !isIconBackground(s, node)) {
        // Text sits on this image, so even a button-sized pale image needs darkening.
        this.considerDimming(node, s.backgroundImage, true);
        return null;
      }
      if (s.backgroundClip === 'text' || s.getPropertyValue('-webkit-background-clip') === 'text') return null;
      const c = parseColor(s.backgroundColor);
      if (c && c.a >= 0.99) {
        layers.push(c);
        break;
      }
      // Opacity between the text and its solid background fades the text against it.
      opacity *= parseFloat(s.opacity) || 0;
      if (c && c.a > 0.01) layers.push(c);
    }
    let out = canvas;
    for (let i = layers.length - 1; i >= 0; i--) out = composite(layers[i], out);
    return { bg: out, opacity };
  }
}
