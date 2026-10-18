import { describe, expect, it } from 'vitest';
import {
  decide,
  defaultSettings,
  isWithinSchedule,
  matchSiteKey,
  nextSiteMode,
  siteScopes,
  mergeSettings,
  nextThemeId,
  normalizeSettings,
  resetSite,
  siteKeyForUrl,
  tomorrowMorning,
  updateGlobal,
  updateSite,
} from '../../extension/src/shared/settings';

const env = (systemDark: boolean, at = '2026-01-10T22:00:00') => ({ systemDark, now: new Date(at) });

describe('decide', () => {
  it('follows the system appearance by default (Auto)', () => {
    const s = defaultSettings();
    expect(decide(s, 'example.com', env(true)).enabled).toBe(true);
    expect(decide(s, 'example.com', env(false))).toMatchObject({ enabled: false, reason: 'system-light' });
  });

  it('lets a website override the global status', () => {
    let s = updateGlobal(defaultSettings(), { mode: 'off' });
    s = updateSite(s, 'example.com', { mode: 'on' });
    expect(decide(s, 'example.com', env(false)).enabled).toBe(true);
    expect(decide(s, 'other.com', env(true))).toMatchObject({ enabled: false, reason: 'global-off' });
    s = updateSite(s, 'other.com', { mode: 'off' });
    expect(decide(updateGlobal(s, { mode: 'on' }), 'other.com', env(true))).toMatchObject({ enabled: false, reason: 'site-off' });
  });

  it('pauses a website or everything until the deadline', () => {
    const now = new Date('2026-01-10T22:00:00');
    const until = tomorrowMorning(now);
    let s = updateSite(defaultSettings(), 'example.com', { pausedUntil: until });
    expect(decide(s, 'example.com', { systemDark: true, now })).toMatchObject({ enabled: false, reason: 'site-paused' });
    expect(decide(s, 'example.com', { systemDark: true, now: new Date(until + 1) }).enabled).toBe(true);
    s = updateGlobal(defaultSettings(), { pausedUntil: until });
    expect(decide(s, 'a.com', { systemDark: true, now })).toMatchObject({ enabled: false, reason: 'global-paused' });
  });

  it('supports a schedule that crosses midnight', () => {
    const s = updateGlobal(defaultSettings(), { autoTrigger: 'schedule', schedule: { start: '20:00', end: '07:00' } });
    expect(decide(s, null, env(false, '2026-01-10T23:30:00')).enabled).toBe(true);
    expect(decide(s, null, env(false, '2026-01-10T06:59:00')).enabled).toBe(true);
    expect(decide(s, null, env(true, '2026-01-10T12:00:00'))).toMatchObject({ enabled: false, reason: 'outside-schedule' });
    expect(isWithinSchedule({ start: '08:00', end: '17:00' }, new Date('2026-01-10T12:00:00'))).toBe(true);
  });

  it('uses the website theme, then the default theme', () => {
    let s = updateGlobal(defaultSettings(), { defaultThemeId: 'black' });
    expect(decide(s, 'a.com', env(true)).theme.id).toBe('black');
    s = updateSite(s, 'a.com', { themeId: 'sepia' });
    expect(decide(s, 'a.com', env(true)).theme.id).toBe('sepia');
    s = updateSite(s, 'a.com', { themeId: 'deleted-theme' });
    expect(decide(s, 'a.com', env(true)).theme.id).toBe('dark');
  });

  it('applies advanced appearance options only when enabled', () => {
    let s = updateSite(defaultSettings(), 'a.com', { appearance: { dynamicColors: false } });
    expect(decide(s, 'a.com', env(true)).appearance.dynamicColors).toBe(true);
    s = updateGlobal(s, { advancedAppearanceEnabled: true });
    expect(decide(s, 'a.com', env(true)).appearance).toEqual({ dynamicColors: false, backgroundImages: true, imageInversion: true });
  });
});

describe('website scopes', () => {
  it('lists page, host and parent-domain scopes', () => {
    expect(siteScopes('https://docs.www.example.com/Guide/intro?x#y')).toEqual(['docs.www.example.com/guide/intro', 'docs.www.example.com', 'www.example.com', 'example.com']);
    expect(siteScopes('https://www.bbc.co.uk/news')).toEqual(['bbc.co.uk/news', 'bbc.co.uk']);
    expect(siteScopes('http://192.168.1.2:8080/')).toEqual(['192.168.1.2:8080', '192.168.1.2']);
    expect(siteScopes('http://localhost:3000/app')).toEqual(['localhost:3000/app', 'localhost:3000', 'localhost']);
    expect(siteScopes('https://app.example.com:8443/')).toEqual(['app.example.com:8443', 'app.example.com', 'example.com']);
  });

  it('uses the most specific scope that has settings', () => {
    let s = updateSite(defaultSettings(), 'example.com', { mode: 'off' });
    expect(matchSiteKey(s, 'https://news.example.com/a')).toBe('example.com');
    s = updateSite(s, 'news.example.com/a', { mode: 'on' });
    expect(matchSiteKey(s, 'https://news.example.com/a')).toBe('news.example.com/a');
    expect(matchSiteKey(s, 'https://news.example.com/b')).toBe('example.com');
    expect(matchSiteKey(defaultSettings(), 'https://other.org/')).toBe('other.org');
  });

  it('cycles the status like the "Set Status" shortcut', () => {
    expect(['default', 'auto', 'on', 'off'].map((m) => nextSiteMode(m as never))).toEqual(['auto', 'on', 'off', 'default']);
  });

  it('applies the global "ignore built-in dark mode" default unless the site overrides it', () => {
    let s = updateGlobal(defaultSettings(), { ignoreBuiltInDarkMode: true });
    expect(decide(s, 'a.com', env(true)).ignoreBuiltInDarkMode).toBe(true);
    s = updateSite(s, 'a.com', { ignoreBuiltInDarkMode: false });
    expect(decide(s, 'a.com', env(true)).ignoreBuiltInDarkMode).toBe(false);
  });
});

describe('helpers', () => {
  it('derives site keys', () => {
    expect(siteKeyForUrl('https://www.Example.com/path?q')).toBe('example.com');
    expect(siteKeyForUrl('http://sub.example.com:8080/')).toBe('sub.example.com:8080');
    expect(siteKeyForUrl('about:blank')).toBeNull();
    expect(siteKeyForUrl('safari-web-extension://abc/popup.html')).toBeNull();
  });

  it('pauses until the next morning', () => {
    expect(new Date(tomorrowMorning(new Date('2026-01-10T22:00:00'))).toString()).toContain('Jan 11 2026 06:00');
    expect(new Date(tomorrowMorning(new Date('2026-01-11T02:00:00'))).toString()).toContain('Jan 11 2026 06:00');
    expect(new Date(tomorrowMorning(new Date('2026-01-11T05:30:00'))).toString()).toContain('Jan 12 2026 06:00');
  });

  it('cycles themes', () => {
    const s = defaultSettings();
    expect(nextThemeId(s, 'dark')).toBe('black');
    const custom = updateGlobal(s, { cycleThemeIds: ['black', 'sepia'] });
    expect(nextThemeId(custom, 'black')).toBe('sepia');
    expect(nextThemeId(custom, 'sepia')).toBe('black');
  });

  it('normalizes untrusted input', () => {
    const s = normalizeSettings({ global: { mode: 'bogus', schedule: { start: '25:00' } }, sites: { 'WWW.A.com': { mode: 'on', appearance: { dynamicColors: 'x' } } } });
    expect(s.global.mode).toBe('auto');
    expect(s.global.schedule.start).toBe('20:00');
    expect(s.sites['a.com']).toMatchObject({ mode: 'on', appearance: {} });
  });

  it('lets a real change beat a later snapshot of never-saved defaults', () => {
    const changed = updateGlobal(normalizeSettings(undefined), { defaultThemeId: 'sepia' }, 1000);
    const staleDefaults = normalizeSettings(undefined); // e.g. pushed by a sync that ran later
    expect(mergeSettings(staleDefaults, changed).global.defaultThemeId).toBe('sepia');
    expect(mergeSettings(changed, staleDefaults).global.defaultThemeId).toBe('sepia');
  });

  it('merges sync snapshots per website by recency', () => {
    const base = defaultSettings(1);
    const a = updateSite(base, 'a.com', { mode: 'off' }, 10);
    const b = resetSite(updateSite(base, 'b.com', { mode: 'on' }, 5), 'a.com', 20);
    const merged = mergeSettings(a, b);
    expect(merged.sites['a.com'].mode).toBe('default'); // the later reset wins
    expect(merged.sites['b.com'].mode).toBe('on');
  });
});
