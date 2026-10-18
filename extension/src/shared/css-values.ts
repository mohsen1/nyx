// Rewrites CSS declaration values: color tokens are mapped through the palette, var()
// references are pointed at role-specific copies of custom properties, and relative url()s
// are made absolute so the rewritten rule still works from our own <style> element.

import { NAMED_COLOR_NAMES } from './color';
import type { ColorRole, Palette } from './palette';

/** CSS properties whose colors we transform, with the role that decides how. */
export const PROPERTY_ROLES: Record<string, ColorRole> = {
  'background': 'background',
  'background-color': 'background',
  'background-image': 'background',
  'color': 'text',
  'caret-color': 'text',
  '-webkit-text-fill-color': 'text',
  '-webkit-text-stroke-color': 'text',
  '-webkit-tap-highlight-color': 'background',
  'text-decoration': 'text',
  'text-decoration-color': 'text',
  'text-emphasis-color': 'text',
  'fill': 'text',
  'stroke': 'text',
  'stop-color': 'background',
  'flood-color': 'background',
  'lighting-color': 'background',
  'border': 'border',
  'border-color': 'border',
  'border-top': 'border',
  'border-right': 'border',
  'border-bottom': 'border',
  'border-left': 'border',
  'border-block': 'border',
  'border-inline': 'border',
  'border-top-color': 'border',
  'border-right-color': 'border',
  'border-bottom-color': 'border',
  'border-left-color': 'border',
  'border-block-color': 'border',
  'border-inline-color': 'border',
  'border-block-start-color': 'border',
  'border-block-end-color': 'border',
  'border-inline-start-color': 'border',
  'border-inline-end-color': 'border',
  'outline': 'border',
  'outline-color': 'border',
  'column-rule': 'border',
  'column-rule-color': 'border',
  'scrollbar-color': 'border',
  'accent-color': 'background',
  'box-shadow': 'shadow',
  'text-shadow': 'shadow',
};

/** Shorthands whose longhands browsers leave empty when the shorthand contains var(). */
export const SHORTHANDS_WITH_COLOR = [
  'background',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-block',
  'border-inline',
  'border-color',
  'outline',
  'column-rule',
  'text-decoration',
];

export const ROLE_PREFIX: Record<ColorRole, string> = {
  background: '--nyx-b',
  text: '--nyx-t',
  border: '--nyx-o',
  shadow: '--nyx-s',
};

const NAMED = new Set(NAMED_COLOR_NAMES);
const IDENT_START = /[a-zA-Z_-]/;
const IDENT_CHAR = /[a-zA-Z0-9_-]/;
const COLOR_FUNCS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'oklch', 'oklab', 'color']);

export interface RewriteContext {
  palette: Palette;
  /** Base URL for resolving relative url()s; null leaves them untouched. */
  baseUrl: string | null;
  /** Drop url() images (the "hide background images" option). */
  hideImages?: boolean;
}

/** Finds the index of the parenthesis that closes the one opened just before `start`. */
function closeParen(s: string, start: number): number {
  let depth = 1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'") {
      const end = s.indexOf(ch, i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return -1;
}

function absolutize(url: string, base: string | null): string {
  if (!base) return url;
  const trimmed = url.trim();
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : '';
  const inner = quote ? trimmed.slice(1, -1) : trimmed;
  if (/^(data|blob|https?|about):/i.test(inner) || inner.startsWith('#')) return url;
  try {
    return JSON.stringify(new URL(inner, base).href);
  } catch {
    return url;
  }
}

/**
 * Rewrites one declaration value for a role.
 * Returns the new value, or null when nothing in it needed to change.
 */
export function rewriteValue(value: string, role: ColorRole, ctx: RewriteContext): string | null {
  let out = '';
  let changed = false;
  let i = 0;
  const s = value;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"' || ch === "'") {
      const end = s.indexOf(ch, i + 1);
      const stop = end < 0 ? s.length : end + 1;
      out += s.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '#') {
      const m = /^#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])/.exec(s.slice(i));
      if (m) {
        const mapped = ctx.palette.map(m[0], role);
        if (mapped) {
          out += mapped;
          changed = true;
          i += m[0].length;
          continue;
        }
      }
      out += ch;
      i++;
      continue;
    }
    if (IDENT_START.test(ch) && (i === 0 || !IDENT_CHAR.test(s[i - 1]))) {
      let j = i + 1;
      while (j < s.length && IDENT_CHAR.test(s[j])) j++;
      const ident = s.slice(i, j);
      const lower = ident.toLowerCase();
      if (s[j] === '(') {
        const end = closeParen(s, j + 1);
        if (end < 0) {
          out += s.slice(i);
          break;
        }
        const inner = s.slice(j + 1, end);
        if (lower === 'url') {
          if (ctx.hideImages) {
            out += 'none';
            changed = true;
          } else {
            const abs = absolutize(inner, ctx.baseUrl);
            if (abs !== inner) changed = true;
            out += `url(${abs})`;
          }
        } else if (lower === 'var') {
          out += rewriteVar(inner, role, ctx);
          changed = true;
        } else if (COLOR_FUNCS.has(lower) && !inner.includes('var(')) {
          const mapped = ctx.palette.map(s.slice(i, end + 1), role);
          if (mapped) {
            out += mapped;
            changed = true;
          } else out += s.slice(i, end + 1);
        } else {
          // Generic function (gradients, color-mix(), calc()…): rewrite its arguments.
          const rewritten = rewriteValue(inner, role, ctx);
          if (rewritten !== null) changed = true;
          out += `${ident}(${rewritten ?? inner})`;
        }
        i = end + 1;
        continue;
      }
      if (NAMED.has(lower) && lower !== 'transparent') {
        const mapped = ctx.palette.map(lower, role);
        if (mapped) {
          out += mapped;
          changed = true;
          i = j;
          continue;
        }
      }
      out += ident;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return changed ? out : null;
}

/** `var(--x, fallback)` → `var(--nyx-t--x, var(--x, <fallback rewritten>))`. */
function rewriteVar(inner: string, role: ColorRole, ctx: RewriteContext): string {
  const comma = inner.indexOf(',');
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  if (!name.startsWith('--')) return `var(${inner})`;
  let fallback = '';
  if (comma >= 0) {
    const fb = inner.slice(comma + 1);
    fallback = `,${rewriteValue(fb, role, ctx) ?? fb}`;
  }
  return `var(${roleVarName(name, role)}, var(${name}${fallback}))`;
}

export function roleVarName(name: string, role: ColorRole): string {
  return `${ROLE_PREFIX[role]}${name}`;
}

/** Whether a custom property value may hold a color (and so needs role-specific copies). */
export function mayContainColor(value: string): boolean {
  if (value.includes('var(') || value.includes('#')) return true;
  if (/\b(rgba?|hsla?|hwb|oklch|oklab|color|color-mix|light-dark)\(/i.test(value)) return true;
  const idents = value.toLowerCase().match(/[a-z]+/g);
  return !!idents && idents.some((w) => NAMED.has(w) && w !== 'transparent');
}

const ALL_ROLES: ColorRole[] = ['background', 'text', 'border', 'shadow'];

/**
 * For a custom property declaration, returns `[name, value]` pairs defining its role-specific copies.
 */
export function rewriteCustomProperty(name: string, value: string, ctx: RewriteContext): Array<[string, string]> {
  if (!mayContainColor(value)) return [];
  const out: Array<[string, string]> = [];
  for (const role of ALL_ROLES) {
    const v = rewriteValue(value, role, { ...ctx, hideImages: false });
    if (v !== null) out.push([roleVarName(name, role), v]);
  }
  return out;
}
