// The dynamic dark style engine. It reads the page's own styles and generates a tailored
// override for each of them, plus overrides for inline styles and presentational attributes.

import { Palette } from '../shared/palette';
import { PROPERTY_ROLES, rewriteCustomProperty, rewriteValue, type RewriteContext } from '../shared/css-values';
import type { AppearanceOptions } from '../shared/settings';
import type { Theme } from '../shared/theme';
import { transformRules, transformSheet } from './sheet-transform';
import { ImageAnalyzer } from './images';
import { ATTR_DIM, ATTR_FIX, ContrastGuard, DIM_VAR, FIX_VAR } from './contrast';
import { parseColor } from '../shared/color';

export const STYLE_CLASS = 'nyx-style';
const ATTR_INLINE = 'data-nyx-inline';
const ATTR_INVERT = 'data-nyx-invert';

export interface EngineConfig {
  theme: Theme;
  appearance: AppearanceOptions;
}

export type ResourceFetcher = (url: string, as: 'text' | 'dataUrl') => Promise<string | null>;

/** Inline style properties we override, keyed by the short token used in data-nyx-inline. */
const INLINE_PROPS: Array<[token: string, prop: string]> = [
  ['bg', 'background-color'],
  ['bgi', 'background-image'],
  ['b', 'background'],
  ['c', 'color'],
  ['bt', 'border-top-color'],
  ['br', 'border-right-color'],
  ['bb', 'border-bottom-color'],
  ['bl', 'border-left-color'],
  ['f', 'fill'],
  ['s', 'stroke'],
  ['oc', 'outline-color'],
  ['bs', 'box-shadow'],
  ['tdc', 'text-decoration-color'],
];

/** Presentational attributes that carry colors. */
const ATTRS: Array<{ attr: string; selector: (v: string) => string; prop: string; role: 'background' | 'text' | 'border' }> = [
  { attr: 'bgcolor', selector: (v) => `[bgcolor=${v} i]`, prop: 'background-color', role: 'background' },
  { attr: 'color', selector: (v) => `font[color=${v} i]`, prop: 'color', role: 'text' },
  { attr: 'text', selector: (v) => `body[text=${v} i]`, prop: 'color', role: 'text' },
  { attr: 'fill', selector: (v) => `[fill=${v} i]`, prop: 'fill', role: 'text' },
  { attr: 'stroke', selector: (v) => `[stroke=${v} i]`, prop: 'stroke', role: 'text' },
  { attr: 'stop-color', selector: (v) => `[stop-color=${v} i]`, prop: 'stop-color', role: 'background' },
];
const WATCHED_ATTRS = ['style', ...ATTRS.map((a) => a.attr)];

interface SheetOverride {
  el: HTMLStyleElement;
  signature: string;
}

const isElement = (n: Node): n is Element => n.nodeType === 1;

/** Applies the dark style to one Document or ShadowRoot. */
class RootStyler {
  private baseEl: HTMLStyleElement;
  private attrEl: HTMLStyleElement;
  private overrides = new Map<Node, SheetOverride>();
  private adoptedOverride: CSSStyleSheet | null = null;
  private adoptedSignature = '';
  private attrValues = new Map<string, Set<string>>();
  /** In-flight fetches per owner element: pages often include the same stylesheet twice. */
  private pendingFetch = new WeakMap<Element, Set<string>>();

  constructor(
    readonly root: Document | ShadowRoot,
    private engine: DarkEngine,
  ) {
    const doc = root instanceof Document ? root : root.ownerDocument;
    this.baseEl = doc.createElement('style');
    this.baseEl.className = STYLE_CLASS;
    this.baseEl.dataset.nyx = 'base';
    this.attrEl = doc.createElement('style');
    this.attrEl.className = STYLE_CLASS;
    this.attrEl.dataset.nyx = 'attributes';
  }

  private get container(): Node {
    if (this.root instanceof Document) return this.root.head ?? this.root.documentElement;
    return this.root;
  }

  mount(): void {
    const c = this.container;
    if (!c) return;
    // Base rules go first so every page rule (and its override) can win over them.
    if (this.baseEl.parentNode !== c) c.insertBefore(this.baseEl, c.firstChild);
    if (this.attrEl.parentNode !== c) this.baseEl.after(this.attrEl);
    const css = this.engine.baseCss(this.root instanceof Document);
    if (this.baseEl.textContent !== css) this.baseEl.textContent = css;
    this.renderAttributes();
  }

  unmount(): void {
    this.baseEl.remove();
    this.attrEl.remove();
    for (const o of this.overrides.values()) o.el.remove();
    this.overrides.clear();
    if (this.adoptedOverride) {
      const r = this.root as Document | ShadowRoot;
      r.adoptedStyleSheets = r.adoptedStyleSheets.filter((s) => s !== this.adoptedOverride);
      this.adoptedOverride = null;
      this.adoptedSignature = '';
    }
    this.attrValues.clear();
  }

  /** Re-renders everything (theme or options changed). */
  refresh(): void {
    for (const o of this.overrides.values()) o.signature = '';
    this.adoptedSignature = '';
    this.mount();
    this.syncSheets();
  }

  /** Brings sheet overrides up to date with the page's current stylesheets. */
  syncSheets(): void {
    const live = new Set<Node>();
    const sheets = Array.from(this.root.styleSheets) as CSSStyleSheet[];
    for (const sheet of sheets) {
      const owner = sheet.ownerNode as Element | null;
      if (!owner || (owner as Element).classList?.contains(STYLE_CLASS)) continue;
      live.add(owner);
      this.syncSheet(sheet, owner);
    }
    for (const [owner, o] of this.overrides) {
      if (!live.has(owner) || !owner.isConnected) {
        o.el.remove();
        this.overrides.delete(owner);
      }
    }
    this.syncAdopted();
  }

  private signature(sheet: CSSStyleSheet, owner: Element): string {
    let count = -1;
    try {
      count = sheet.cssRules.length;
    } catch {
      /* cross-origin */
    }
    return `${sheet.href ?? ''}|${count}|${owner.textContent?.length ?? 0}|${sheet.media?.mediaText ?? ''}|${sheet.disabled}`;
  }

  private syncSheet(sheet: CSSStyleSheet, owner: Element): void {
    const sig = this.signature(sheet, owner);
    let o = this.overrides.get(owner);
    if (o && o.signature === sig) {
      if (o.el.previousSibling !== owner && owner.isConnected) owner.after(o.el);
      return;
    }
    const opts = this.engine.rewriteOptions(sheet.href ?? owner.ownerDocument.baseURI);
    const imports: string[] = [];
    let css = transformSheet(sheet, { ...opts, onInaccessibleImport: (href) => imports.push(href) });
    if (css === null) {
      // Cross-origin stylesheet: ask the background page for its text.
      css = '';
      if (sheet.href) this.fetchSheet(sheet.href, owner, sig);
    }
    for (const href of imports) this.fetchSheet(href, owner, sig, true);
    if (sheet.disabled) css = '';
    const media = sheet.media?.mediaText;
    if (css && media && media !== 'all') css = `@media ${media} { ${css} }`;
    if (!o) {
      const el = owner.ownerDocument.createElement('style');
      el.className = STYLE_CLASS;
      el.dataset.nyx = 'override';
      o = { el, signature: '' };
      this.overrides.set(owner, o);
    }
    o.signature = sig;
    if (o.el.textContent !== css) {
      o.el.textContent = css;
      this.engine.contrast.recheckVisible();
    }
    if (o.el.previousSibling !== owner) owner.after(o.el);
  }

  private fetchSheet(href: string, owner: Element, sig: string, append = false): void {
    const key = `${href}|${sig}`;
    let pending = this.pendingFetch.get(owner);
    if (!pending) this.pendingFetch.set(owner, (pending = new Set()));
    if (pending.has(key)) return;
    pending.add(key);
    this.engine
      .fetchText(href)
      .then((text) => {
        const o = this.overrides.get(owner);
        if (!text || !o || o.signature !== sig || !this.engine.running) return;
        const css = this.engine.transformText(text, href);
        const media = (owner as HTMLLinkElement).media;
        const wrapped = css && media && media !== 'all' ? `@media ${media} { ${css} }` : css;
        o.el.textContent = append ? `${wrapped}\n${o.el.textContent ?? ''}` : wrapped;
        this.engine.contrast.recheckVisible();
      })
      .finally(() => pending.delete(key));
  }

  private syncAdopted(): void {
    const r = this.root as Document | ShadowRoot;
    const adopted = r.adoptedStyleSheets;
    if (!adopted) return;
    const sources = adopted.filter((s) => s !== this.adoptedOverride);
    if (sources.length === 0) {
      if (this.adoptedOverride) {
        r.adoptedStyleSheets = sources;
        this.adoptedOverride = null;
        this.adoptedSignature = '';
      }
      return;
    }
    const sig = sources.map((s) => s.cssRules.length).join(',');
    const last = adopted[adopted.length - 1];
    if (sig === this.adoptedSignature && last === this.adoptedOverride) return;
    const opts = this.engine.rewriteOptions(this.engine.doc.baseURI);
    const css = sources.map((s) => transformRules(s.cssRules, opts)).join('\n');
    if (!this.adoptedOverride) this.adoptedOverride = new (this.engine.win.CSSStyleSheet)();
    this.adoptedOverride.replaceSync(css);
    this.engine.contrast.recheckVisible();
    this.adoptedSignature = sig;
    r.adoptedStyleSheets = [...sources, this.adoptedOverride];
  }

  /** Inline style="" overrides, via custom properties consumed by rules in the base sheet. */
  processInline(el: Element): void {
    const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
    if (!style) return;
    const tokens: string[] = [];
    const opts = this.engine.rewriteOptions(this.engine.doc.baseURI);
    if (style.length > 0) {
      for (const [token, prop] of INLINE_PROPS) {
        const value = style.getPropertyValue(prop);
        if (!value) continue;
        const role = PROPERTY_ROLES[prop];
        const hide = this.engine.config.appearance.backgroundImages === false && (token === 'bgi' || token === 'b');
        const mapped = rewriteValue(value, role, { ...opts, hideImages: hide });
        if (mapped === null) continue;
        tokens.push(token);
        const name = `--nyx-i-${token}`;
        if (style.getPropertyValue(name) !== mapped) style.setProperty(name, mapped);
      }
    }
    // Custom properties set inline (often from script): give them role copies like sheet ones.
    if (style.length > 0) {
      const names: string[] = [];
      for (let k = 0; k < style.length; k++) {
        const name = style[k];
        if (name.startsWith('--') && !name.startsWith('--nyx-')) names.push(name);
      }
      for (const name of names) {
        for (const [copy, value] of rewriteCustomProperty(name, style.getPropertyValue(name), opts)) {
          if (style.getPropertyValue(copy) !== value) style.setProperty(copy, value);
        }
      }
    }
    const current = el.getAttribute(ATTR_INLINE);
    const next = tokens.join(' ');
    if (next) {
      if (current !== next) el.setAttribute(ATTR_INLINE, next);
    } else if (current !== null) {
      el.removeAttribute(ATTR_INLINE);
      for (const [token] of INLINE_PROPS) style.removeProperty(`--nyx-i-${token}`);
    }
  }

  /** Records presentational color attributes (bgcolor, fill, ...) so they get override rules. */
  processAttributes(el: Element): boolean {
    let added = false;
    for (const { attr } of ATTRS) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      if (attr === 'color' && el.localName !== 'font') continue;
      if (attr === 'text' && el.localName !== 'body') continue;
      let set = this.attrValues.get(attr);
      if (!set) this.attrValues.set(attr, (set = new Set()));
      if (!set.has(v)) {
        set.add(v);
        added = true;
      }
    }
    return added;
  }

  renderAttributes(): void {
    const palette = this.engine.palette;
    let css = '';
    for (const { attr, selector, prop, role } of ATTRS) {
      const values = this.attrValues.get(attr);
      if (!values) continue;
      for (const v of values) {
        const mapped = palette.map(v, role);
        if (mapped) css += `${selector(JSON.stringify(v))} { ${prop}: ${mapped}; }\n`;
      }
    }
    if (this.attrEl.textContent !== css) this.attrEl.textContent = css;
  }

  /** Processes a subtree: inline styles, attributes, images and nested shadow roots. */
  scan(node: ParentNode): void {
    let attrsChanged = false;
    const visit = (el: Element) => {
      if (el.hasAttribute('style')) this.processInline(el);
      if (this.processAttributes(el)) attrsChanged = true;
      if (el.localName === 'img') this.engine.images.observe(el as HTMLImageElement);
      else this.engine.contrast.observe(el);
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) this.engine.attachRoot(sr);
      else if (el.localName.includes('-')) this.engine.pendingHosts.add(el);
    };
    if (isElement(node as Node)) visit(node as Element);
    const all = node.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) visit(all[i]);
    if (attrsChanged) this.renderAttributes();
  }
}

/** Orchestrates RootStylers for the document and its open shadow roots. */
export class DarkEngine {
  readonly win: Window & typeof globalThis;
  palette: Palette;
  config: EngineConfig;
  running = false;
  readonly images: ImageAnalyzer;
  readonly contrast: ContrastGuard;
  private roots = new Map<Document | ShadowRoot, RootStyler>();
  /** Custom elements that may attach a shadow root after they are upgraded (no DOM mutation signals it). */
  readonly pendingHosts = new Set<Element>();
  private observers = new Map<Document | ShadowRoot, MutationObserver>();
  private pollTimer: number | null = null;
  private loadingEl: HTMLStyleElement | null = null;
  private sheetSyncQueued = false;
  private onLoadCapture = (e: Event) => {
    const t = e.target as Element | null;
    if (t && t.localName === 'link') this.queueSheetSync();
  };

  constructor(
    readonly doc: Document,
    config: EngineConfig,
    private fetcher: ResourceFetcher,
  ) {
    this.win = doc.defaultView as Window & typeof globalThis;
    this.config = config;
    this.palette = this.makePalette(config);
    this.images = new ImageAnalyzer(this.win, (el, invert) => {
      if (!this.running) return;
      if (invert && this.config.appearance.imageInversion) el.setAttribute(ATTR_INVERT, '');
      else el.removeAttribute(ATTR_INVERT);
    }, fetcher, (el) => {
      if (this.running) el.setAttribute(ATTR_DIM, '');
    });
    this.contrast = new ContrastGuard(this.win, this.images, () => parseColor(this.config.theme.background) ?? { r: 28, g: 28, b: 30, a: 1 });
  }

  private makePalette(c: EngineConfig): Palette {
    return new Palette({ background: c.theme.background, text: c.theme.text, dynamicColors: c.appearance.dynamicColors });
  }

  rewriteOptions(baseUrl: string | null): RewriteContext {
    return { palette: this.palette, baseUrl, hideImages: !this.config.appearance.backgroundImages };
  }

  private textCache = new Map<string, Promise<string | null>>();

  /** Fetches a resource's text once per URL, shared by every element that includes it. */
  fetchText(url: string): Promise<string | null> {
    let p = this.textCache.get(url);
    if (!p) {
      p = this.fetcher(url, 'text');
      this.textCache.set(url, p);
      // Don't remember failures; a later sync may succeed.
      void p.then((t) => t === null && this.textCache.delete(url));
    }
    return p;
  }

  /** Transforms raw CSS text (cross-origin sheets) by parsing it in a detached sheet. */
  transformText(text: string, href: string): string {
    try {
      const sheet = new this.win.CSSStyleSheet();
      // replaceSync ignores @import; imported sheets are fetched separately when encountered.
      sheet.replaceSync(text.replace(/@import[^;]+;/g, ''));
      return transformRules(sheet.cssRules, this.rewriteOptions(href));
    } catch {
      return '';
    }
  }

  /** CSS that does not depend on page styles: canvas, defaults, images, inline overrides. */
  baseCss(isDocument: boolean): string {
    const { theme, appearance } = this.config;
    const p = this.palette;
    const bg = theme.background;
    const text = theme.text;
    const link = p.map('#0000ee', 'text');
    const visited = p.map('#551a8b', 'text');
    const border = p.map('#cccccc', 'border');
    const filters: string[] = [];
    if (theme.imageBrightness < 1) filters.push(`brightness(${theme.imageBrightness})`);
    if (theme.grayscale > 0) filters.push(`grayscale(${theme.grayscale})`);
    const imageFilter = filters.join(' ');
    let css = '';
    if (isDocument) {
      css += `:root { color-scheme: dark !important; }\n`;
      css += `:where(html) { background-color: ${bg}; color: ${text}; }\n`;
    } else {
      css += `:host { color-scheme: dark; }\n`;
    }
    css += `:where(a:any-link) { color: ${link}; }\n:where(a:visited) { color: ${visited}; }\n`;
    css += `:where(input, textarea, select, button, fieldset, hr, table, td, th) { border-color: ${border}; }\n`;
    css += `:where(mark) { background-color: ${p.map('#ffff00', 'background')}; color: ${text}; }\n`;
    // Legacy background="tile.gif" attributes are almost always light paper textures that would
    // cover the darkened bgcolor (e.g. paulgraham.com).
    css += `:is(body, table, tr, td, th)[background] { background-image: none !important; }\n`;
    if (imageFilter) {
      css += `:where(img, picture, svg image, input[type="image"]) { filter: ${imageFilter}; }\n`;
    }
    if (appearance.imageInversion) {
      css += `img[${ATTR_INVERT}] { filter: invert(1) hue-rotate(180deg)${imageFilter ? ' ' + imageFilter : ''} !important; }\n`;
    }
    for (const [token, prop] of INLINE_PROPS) {
      css += `[${ATTR_INLINE}~="${token}"] { ${prop}: var(--nyx-i-${token}) !important; }\n`;
    }
    css += `[${ATTR_DIM}]:not(img) { background-color: var(${DIM_VAR}) !important; background-blend-mode: multiply !important; }\n`;
    css += `img[${ATTR_DIM}] { filter: brightness(0.3) !important; }\n`;
    css += `[${ATTR_FIX}] { color: var(${FIX_VAR}) !important; -webkit-text-fill-color: var(${FIX_VAR}) !important; }\n`;
    return css;
  }

  /** Strong temporary colors used until the page's styles have been processed (avoids a white flash). */
  private loadingCss(): string {
    const { background, text } = this.config.theme;
    return `html, body { background-color: ${background} !important; color: ${text} !important; }`;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const doc = this.doc;
    if (doc.readyState === 'loading') {
      this.loadingEl = doc.createElement('style');
      this.loadingEl.className = STYLE_CLASS;
      this.loadingEl.dataset.nyx = 'loading';
      this.loadingEl.textContent = this.loadingCss();
      (doc.head ?? doc.documentElement).appendChild(this.loadingEl);
    }
    this.attachRoot(doc);
    doc.addEventListener('load', this.onLoadCapture, true);
    this.pollTimer = this.win.setInterval(() => this.pollSheets(), 1000);
    const finishLoading = () => {
      if (!this.running) return;
      this.syncAll();
      this.loadingEl?.remove();
      this.loadingEl = null;
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', finishLoading, { once: true });
    else finishLoading();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const o of this.observers.values()) o.disconnect();
    this.observers.clear();
    for (const r of this.roots.values()) r.unmount();
    this.roots.clear();
    this.loadingEl?.remove();
    this.loadingEl = null;
    if (this.pollTimer !== null) this.win.clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.doc.removeEventListener('load', this.onLoadCapture, true);
    for (const el of Array.from(this.doc.querySelectorAll(`[${ATTR_INLINE}]`))) {
      el.removeAttribute(ATTR_INLINE);
      for (const [token] of INLINE_PROPS) (el as HTMLElement).style.removeProperty(`--nyx-i-${token}`);
    }
    // Role copies of inline custom properties.
    for (const el of Array.from(this.doc.querySelectorAll('[style*="--nyx-"]'))) {
      const style = (el as HTMLElement).style;
      const ours: string[] = [];
      for (let k = 0; k < style.length; k++) if (style[k].startsWith('--nyx-')) ours.push(style[k]);
      for (const name of ours) style.removeProperty(name);
    }
    for (const el of Array.from(this.doc.querySelectorAll(`[${ATTR_INVERT}], img[${ATTR_DIM}]`))) {
      el.removeAttribute(ATTR_INVERT);
      el.removeAttribute(ATTR_DIM);
    }
    this.images.reset();
    this.contrast.reset();
    this.pendingHosts.clear();
  }

  update(config: EngineConfig): void {
    this.config = config;
    this.palette = this.makePalette(config);
    if (!this.running) return;
    if (this.loadingEl) this.loadingEl.textContent = this.loadingCss();
    for (const r of this.roots.values()) r.refresh();
    for (const r of this.roots.values()) {
      for (const el of Array.from(r.root.querySelectorAll('[style]'))) r.processInline(el);
      r.renderAttributes();
    }
    // Fixes were computed for the previous theme.
    this.contrast.reset();
    for (const r of this.roots.values()) {
      for (const el of Array.from(r.root.querySelectorAll('*'))) if (el.localName !== 'img') this.contrast.observe(el);
    }
    if (!config.appearance.imageInversion) {
      for (const el of Array.from(this.doc.querySelectorAll(`[${ATTR_INVERT}]`))) el.removeAttribute(ATTR_INVERT);
    } else this.images.reapply();
  }

  /** Temporarily disables our styles, runs `fn`, and re-enables them (used for measurements). */
  withoutStyles<T>(fn: () => T): T {
    const els = Array.from(this.doc.querySelectorAll<HTMLStyleElement>(`style.${STYLE_CLASS}`));
    const sheets = els.map((e) => e.sheet).filter((s): s is CSSStyleSheet => !!s);
    sheets.forEach((s) => (s.disabled = true));
    const inline = Array.from(this.doc.querySelectorAll(`[${ATTR_INLINE}]`));
    const tokens = inline.map((el) => el.getAttribute(ATTR_INLINE));
    inline.forEach((el) => el.removeAttribute(ATTR_INLINE));
    try {
      return fn();
    } finally {
      sheets.forEach((s) => (s.disabled = false));
      inline.forEach((el, i) => el.setAttribute(ATTR_INLINE, tokens[i] ?? ''));
    }
  }

  attachRoot(root: Document | ShadowRoot): void {
    if (this.roots.has(root)) return;
    const styler = new RootStyler(root, this);
    this.roots.set(root, styler);
    styler.mount();
    styler.syncSheets();
    if (root instanceof Document ? root.body || root.documentElement : root) {
      styler.scan(root instanceof Document ? root.documentElement : root);
    }
    const observer = new this.win.MutationObserver((records) => this.onMutations(styler, records));
    observer.observe(root instanceof Document ? root.documentElement : root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: WATCHED_ATTRS,
    });
    this.observers.set(root, observer);
  }

  private onMutations(styler: RootStyler, records: MutationRecord[]): void {
    if (!this.running) return;
    let sheetsChanged = false;
    let attrsChanged = false;
    for (const rec of records) {
      if (rec.type === 'attributes') {
        const el = rec.target as Element;
        if (rec.attributeName === 'style') styler.processInline(el);
        else if (styler.processAttributes(el)) attrsChanged = true;
        continue;
      }
      if (rec.type === 'characterData') {
        const parent = rec.target.parentNode as Element | null;
        if (parent && parent.localName === 'style') sheetsChanged = true;
        else if (parent && isElement(parent)) this.contrast.touch(parent);
        continue;
      }
      const target = rec.target as Element;
      if (isElement(target) && Array.from(rec.addedNodes).some((n) => n.nodeType === 3)) this.contrast.touch(target);
      if (target.localName === 'style' && !target.classList?.contains(STYLE_CLASS)) sheetsChanged = true;
      for (const node of Array.from(rec.addedNodes)) {
        if (!isElement(node)) continue;
        if (node.classList.contains(STYLE_CLASS)) continue;
        const name = node.localName;
        if (name === 'style' || name === 'link') sheetsChanged = true;
        else if (node.querySelector?.('style, link[rel~="stylesheet"]')) sheetsChanged = true;
        styler.scan(node);
      }
      for (const node of Array.from(rec.removedNodes)) {
        if (!isElement(node)) continue;
        if (node.localName === 'style' || node.localName === 'link') sheetsChanged = true;
        // Our base style got removed by the page (e.g. a framework re-rendering <head>).
        if (node.classList.contains(STYLE_CLASS)) sheetsChanged = true;
      }
    }
    if (attrsChanged) styler.renderAttributes();
    if (sheetsChanged) this.queueSheetSync();
  }

  queueSheetSync(): void {
    if (this.sheetSyncQueued) return;
    this.sheetSyncQueued = true;
    queueMicrotask(() => {
      this.sheetSyncQueued = false;
      if (this.running) this.syncAll();
    });
  }

  syncAll(): void {
    for (const r of this.roots.values()) {
      if (!r.root.isConnected && !(r.root instanceof Document)) continue;
      r.mount();
      r.syncSheets();
    }
  }

  /** Catches CSSOM changes (insertRule from CSS-in-JS libraries) that do not cause DOM mutations. */
  private pollSheets(): void {
    if (!this.running) return;
    for (const el of this.pendingHosts) {
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) {
        this.pendingHosts.delete(el);
        this.attachRoot(sr);
      } else if (!el.isConnected) this.pendingHosts.delete(el);
    }
    this.syncAll();
  }
}

