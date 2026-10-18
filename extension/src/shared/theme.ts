// Theme model and the share-link codec.
//
// The share-link format mirrors the one used by Noir's theme sharing
// (`https://getnoir.app/theme?name=…&bg=…&text=…&imageBrightness=…`, see
// docs/reverse-engineering/evidence.md, E4), so links can be exchanged in both directions.

import { normalizeHex } from './color';
import builtInThemes from './builtin-themes.json';

export interface Theme {
  id: string;
  name: string;
  /** Page background, `#rrggbb`. */
  background: string;
  /** Body text, `#rrggbb`. */
  text: string;
  /** Brightness multiplier applied to images and videos, 0.3 .. 1. */
  imageBrightness: number;
  /** Grayscale amount applied to images and videos, 0 .. 1. */
  grayscale: number;
  builtIn?: boolean;
  collection?: string;
}

export const DEFAULT_THEME_ID = 'dark';

export const SHARE_BASE_URL = 'https://mohsen1.github.io/nyx/theme/';
export const NOIR_SHARE_HOST = 'getnoir.app';

/** Built-in theme library (colors are original to this project). Shared with the Apple app. */
export const BUILT_IN_THEMES: readonly Theme[] = (builtInThemes as Omit<Theme, 'builtIn'>[]).map((th) => ({ ...th, builtIn: true }));

export function findTheme(themes: readonly Theme[], id: string | null | undefined): Theme {
  return (
    themes.find((th) => th.id === id) ??
    themes.find((th) => th.id === DEFAULT_THEME_ID) ??
    BUILT_IN_THEMES[0]
  );
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function parseUnit(value: string | null, fallback: number, lo = 0, hi = 1): number {
  if (value === null || value.trim() === '') return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === 'yes' || v === 'on') return hi;
  if (v === 'false' || v === 'no' || v === 'off') return lo;
  let n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  if (v.endsWith('%') || n > 1) n /= 100; // accept "93" and "93%"
  return clamp(n, lo, hi);
}

export class ThemeLinkError extends Error {}

/**
 * Parses a theme share link. Accepts this project's links, Noir links
 * (`https://getnoir.app/theme?…` and `noir://theme?…`), `nyx://theme?…`, or a bare query string.
 */
export function parseThemeLink(link: string): Omit<Theme, 'id'> {
  const raw = link.trim();
  if (!raw) throw new ThemeLinkError('The link is empty.');
  let query: string;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ThemeLinkError('That does not look like a theme link.');
    }
    const custom = url.protocol === 'noir:' || url.protocol === 'nyx:';
    // In custom schemes "theme" is the host (noir://theme?…); some parsers report it in the pathname.
    const route = custom ? `${url.host}${url.pathname}`.replace(/^\/+/, '') : url.pathname;
    if (custom ? !/^theme\/?$/.test(route) : !/\/theme\/?$/.test(route)) {
      throw new ThemeLinkError('That link does not point to a theme.');
    }
    query = url.search;
  } else {
    query = raw.startsWith('?') ? raw : `?${raw}`;
  }
  const p = new URLSearchParams(query);
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = p.get(k);
      if (v !== null) return v;
    }
    return null;
  };
  const bgRaw = get('bg', 'background', 'backgroundColor');
  const textRaw = get('text', 'fg', 'textColor', 'foreground');
  const background = bgRaw ? normalizeHex(bgRaw) : null;
  const text = textRaw ? normalizeHex(textRaw) : null;
  if (!background || !text) throw new ThemeLinkError('The link is missing a valid background or text color.');
  const name = (get('name', 'title') ?? '').trim() || 'Imported Theme';
  return {
    name: name.slice(0, 80),
    background,
    text,
    imageBrightness: parseUnit(get('imageBrightness', 'brightness', 'image_brightness'), 1, 0.3, 1),
    grayscale: parseUnit(get('imageGrayscale', 'grayscale', 'greyscale'), 0, 0, 1),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Builds the query part of a share link, in Noir's parameter order and spelling. */
export function themeQuery(theme: Pick<Theme, 'name' | 'background' | 'text' | 'imageBrightness' | 'grayscale'>): string {
  const p = new URLSearchParams();
  p.set('name', theme.name);
  p.set('bg', theme.background.replace('#', '').toUpperCase());
  p.set('text', theme.text.replace('#', '').toUpperCase());
  p.set('imageBrightness', String(round2(theme.imageBrightness)));
  if (theme.grayscale > 0) p.set('imageGrayscale', String(round2(theme.grayscale)));
  // URLSearchParams encodes spaces as "+"; use %20 so the link matches Noir's links byte for byte.
  return p.toString().replace(/\+/g, '%20');
}

export function themeShareLink(theme: Theme, base: 'nyx' | 'noir' = 'nyx'): string {
  const prefix = base === 'noir' ? `https://${NOIR_SHARE_HOST}/theme` : SHARE_BASE_URL;
  return `${prefix}?${themeQuery(theme)}`;
}

export function newThemeId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
