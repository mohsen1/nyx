// The toolbar menu: quick per-website controls for the current tab.

import { api, type Tab } from '../shared/browser';
import type { Message, PageState } from '../shared/messages';
import {
  allThemes,
  decide,
  isDefaultSite,
  resetSite,
  setSiteAppearance,
  matchSiteKey,
  siteScopes,
  tomorrowMorning,
  updateGlobal,
  updateSite,
  type AppearanceOptions,
  type GlobalMode,
  type Settings,
  type SiteMode,
} from '../shared/settings';
import { loadSettings, onSettingsChanged, updateSettings } from '../shared/storage';
import { findTheme } from '../shared/theme';
import { formatTime, h, segmented, themeSwatch, toggle } from '../shared/ui';

const REPO = 'https://github.com/mohsen1/nyx';
const root = document.getElementById('app')!;

let tab: Tab | undefined;
/** The settings scope being edited: a page, host or parent domain (see siteScopes). */
let siteKey: string | null = null;
let scopePinned = false;
let page: PageState | null = null;
let settings: Settings;

const REASONS: Record<string, string> = {
  'global-off': 'Turned off everywhere',
  'site-off': 'Turned off for this website',
  'global-paused': 'Paused everywhere',
  'site-paused': 'Paused on this website',
  'system-light': 'Waiting for dark appearance',
  'outside-schedule': 'Outside your schedule',
  on: 'Dark mode is on',
};

async function refreshPage(): Promise<void> {
  if (!tab?.id) return;
  try {
    page = (await api.tabs.sendMessage(tab.id, { type: 'getPageState' } satisfies Message, { frameId: 0 })) ?? null;
  } catch {
    page = null;
  }
}

function statusLine(): HTMLElement {
  if (!siteKey) return h('p', { class: 'status muted' }, 'Nyx does not run on this page.');
  if (!page) return h('p', { class: 'status muted' }, 'Reload the page to let Nyx style it.');
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const d = decide(settings, siteKey, { systemDark, now: new Date() });
  let text = REASONS[d.reason] ?? '';
  if (d.enabled && page.builtInDarkMode && !d.ignoreBuiltInDarkMode) text = 'Using the website’s own dark mode';
  const site = settings.sites[siteKey];
  if (d.reason === 'site-paused' && site?.pausedUntil) text += ` until ${formatTime(site.pausedUntil)}`;
  if (d.reason === 'global-paused' && settings.global.pausedUntil) text += ` until ${formatTime(settings.global.pausedUntil)}`;
  return h('p', { class: `status ${page.active ? 'on' : ''}` }, h('span', { class: 'dot', 'aria-hidden': 'true' }), text);
}

function update(fn: (s: Settings) => Settings): void {
  void updateSettings(fn);
}

function render(): void {
  root.replaceChildren();
  const header = h(
    'header',
    {},
    h('div', { class: 'title' }, scopePicker(), statusLine()),
    h('button', { class: 'icon', type: 'button', title: 'Settings', 'aria-label': 'Open settings', onclick: () => api.runtime.openOptionsPage() }, '⚙︎'),
  );
  root.append(header);

  if (siteKey) {
    const site = settings.sites[siteKey];
    const now = Date.now();
    const paused = !!site?.pausedUntil && site.pausedUntil > now;
    const key = siteKey;
    root.append(
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'primary',
            onclick: () =>
              update((s) => updateSite(s, key, { pausedUntil: paused ? null : tomorrowMorning(new Date()) })),
          },
          paused ? 'Resume on This Website' : 'Pause Until Tomorrow',
        ),
      ),
    );

    root.append(
      h('section', {}, h('h2', {}, 'This Website')),
      segmented<SiteMode>(
        'Website status',
        [
          { value: 'default', label: 'Default', title: 'Use the global setting' },
          { value: 'auto', label: 'Auto', title: 'Follow the system appearance or schedule' },
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ],
        site?.mode ?? 'default',
        (mode) => update((s) => updateSite(s, key, { mode, pausedUntil: null })),
      ),
    );

    const themes = allThemes(settings);
    const defaultTheme = findTheme(themes, settings.global.defaultThemeId);
    const select = h(
      'select',
      {
        'aria-label': 'Theme for this website',
        onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          update((s) => updateSite(s, key, { themeId: v || null }));
        },
      },
      h('option', { value: '' }, `Default (${defaultTheme.name})`),
      ...themes.map((th) => h('option', { value: th.id }, th.name)),
    );
    select.value = site?.themeId ?? '';
    const effective = findTheme(themes, site?.themeId ?? settings.global.defaultThemeId);
    root.append(h('label', { class: 'row' }, themeSwatch(effective.background, effective.text), h('span', {}, 'Theme'), select));

    if (page?.builtInDarkMode || (site && site.ignoreBuiltInDarkMode !== null)) {
      const current = site?.ignoreBuiltInDarkMode;
      root.append(
        h('section', {}, h('h2', {}, 'Ignore Built-in Dark Mode')),
        segmented<'default' | 'on' | 'off'>(
          'Ignore built-in dark mode',
          [
            { value: 'default', label: `Default (${settings.global.ignoreBuiltInDarkMode ? 'On' : 'Off'})` },
            { value: 'on', label: 'On', title: 'Darken even though the website has its own dark mode' },
            { value: 'off', label: 'Off' },
          ],
          current === null || current === undefined ? 'default' : current ? 'on' : 'off',
          (v) => update((s) => updateSite(s, key, { ignoreBuiltInDarkMode: v === 'default' ? null : v === 'on' })),
        ),
      );
      if (settings.global.darkModeReporting !== 'never') {
        root.append(
          h('button', { type: 'button', class: 'link', onclick: () => reportDetection(key) }, 'Dark mode detected incorrectly? Report it'),
        );
      }
    }

    if (settings.global.advancedAppearanceEnabled) {
      const g = settings.global.appearance;
      const a = { ...g, ...(site?.appearance ?? {}) };
      const set = (k: keyof AppearanceOptions) => (v: boolean) =>
        update((s) => {
          const current = { ...(s.sites[key]?.appearance ?? {}) };
          if (v === s.global.appearance[k]) delete current[k];
          else current[k] = v;
          return setSiteAppearance(s, key, current);
        });
      root.append(
        h('section', {}, h('h2', {}, 'Appearance')),
        toggle('Dynamic colors', a.dynamicColors, set('dynamicColors'), 'Keep the website’s accent colors.'),
        toggle('Background images', a.backgroundImages, set('backgroundImages')),
        toggle('Image inversion', a.imageInversion, set('imageInversion'), 'Invert dark logos and icons.'),
      );
    }

    if (site && !isDefaultSite(site)) {
      root.append(
        h('button', { type: 'button', class: 'link', onclick: () => update((s) => resetSite(s, key)) }, 'Reset website settings'),
      );
    }
  }

  const globalPaused = !!settings.global.pausedUntil && settings.global.pausedUntil > Date.now();
  root.append(
    h('section', {}, h('h2', {}, 'All Websites')),
    segmented<GlobalMode>(
      'Global status',
      [
        { value: 'auto', label: 'Auto' },
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ],
      settings.global.mode,
      (mode) => update((s) => updateGlobal(s, { mode, pausedUntil: null })),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'secondary',
        onclick: () => update((s) => updateGlobal(s, { pausedUntil: globalPaused ? null : tomorrowMorning(new Date()) })),
      },
      globalPaused ? 'Resume Everywhere' : 'Pause Everywhere Until Tomorrow',
    ),
    h(
      'footer',
      {},
      siteKey
        ? h('button', { type: 'button', class: 'link', onclick: () => reportSite(siteKey!) }, 'Report a problem with this website')
        : null,
    ),
  );
}

function scopePicker(): HTMLElement {
  const scopes = tab?.url ? siteScopes(tab.url) : [];
  if (!siteKey || scopes.length < 2) return h('strong', {}, siteKey ?? 'Nyx');
  const host = scopes.find((k) => !k.includes('/'));
  const select = h(
    'select',
    {
      class: 'scope',
      'aria-label': 'Settings apply to',
      onchange: (e: Event) => {
        siteKey = (e.target as HTMLSelectElement).value;
        scopePinned = true;
        render();
      },
    },
    ...scopes.map((k) =>
      h('option', { value: k }, k.includes('/') ? `This page (${k.slice(k.indexOf('/'))})` : k === host ? k : `All of ${k}`),
    ),
  );
  select.value = siteKey;
  return select;
}

function openIssue(title: string, body: string): void {
  const url = `${REPO}/issues/new?${new URLSearchParams({ title, body, labels: 'website' })}`;
  void api.tabs.create({ url });
  window.close();
}

function reportSite(key: string): void {
  openIssue(`Website issue: ${key}`, `**Website:** ${tab?.url ?? key}\n\n**What looks wrong?**\n\n`);
}

function reportDetection(key: string): void {
  openIssue(
    `Dark mode detection: ${key}`,
    `**Website:** ${tab?.url ?? key}\n**Detected built-in dark mode:** ${page?.builtInDarkMode ? 'yes' : 'no'}\n\nThe detection is incorrect because…\n`,
  );
}

async function main(): Promise<void> {
  [tab] = await api.tabs.query({ active: true, currentWindow: true });
  settings = await loadSettings();
  siteKey = tab?.url ? matchSiteKey(settings, tab.url) : null;
  await refreshPage();
  render();
  onSettingsChanged(async (s) => {
    settings = s;
    if (!scopePinned && tab?.url) siteKey = matchSiteKey(settings, tab.url);
    // Give the content script a moment to apply the change before asking for its state.
    setTimeout(async () => {
      await refreshPage();
      render();
    }, 60);
    render();
  });
  void api.runtime.sendMessage({ type: 'syncNow' } satisfies Message).catch(() => undefined);
}

void main();
