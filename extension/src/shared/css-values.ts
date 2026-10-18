// Rewrites CSS declaration values: color tokens are mapped through the palette, var()
// references are pointed at role-specific copies of custom properties, and relative url()s
// are made absolute so the rewritten rule still works from our own <style> element.

import { NAMED_COLOR_NAMES, parseColor } from './color';
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
  /** Names of custom properties seen holding a channel list (`249, 249, 248`); shared across sheets. */
  channelVars?: Set<string>;
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
        } else if (COLOR_FUNCS.has(lower) && isChannelVarCall(inner)) {
          // rgb(var(--grey-50)) / rgba(var(--brand-rgb), .5) / hsl(var(--background) / 50%):
          // the variable holds bare channels, so point it at a channel copy.
          const m = CHANNEL_VAR.exec(inner)!;
          // The alpha may itself be a variable (Bootstrap: rgba(var(--bs-bg-rgb), var(--bs-bg-opacity))).
          const rest = m[2] ? rewriteValue(m[2], role, ctx) ?? m[2] : '';
          out += `${ident}(var(${channelVarName(m[1], role)}, var(${m[1]}))${rest})`;
          changed = true;
        } else if (COLOR_FUNCS.has(lower) && mapWithVarAlpha(lower, inner, role, ctx) !== null) {
          // Tailwind: rgb(255 255 255 / var(--tw-bg-opacity)). The color is literal; only alpha varies.
          out += mapWithVarAlpha(lower, inner, role, ctx);
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

/**
 * A color function with literal channels and a var()/calc() alpha, e.g. `rgb(255 255 255 /
 * var(--tw-bg-opacity))` or `rgba(0, 0, 0, var(--a))`: maps the channels, keeps the alpha.
 */
function mapWithVarAlpha(fn: string, inner: string, role: ColorRole, ctx: RewriteContext): string | null {
  let channels: string;
  let alpha: string;
  const slash = inner.lastIndexOf('/');
  if (slash >= 0) {
    channels = inner.slice(0, slash);
    alpha = inner.slice(slash + 1);
  } else {
    const parts = inner.split(',');
    if (parts.length !== 4) return null;
    channels = parts.slice(0, 3).join(',');
    alpha = parts[3];
  }
  if (channels.includes('(') || !alpha.includes('(')) return null;
  const base = fn.replace(/a$/, '');
  const mapped = ctx.palette.map(`${base}(${channels})`, role);
  const c = mapped ? parseColor(mapped) : null;
  if (!c) return null;
  const a = rewriteValue(alpha, role, ctx) ?? alpha;
  return `rgb(${c.r} ${c.g} ${c.b} / ${a.trim()})`;
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

/** Commas outside any parentheses. */
function topLevelCommas(s: string): number {
  let depth = 0, n = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) n++;
  }
  return n;
}

/**
 * `var(--x)` optionally followed by one alpha (`, a` or `/ a`): the variable holds all channels.
 * `var(--h), var(--s), var(--l)` (three separate channels) is not this.
 */
function isChannelVarCall(inner: string): boolean {
  const m = CHANNEL_VAR.exec(inner);
  if (!m) return false;
  const rest = m[2].trim();
  if (!rest) return true;
  if (rest.startsWith('/')) return topLevelCommas(rest) === 0;
  return topLevelCommas(rest) === 1; // just ", alpha"
}

/** Names that conventionally hold channel lists: --bs-primary-rgb, --accent-hsl, --gray-channel. */
const CHANNEL_NAME = /(rgb|hsl|channels?)(-|$)/i;

/** A color function whose channels all come from one variable, plus whatever follows (alpha). */
const CHANNEL_VAR = /^\s*var\(\s*(--[a-zA-Z0-9_-]+)\s*\)(\s*(?:[,/].*)?)$/s;

/**
 * Copies of channel-list variables (`--grey-50: 249, 249, 248`) get their own prefix, because they
 * are only valid inside rgb()/hsl(). A triplet used anywhere else (shadow offsets, grid tracks)
 * never reads them.
 */
export function channelVarName(name: string, role: ColorRole): string {
  return `${ROLE_PREFIX[role]}c${name}`;
}

const N = '(\\d{1,3}(?:\\.\\d+)?)';
const RGB_CHANNELS = new RegExp(`^\\s*${N}\\s*(,|\\s)\\s*${N}\\s*\\2\\s*${N}\\s*$`);
const HSL_CHANNELS = new RegExp(`^\\s*${N}(?:deg)?\\s*(,|\\s)\\s*${N}%\\s*\\2\\s*${N}%\\s*$`);

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s * 100, l * 100];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Maps a bare channel list (`249, 249, 248` or `210 40% 98%`) for a role, keeping its format. */
export function rewriteChannels(value: string, role: ColorRole, palette: Palette): string | null {
  let m = RGB_CHANNELS.exec(value);
  if (m) {
    const [r, g, b] = [m[1], m[3], m[4]].map(Number);
    if (r > 255 || g > 255 || b > 255) return null;
    const mapped = palette.map(`rgb(${r}, ${g}, ${b})`, role);
    const c = mapped ? parseColor(mapped) : null;
    if (!c) return null;
    const sep = m[2] === ',' ? ', ' : ' ';
    return [c.r, c.g, c.b].join(sep);
  }
  m = HSL_CHANNELS.exec(value);
  if (m) {
    const [h, sat, l] = [m[1], m[3], m[4]].map(Number);
    if (h > 360 || sat > 100 || l > 100) return null;
    const mapped = palette.map(`hsl(${h}, ${sat}%, ${l}%)`, role);
    const c = mapped ? parseColor(mapped) : null;
    if (!c) return null;
    const [H, S, L] = rgbToHsl(c.r, c.g, c.b);
    const sep = m[2] === ',' ? ', ' : ' ';
    return `${round1(H)}${sep}${round1(S)}%${sep}${round1(L)}%`;
  }
  return null;
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
  const out: Array<[string, string]> = [];
  if (mayContainColor(value)) {
    for (const role of ALL_ROLES) {
      const v = rewriteValue(value, role, { ...ctx, hideImages: false });
      if (v !== null) out.push([roleVarName(name, role), v]);
    }
  }
  // Channel lists, and aliases that may point at one (`--body-bg-rgb: var(--grey-50-rgb)`).
  // Design systems have thousands of aliases, so only those that look like channel variables
  // or point at a known channel list get copies.
  const alias = /^\s*var\(\s*(--[a-zA-Z0-9_-]+)\s*\)\s*$/.exec(value);
  if (alias) {
    if (!CHANNEL_NAME.test(name) && !CHANNEL_NAME.test(alias[1]) && !ctx.channelVars?.has(alias[1])) return out;
    ctx.channelVars?.add(name);
    for (const role of ALL_ROLES) out.push([channelVarName(name, role), `var(${channelVarName(alias[1], role)}, var(${alias[1]}))`]);
    return out;
  }
  for (const role of ALL_ROLES) {
    const v = rewriteChannels(value, role, ctx.palette);
    if (v === null) break;
    ctx.channelVars?.add(name);
    out.push([channelVarName(name, role), v]);
  }
  return out;
}
