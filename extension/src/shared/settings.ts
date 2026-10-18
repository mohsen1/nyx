// Settings model and the pure decision logic that says whether, and how, a page is darkened.

import { BUILT_IN_THEMES, DEFAULT_THEME_ID, findTheme, type Theme } from './theme';

/** Global status. "auto" follows the system appearance or the schedule (see `autoTrigger`). */
export type GlobalMode = 'auto' | 'on' | 'off';
/** Per-website status. "default" defers to the global status. */
export type SiteMode = 'default' | GlobalMode;
export type AutoTrigger = 'system' | 'schedule';
/** Reports open a pre-filled GitHub issue; nothing is ever sent without the user submitting it. */
export type DarkModeReporting = 'ask' | 'never';

export interface Schedule {
  /** "HH:MM", local time at which darkening starts. */
  start: string;
  /** "HH:MM", local time at which darkening ends. */
  end: string;
}

export interface AppearanceOptions {
  /** Keep (and adapt) the page's accent colors. Off maps every color onto the theme's two colors. */
  dynamicColors: boolean;
  /** Show CSS background images. */
  backgroundImages: boolean;
  /** Invert dark, transparent images such as logos and icons so they stay visible. */
  imageInversion: boolean;
}

export interface SiteSettings {
  mode: SiteMode;
  /** Theme for this site; null uses the default theme. */
  themeId: string | null;
  /** Epoch ms. Darkening is paused on this site until then. */
  pausedUntil: number | null;
  /** Apply our dark style even when the site appears to have its own dark mode. */
  ignoreBuiltInDarkMode: boolean;
  /** Advanced appearance overrides; undefined values use the global defaults. */
  appearance: Partial<AppearanceOptions>;
  updatedAt: number;
}

export interface GlobalSettings {
  mode: GlobalMode;
  autoTrigger: AutoTrigger;
  schedule: Schedule;
  defaultThemeId: string;
  /** Epoch ms. Darkening is paused everywhere until then. */
  pausedUntil: number | null;
  /** Shows the advanced appearance options in the toolbar menu. */
  advancedAppearanceEnabled: boolean;
  appearance: AppearanceOptions;
  /** What to do when a site's built-in dark mode was detected incorrectly. */
  darkModeReporting: DarkModeReporting;
  /** Order of themes when cycling with the keyboard shortcut; empty means all themes. */
  cycleThemeIds: string[];
  updatedAt: number;
}

export interface Settings {
  version: 1;
  global: GlobalSettings;
  sites: Record<string, SiteSettings>;
  customThemes: Theme[];
  /** Built-in themes the user edited; keyed by built-in id. Reset deletes the entry. */
  themeOverrides: Record<string, Theme>;
  /** Built-in themes hidden from the list. */
  hiddenThemeIds: string[];
}

export const DEFAULT_APPEARANCE: AppearanceOptions = {
  dynamicColors: true,
  backgroundImages: true,
  imageInversion: true,
};

export function defaultSettings(now = Date.now()): Settings {
  return {
    version: 1,
    global: {
      mode: 'auto',
      autoTrigger: 'system',
      schedule: { start: '19:00', end: '07:00' },
      defaultThemeId: DEFAULT_THEME_ID,
      pausedUntil: null,
      advancedAppearanceEnabled: false,
      appearance: { ...DEFAULT_APPEARANCE },
      darkModeReporting: 'ask',
      cycleThemeIds: [],
      updatedAt: now,
    },
    sites: {},
    customThemes: [],
    themeOverrides: {},
    hiddenThemeIds: [],
  };
}

export function defaultSiteSettings(now = Date.now()): SiteSettings {
  return {
    mode: 'default',
    themeId: null,
    pausedUntil: null,
    ignoreBuiltInDarkMode: false,
    appearance: {},
    updatedAt: now,
  };
}

/** Normalizes untrusted/partial data (storage, imports, sync) into a complete Settings object. */
export function normalizeSettings(input: unknown, now = Date.now()): Settings {
  const base = defaultSettings(now);
  if (!input || typeof input !== 'object') return base;
  const src = input as Partial<Settings>;
  const g = (src.global ?? {}) as Partial<GlobalSettings>;
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  const time = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  const appearance = (a: unknown, fallback: AppearanceOptions): AppearanceOptions => {
    const o = (a ?? {}) as Partial<AppearanceOptions>;
    return {
      dynamicColors: bool(o.dynamicColors, fallback.dynamicColors),
      backgroundImages: bool(o.backgroundImages, fallback.backgroundImages),
      imageInversion: bool(o.imageInversion, fallback.imageInversion),
    };
  };

  const global: GlobalSettings = {
    mode: oneOf(g.mode, ['auto', 'on', 'off'] as const, base.global.mode),
    autoTrigger: oneOf(g.autoTrigger, ['system', 'schedule'] as const, base.global.autoTrigger),
    schedule: {
      start: time(g.schedule?.start, base.global.schedule.start),
      end: time(g.schedule?.end, base.global.schedule.end),
    },
    defaultThemeId: typeof g.defaultThemeId === 'string' ? g.defaultThemeId : base.global.defaultThemeId,
    pausedUntil: num(g.pausedUntil),
    advancedAppearanceEnabled: bool(g.advancedAppearanceEnabled, false),
    appearance: appearance(g.appearance, DEFAULT_APPEARANCE),
    darkModeReporting: oneOf(g.darkModeReporting, ['ask', 'never'] as const, 'ask'),
    cycleThemeIds: Array.isArray(g.cycleThemeIds) ? g.cycleThemeIds.filter((x) => typeof x === 'string') : [],
    updatedAt: num(g.updatedAt) ?? now,
  };

  const sites: Record<string, SiteSettings> = {};
  if (src.sites && typeof src.sites === 'object') {
    for (const [host, raw] of Object.entries(src.sites)) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Partial<SiteSettings>;
      const ap = (s.appearance ?? {}) as Partial<AppearanceOptions>;
      const site: SiteSettings = {
        mode: oneOf(s.mode, ['default', 'auto', 'on', 'off'] as const, 'default'),
        themeId: typeof s.themeId === 'string' ? s.themeId : null,
        pausedUntil: num(s.pausedUntil),
        ignoreBuiltInDarkMode: bool(s.ignoreBuiltInDarkMode, false),
        appearance: {},
        updatedAt: num(s.updatedAt) ?? now,
      };
      for (const k of ['dynamicColors', 'backgroundImages', 'imageInversion'] as const) {
        if (typeof ap[k] === 'boolean') site.appearance[k] = ap[k];
      }
      sites[normalizeHost(host)] = site;
    }
  }

  const themes = (list: unknown): Theme[] =>
    Array.isArray(list)
      ? list
          .filter((x): x is Theme => !!x && typeof x === 'object' && typeof (x as Theme).id === 'string')
          .map((x) => ({
            id: x.id,
            name: String(x.name ?? 'Untitled'),
            background: typeof x.background === 'string' ? x.background : '#1c1c1e',
            text: typeof x.text === 'string' ? x.text : '#e3e3e6',
            imageBrightness: num(x.imageBrightness) ?? 1,
            grayscale: num(x.grayscale) ?? 0,
            ...(x.collection ? { collection: String(x.collection) } : {}),
          }))
      : [];

  const overrides: Record<string, Theme> = {};
  if (src.themeOverrides && typeof src.themeOverrides === 'object') {
    for (const th of themes(Object.values(src.themeOverrides))) {
      if (BUILT_IN_THEMES.some((b) => b.id === th.id)) overrides[th.id] = { ...th, builtIn: true };
    }
  }

  return {
    version: 1,
    global,
    sites,
    customThemes: themes(src.customThemes),
    themeOverrides: overrides,
    hiddenThemeIds: Array.isArray(src.hiddenThemeIds) ? src.hiddenThemeIds.filter((x) => typeof x === 'string') : [],
  };
}

/** Site key used for per-website settings: lower-cased hostname without a leading "www.". */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

export function siteKeyForUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return 'file://';
    if (!/^https?:$/.test(u.protocol)) return null;
    return normalizeHost(u.hostname);
  } catch {
    return null;
  }
}

/** All themes in display order: built-ins (with user edits applied), then custom themes. */
export function allThemes(settings: Settings): Theme[] {
  const builtIns = BUILT_IN_THEMES.filter((th) => !settings.hiddenThemeIds.includes(th.id)).map(
    (th) => settings.themeOverrides[th.id] ?? th,
  );
  return [...builtIns, ...settings.customThemes];
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** True when `date` (local time) falls within the schedule. Handles schedules that cross midnight. */
export function isWithinSchedule(schedule: Schedule, date: Date): boolean {
  const now = date.getHours() * 60 + date.getMinutes();
  const start = minutes(schedule.start);
  const end = minutes(schedule.end);
  if (start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/**
 * "Until tomorrow": the next 06:00 local time that is at least an hour away.
 * Pausing late in the evening lasts the night; pausing at 2am lasts until morning.
 */
export function tomorrowMorning(from: Date): number {
  const d = new Date(from.getTime());
  d.setHours(6, 0, 0, 0);
  if (d.getTime() - from.getTime() < 60 * 60 * 1000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export type Reason =
  | 'global-off'
  | 'site-off'
  | 'global-paused'
  | 'site-paused'
  | 'system-light'
  | 'outside-schedule'
  | 'on';

export interface Decision {
  enabled: boolean;
  reason: Reason;
  /** The effective mode after resolving "default". */
  effectiveMode: GlobalMode;
  theme: Theme;
  appearance: AppearanceOptions;
  ignoreBuiltInDarkMode: boolean;
  siteKey: string | null;
}

export interface Environment {
  systemDark: boolean;
  now: Date;
}

export function resolveSite(settings: Settings, siteKey: string | null): SiteSettings {
  return (siteKey && settings.sites[siteKey]) || defaultSiteSettings(0);
}

/** Decides whether a page on `siteKey` should be darkened right now, and with which theme. */
export function decide(settings: Settings, siteKey: string | null, env: Environment): Decision {
  const g = settings.global;
  const site = resolveSite(settings, siteKey);
  const effectiveMode: GlobalMode = site.mode === 'default' ? g.mode : site.mode;
  const theme = findTheme(allThemes(settings), site.themeId ?? g.defaultThemeId);
  const appearance: AppearanceOptions = g.advancedAppearanceEnabled
    ? { ...g.appearance, ...site.appearance }
    : { ...DEFAULT_APPEARANCE };
  const base = { effectiveMode, theme, appearance, ignoreBuiltInDarkMode: site.ignoreBuiltInDarkMode, siteKey };
  const now = env.now.getTime();

  if (site.pausedUntil && site.pausedUntil > now) return { ...base, enabled: false, reason: 'site-paused' };
  if (g.pausedUntil && g.pausedUntil > now) return { ...base, enabled: false, reason: 'global-paused' };
  if (effectiveMode === 'off') {
    return { ...base, enabled: false, reason: site.mode === 'off' ? 'site-off' : 'global-off' };
  }
  if (effectiveMode === 'on') return { ...base, enabled: true, reason: 'on' };
  if (g.autoTrigger === 'schedule') {
    const inside = isWithinSchedule(g.schedule, env.now);
    return { ...base, enabled: inside, reason: inside ? 'on' : 'outside-schedule' };
  }
  return { ...base, enabled: env.systemDark, reason: env.systemDark ? 'on' : 'system-light' };
}

/** Returns a copy of `settings` with `patch` applied to one site (creating the entry if needed). */
export function updateSite(settings: Settings, siteKey: string, patch: Partial<SiteSettings>, now = Date.now()): Settings {
  const current = settings.sites[siteKey] ?? defaultSiteSettings(now);
  const next: SiteSettings = {
    ...current,
    ...patch,
    appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
    updatedAt: now,
  };
  // Entries reset to defaults are kept (with a fresh updatedAt) so the reset wins when syncing.
  return { ...settings, sites: { ...settings.sites, [siteKey]: next } };
}

/** Restores a website to the defaults. The entry is kept with a new updatedAt so the reset syncs. */
export function resetSite(settings: Settings, siteKey: string, now = Date.now()): Settings {
  return { ...settings, sites: { ...settings.sites, [siteKey]: defaultSiteSettings(now) } };
}

/** Replaces a website's appearance overrides (unlike updateSite, which merges them). */
export function setSiteAppearance(settings: Settings, siteKey: string, appearance: Partial<AppearanceOptions>, now = Date.now()): Settings {
  const next = updateSite(settings, siteKey, {}, now);
  next.sites[siteKey] = { ...next.sites[siteKey], appearance };
  return next;
}

export function isDefaultSite(s: SiteSettings): boolean {
  return (
    s.mode === 'default' &&
    s.themeId === null &&
    (!s.pausedUntil || s.pausedUntil < Date.now()) &&
    !s.ignoreBuiltInDarkMode &&
    Object.keys(s.appearance).length === 0
  );
}

export function updateGlobal(settings: Settings, patch: Partial<GlobalSettings>, now = Date.now()): Settings {
  return { ...settings, global: { ...settings.global, ...patch, updatedAt: now } };
}

/** Next theme id in the cycle order after `currentId`. */
export function nextThemeId(settings: Settings, currentId: string): string {
  const themes = allThemes(settings);
  const order = settings.global.cycleThemeIds.length
    ? settings.global.cycleThemeIds.filter((id) => themes.some((th) => th.id === id))
    : themes.map((th) => th.id);
  if (order.length === 0) return currentId;
  const i = order.indexOf(currentId);
  return order[(i + 1) % order.length];
}

/** Merges two settings snapshots, keeping the most recently updated value per site and for globals. */
export function mergeSettings(local: Settings, remote: Settings): Settings {
  const global = remote.global.updatedAt > local.global.updatedAt ? remote.global : local.global;
  const sites: Record<string, SiteSettings> = { ...local.sites };
  for (const [k, v] of Object.entries(remote.sites)) {
    if (!sites[k] || v.updatedAt > sites[k].updatedAt) sites[k] = v;
  }
  // Theme library edits always bump global.updatedAt, so the newer side owns the whole library.
  const newer = remote.global.updatedAt > local.global.updatedAt ? remote : local;
  return {
    version: 1,
    global,
    sites,
    customThemes: newer.customThemes,
    themeOverrides: newer.themeOverrides,
    hiddenThemeIds: newer.hiddenThemeIds,
  };
}
