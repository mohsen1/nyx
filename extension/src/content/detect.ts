// Detects pages that already render dark (sites with their own dark mode), so they are left alone.

import { composite, parseColor, relativeLuminance, type RGBA } from '../shared/color';

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const DARK_CANVAS: RGBA = { r: 18, g: 18, b: 18, a: 1 };

function opaque(c: RGBA | null): c is RGBA {
  return !!c && c.a > 0.01;
}

/** The color painted behind the page: html background, else body background, else the canvas. */
export function canvasColor(doc: Document): RGBA {
  const win = doc.defaultView!;
  const html = win.getComputedStyle(doc.documentElement);
  const scheme = html.colorScheme || '';
  const base = /\bdark\b/.test(scheme) && !/\blight\b/.test(scheme) ? DARK_CANVAS : WHITE;
  const htmlBg = parseColor(html.backgroundColor);
  if (opaque(htmlBg)) return composite(htmlBg, base);
  if (doc.body) {
    const bodyBg = parseColor(win.getComputedStyle(doc.body).backgroundColor);
    if (opaque(bodyBg)) return composite(bodyBg, base);
  }
  return base;
}

/** The background color visible behind `el`, walking up the ancestors. */
export function effectiveBackground(el: Element | null, fallback: RGBA): RGBA {
  const layers: RGBA[] = [];
  const win = el?.ownerDocument.defaultView;
  for (let node = el; node && win; node = node.parentElement) {
    if (node.localName === 'html' || node.localName === 'body') break;
    const c = parseColor(win.getComputedStyle(node).backgroundColor);
    if (opaque(c)) {
      layers.push(c);
      if (c.a >= 0.99) break;
    }
  }
  let out = fallback;
  for (let i = layers.length - 1; i >= 0; i--) out = composite(layers[i], out);
  return out;
}

export interface DarkModeReport {
  dark: boolean;
  canvasLuminance: number;
  darkSamples: number;
  samples: number;
}

/**
 * Samples the rendered page and reports whether it is already predominantly dark.
 * Call with our own styles disabled.
 */
export function detectDarkPage(doc: Document): DarkModeReport {
  const win = doc.defaultView!;
  const canvas = canvasColor(doc);
  const canvasLum = relativeLuminance(canvas);
  const w = win.innerWidth || doc.documentElement.clientWidth;
  const h = win.innerHeight || doc.documentElement.clientHeight;
  let samples = 0;
  let darkSamples = 0;
  let darkTextOnDark = 0;
  if (w > 0 && h > 0 && typeof doc.elementFromPoint === 'function') {
    for (const fx of [0.2, 0.5, 0.8]) {
      for (const fy of [0.15, 0.5, 0.85]) {
        const el = doc.elementFromPoint(w * fx, h * fy);
        if (!el) continue;
        samples++;
        if (relativeLuminance(effectiveBackground(el, canvas)) < 0.18) {
          darkSamples++;
          const text = parseColor(win.getComputedStyle(el).color);
          if (text && relativeLuminance(text) < 0.1) darkTextOnDark++;
        }
      }
    }
  }
  let dark: boolean;
  if (samples >= 3) dark = darkSamples / samples >= 0.6 && (canvasLum < 0.3 || darkSamples / samples >= 0.8);
  else dark = canvasLum < 0.18;
  // Dark backgrounds holding dark text are a page that is still loading or broken, not a dark mode.
  if (dark && darkSamples > 0 && darkTextOnDark / darkSamples > 0.5) dark = false;
  return { dark, canvasLuminance: canvasLum, darkSamples, samples };
}
