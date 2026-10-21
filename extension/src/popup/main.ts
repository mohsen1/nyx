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
import { captureComparison } from './report';
import { actionCell, cell, formatClock, formatTime, group, h, icon, segmented, select, themeSwatch, toggle } from '../shared/ui';

const root = document.getElementById('app')!;

let tab: Tab | undefined;
/** The settings scope being edited: a page, host or parent domain (see siteScopes). */
let siteKey: string | null = null;
let scopePinned = false;
let page: PageState | null = null;
/** The tab's URL, or the one its content script reports when the browser hides it. */
let pageUrl: string | undefined;
let settings: Settings;

const REASONS: Record<string, string> = {
  'global-off': 'Off for all websites',
  'site-off': 'Off for this website',
  'global-paused': 'Paused for all websites',
  'site-paused': 'Paused',
  'system-light': 'Off until your device is in Dark Mode',
  'outside-schedule': 'Off until your schedule starts',
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

/** Without a URL the browser is withholding access; with one, the page is a browser page Nyx can't style. */
function blocked(): boolean {
  return !siteKey && !!tab && !pageUrl;
}

/** Where to grant website access, in the words of the browser the user is in. */
function permissionHelp(): string {
  const ua = navigator.userAgent;
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
  const mobile = /iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (safari && mobile) return 'Tap the page menu in the address bar, tap Nyx, then choose Always Allow.';
  if (safari) return 'In Safari Settings › Extensions › Nyx, choose Edit Websites and allow this website.';
  if (/Firefox\//.test(ua)) return 'Open the Extensions menu in the toolbar and allow Nyx on this website.';
  return 'Open the Extensions menu in the toolbar and allow Nyx on this site.';
}

function statusLine(): HTMLElement | null {
  if (blocked()) return null;
  if (!siteKey) return h('p', { class: 'status' }, 'Nyx can’t change this page');
  if (!page) return h('p', { class: 'status' }, 'Reload the page to use Nyx');
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const d = decide(settings, siteKey, { systemDark, now: new Date() });
  let text = REASONS[d.reason] ?? '';
  if (d.reason === 'outside-schedule') text = `Off until ${formatClock(settings.global.schedule.start)}`;
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
  // Keep disclosure state across re-renders.
  const appearanceOpen = !!root.querySelector<HTMLDetailsElement>('details.appearance')?.open;
  root.replaceChildren();
  root.append(
    h(
      'header',
      { class: 'popup-header' },
      h('div', { class: 'title' }, scopePicker(), statusLine()),
      h(
        'button',
        { class: 'icon-button', type: 'button', title: 'Settings', 'aria-label': 'Open settings', onclick: () => api.runtime.openOptionsPage() },
        icon('settings', 18),
      ),
    ),
  );

  const footer: Node[] = [];

  if (blocked()) {
    root.append(
      group(null, [
        h(
          'div',
          { class: 'cell has-icon notice' },
          icon('hand'),
          h('span', { class: 'label' }, 'Allow Nyx on this website', h('small', {}, permissionHelp())),
        ),
      ]),
    );
  }

  if (siteKey) {
    const key = siteKey;
    const site = settings.sites[key];
    const paused = !!site?.pausedUntil && site.pausedUntil > Date.now();
    const themes = allThemes(settings);
    const defaultTheme = findTheme(themes, settings.global.defaultThemeId);
    const effective = findTheme(themes, site?.themeId ?? settings.global.defaultThemeId);

    const rows: Array<Node | null> = [
      cell(
        'Status',
        segmented<SiteMode>(
          'Website status',
          [
            { value: 'default', label: 'Default', title: 'Use the setting for all websites' },
            { value: 'auto', label: 'Auto', title: 'Follow Dark Mode or your schedule' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ],
          site?.mode ?? 'default',
          (mode) => update((s) => updateSite(s, key, { mode, pausedUntil: null })),
        ),
      ),
      cell(
        'Theme',
        h(
          'span',
          { class: 'row-value' },
          themeSwatch(effective.background, effective.text),
          select(
            'Theme for this website',
            [{ value: '', label: `Default (${defaultTheme.name})` }, ...themes.map((th) => ({ value: th.id, label: th.name }))],
            site?.themeId ?? '',
            (v) => update((s) => updateSite(s, key, { themeId: v || null })),
          ),
        ),
        { icon: 'palette' },
      ),
    ];

    if (page?.builtInDarkMode || (site && site.ignoreBuiltInDarkMode !== null)) {
      const current = site?.ignoreBuiltInDarkMode;
      rows.push(
        cell(
          'Ignore website’s dark mode',
          select(
            'Ignore built-in dark mode',
            [
              { value: 'default', label: `Default (${settings.global.ignoreBuiltInDarkMode ? 'On' : 'Off'})` },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ],
            current === null || current === undefined ? 'default' : current ? 'on' : 'off',
            (v) => update((s) => updateSite(s, key, { ignoreBuiltInDarkMode: v === 'default' ? null : v === 'on' })),
          ),
          { icon: 'sun-moon' },
        ),
      );
    }

    if (settings.global.advancedAppearanceEnabled) {
      const a = { ...settings.global.appearance, ...(site?.appearance ?? {}) };
      const set = (k: keyof AppearanceOptions) => (v: boolean) =>
        update((s) => {
          const current = { ...(s.sites[key]?.appearance ?? {}) };
          if (v === s.global.appearance[k]) delete current[k];
          else current[k] = v;
          return setSiteAppearance(s, key, current);
        });
      rows.push(
        h(
          'details',
          { class: 'appearance', open: appearanceOpen },
          h(
            'summary',
            { class: 'cell has-icon' },
            icon('sliders-horizontal'),
            h('span', { class: 'label' }, 'Appearance'),
            chevron(),
          ),
          toggle('Dynamic colors', a.dynamicColors, set('dynamicColors')),
          toggle('Background images', a.backgroundImages, set('backgroundImages')),
          toggle('Invert dark images', a.imageInversion, set('imageInversion')),
        ),
      );
    }

    rows.push(
      actionCell(paused ? 'Resume' : 'Pause until tomorrow', paused ? 'play' : 'pause', () =>
        update((s) => updateSite(s, key, { pausedUntil: paused ? null : tomorrowMorning(new Date()) })),
      ),
    );

    if (site && !isDefaultSite(site)) rows.push(actionCell('Reset website', 'rotate-ccw', () => update((s) => resetSite(s, key))));

    root.append(group('This website', rows));
    footer.push(h('button', { type: 'button', class: 'link', onclick: (e: Event) => reportSite(key, e.currentTarget as HTMLButtonElement) }, 'Report a problem'));
  }

  const globalPaused = !!settings.global.pausedUntil && settings.global.pausedUntil > Date.now();
  root.append(
    group('All websites', [
      cell(
        'Status',
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
      ),
      actionCell(globalPaused ? 'Resume all websites' : 'Pause all until tomorrow', globalPaused ? 'play' : 'pause', () =>
        update((s) => updateGlobal(s, { pausedUntil: globalPaused ? null : tomorrowMorning(new Date()) })),
      ),
    ]),
  );
  if (footer.length) root.append(h('footer', { class: 'popup-footer' }, ...footer));
}

function chevron(): SVGSVGElement {
  const el = icon('chevron-down', 14);
  el.classList.add('chevron');
  return el;
}

function scopePicker(): HTMLElement {
  const scopes = pageUrl ? siteScopes(pageUrl) : [];
  if (!siteKey || scopes.length < 2) return h('h1', { class: 'site' }, siteKey ?? 'Nyx');
  const host = scopes.find((k) => !k.includes('/'));
  return select(
    'Settings apply to',
    scopes.map((k) => ({ value: k, label: k.includes('/') ? `This page (${k.slice(k.indexOf('/'))})` : k === host ? k : `All of ${k}` })),
    siteKey,
    (v) => {
      siteKey = v;
      scopePinned = true;
      render();
    },
    { chevron: 'chevron-down', class: 'scope-picker' },
  );
}

/** "Chrome 141", "Safari 26", "Firefox 144": enough to reproduce a rendering problem. */
function browserName(): string {
  const ua = navigator.userAgent;
  const m = /(Edg|Firefox|OPR)\/(\d+)/.exec(ua) ?? /(Chrome)\/(\d+)/.exec(ua);
  if (m) return `${{ Edg: 'Edge', OPR: 'Opera' }[m[1]] ?? m[1]} ${m[2]}`;
  const safari = /Version\/(\d+).*Safari/.exec(ua);
  return safari ? `Safari ${safari[1]}` : 'Unknown browser';
}

async function reportSite(key: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = 'Taking a screenshot…';
  const capture = tab ? await captureComparison(tab, !!page?.active, (stage) => { button.textContent = stage; }).catch(() => null) : null;
  const s = settings.sites[key];
  const theme = findTheme(allThemes(settings), s?.themeId ?? settings.global.defaultThemeId);
  const details = [
    `**Website:** ${pageUrl ?? key}`,
    `**Nyx:** ${api.runtime.getManifest().version} on ${browserName()}`,
    `**Theme:** ${theme.name}${page?.active ? '' : ' (Nyx was not restyling the page)'}`,
    `**Detected built-in dark mode:** ${page?.builtInDarkMode ? 'yes' : 'no'}`,
  ].join('\n');
  const image = capture ? await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(capture.image);
  }).catch(() => null) : null;
  try {
    const result = await api.runtime.sendMessage({
      type: 'prepareReport', draft: { title: `Website issue: ${key}`, details, image, layout: capture?.layout ?? null },
    } satisfies Message);
    if (!result?.ok) throw new Error('Could not open screenshot review.');
    window.close();
  } catch {
    button.disabled = false;
    button.textContent = 'Try reporting again';
    root.append(h('p', { role: 'alert', class: 'group-footer' }, 'Could not open screenshot review. Please try again.'));
  }
}

async function main(): Promise<void> {
  [tab] = await api.tabs.query({ active: true, currentWindow: true });
  settings = await loadSettings();
  await refreshPage();
  // Browsers hide a tab's URL when the extension isn't allowed on that website (Safari does this
  // until the user grants access), so fall back to the URL the content script reports.
  pageUrl = tab?.url ?? page?.url;
  siteKey = pageUrl ? matchSiteKey(settings, pageUrl) : null;
  render();
  onSettingsChanged(async (s) => {
    settings = s;
    if (!scopePinned && pageUrl) siteKey = matchSiteKey(settings, pageUrl);
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
