// Settings page: global status, theme library (create/edit/share/import), websites, advanced options, backup.

import { api } from '../shared/browser';
import {
  allThemes,
  isDefaultSite,
  normalizeSettings,
  normalizeSiteKey,
  resetSite,
  tomorrowMorning,
  updateGlobal,
  updateSite,
  type AutoTrigger,
  type GlobalMode,
  type Settings,
  type SiteMode,
} from '../shared/settings';
import { loadSettings, onSettingsChanged, saveSettings, updateSettings } from '../shared/storage';
import {
  BUILT_IN_THEMES,
  ThemeLinkError,
  findTheme,
  newThemeId,
  parseThemeLink,
  themeShareLink,
  type Theme,
} from '../shared/theme';
import { formatTime, h, segmented, themeSwatch, toggle } from '../shared/ui';

const root = document.getElementById('app')!;
let settings: Settings;
let editing: string | null = null;
let tab = (location.hash.slice(1) || 'general') as TabId;

type TabId = 'general' | 'themes' | 'websites' | 'advanced';
const TABS: Array<[TabId, string]> = [
  ['general', 'General'],
  ['themes', 'Themes'],
  ['websites', 'Websites'],
  ['advanced', 'Advanced'],
];

const update = (fn: (s: Settings) => Settings) => updateSettings(fn);
/** Theme library edits bump global.updatedAt, which is what sync uses to order library changes. */
const updateLibrary = (fn: (s: Settings) => Settings) => update((s) => updateGlobal(fn(s), {}));

function render(): void {
  const scrollY = window.scrollY;
  root.replaceChildren(
    h('header', { class: 'page-header' }, h('h1', {}, 'Nyx'), h('p', {}, 'Dark mode for every website.')),
    h(
      'nav',
      { class: 'tabs', role: 'tablist' },
      ...TABS.map(([id, label]) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': String(tab === id),
            class: tab === id ? 'selected' : '',
            onclick: () => {
              tab = id;
              location.hash = id;
              render();
            },
          },
          label,
        ),
      ),
    ),
    h('main', {}, ...(tab === 'general' ? general() : tab === 'themes' ? themes() : tab === 'websites' ? websites() : advanced())),
  );
  window.scrollTo(0, scrollY);
}

function card(title: string, ...children: Array<Node | null | false>): HTMLElement {
  return h('section', { class: 'card' }, h('h2', {}, title), ...children);
}

function general(): Node[] {
  const g = settings.global;
  const paused = !!g.pausedUntil && g.pausedUntil > Date.now();
  const themes = allThemes(settings);
  const scheduleInputs =
    g.autoTrigger === 'schedule'
      ? h(
          'div',
          { class: 'row' },
          h('label', {}, 'From ', h('input', { type: 'time', value: g.schedule.start, onchange: (e: Event) => update((s) => updateGlobal(s, { schedule: { ...s.global.schedule, start: (e.target as HTMLInputElement).value } })) })),
          h('label', {}, ' to ', h('input', { type: 'time', value: g.schedule.end, onchange: (e: Event) => update((s) => updateGlobal(s, { schedule: { ...s.global.schedule, end: (e.target as HTMLInputElement).value } })) })),
        )
      : null;
  return [
    card(
      'Status',
      h('p', { class: 'hint' }, 'Auto darkens websites only when your device is in Dark Mode (or during your schedule). Each website can override this from the toolbar menu.'),
      segmented<GlobalMode>(
        'Status',
        [
          { value: 'auto', label: 'Auto' },
          { value: 'on', label: 'Always On' },
          { value: 'off', label: 'Off' },
        ],
        g.mode,
        (mode) => update((s) => updateGlobal(s, { mode })),
      ),
      g.mode === 'auto'
        ? h(
            'div',
            { class: 'stack' },
            h('h3', {}, 'Auto follows'),
            segmented<AutoTrigger>(
              'Auto follows',
              [
                { value: 'system', label: 'System Appearance' },
                { value: 'schedule', label: 'Schedule' },
              ],
              g.autoTrigger,
              (autoTrigger) => update((s) => updateGlobal(s, { autoTrigger })),
            ),
            scheduleInputs,
          )
        : null,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { type: 'button', onclick: () => update((s) => updateGlobal(s, { pausedUntil: paused ? null : tomorrowMorning(new Date()) })) },
          paused ? 'Resume Everywhere' : 'Pause Everywhere Until Tomorrow',
        ),
        paused ? h('span', { class: 'hint' }, `Paused until ${formatTime(g.pausedUntil!)}`) : null,
      ),
    ),
    card(
      'Default Theme',
      h(
        'div',
        { class: 'theme-grid compact' },
        ...themes.map((th) =>
          h(
            'button',
            {
              type: 'button',
              class: `theme-chip ${th.id === g.defaultThemeId ? 'selected' : ''}`,
              'aria-pressed': String(th.id === g.defaultThemeId),
              onclick: () => update((s) => updateGlobal(s, { defaultThemeId: th.id })),
            },
            themeSwatch(th.background, th.text),
            h('span', {}, th.name),
          ),
        ),
      ),
    ),
  ];
}

function preview(th: Pick<Theme, 'background' | 'text' | 'imageBrightness' | 'grayscale'>): HTMLElement {
  const filter = `brightness(${th.imageBrightness}) grayscale(${th.grayscale})`;
  return h(
    'div',
    { class: 'preview', style: `background:${th.background};color:${th.text}` },
    h('div', { class: 'preview-title' }, 'Headline'),
    h('div', { class: 'preview-line' }),
    h('div', { class: 'preview-line short' }),
    h('div', { class: 'preview-image', style: `filter:${filter}` }),
  );
}

async function copy(text: string, button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = old), 1200);
  } catch {
    prompt('Copy this link:', text);
  }
}

function themeEditor(th: Theme): HTMLElement {
  const draft: Theme = { ...th };
  const pv = preview(draft);
  const field = (label: string, input: HTMLElement) => h('label', { class: 'field' }, h('span', {}, label), input);
  const color = (key: 'background' | 'text') =>
    h('input', {
      type: 'color',
      value: draft[key],
      oninput: (e: Event) => {
        draft[key] = (e.target as HTMLInputElement).value;
        editorEl.querySelector('.preview')?.replaceWith(preview(draft));
      },
    });
  const slider = (key: 'imageBrightness' | 'grayscale', min: number) =>
    h('input', {
      type: 'range',
      min,
      max: 1,
      step: 0.01,
      value: draft[key],
      oninput: (e: Event) => {
        draft[key] = parseFloat((e.target as HTMLInputElement).value);
        editorEl.querySelector('.preview')?.replaceWith(preview(draft));
      },
    });
  const save = () =>
    updateLibrary((s) => {
      if (th.builtIn) return { ...s, themeOverrides: { ...s.themeOverrides, [th.id]: { ...draft, builtIn: true } } };
      return { ...s, customThemes: s.customThemes.map((x) => (x.id === th.id ? draft : x)) };
    }).then(() => {
      editing = null;
      render();
    });
  const editorEl = h(
    'div',
    { class: 'editor' },
    pv,
    field('Name', h('input', { type: 'text', value: draft.name, maxlength: 80, oninput: (e: Event) => (draft.name = (e.target as HTMLInputElement).value) })),
    field('Background', color('background')),
    field('Text', color('text')),
    field('Image brightness', slider('imageBrightness', 0.3)),
    field('Grayscale', slider('grayscale', 0)),
    h(
      'div',
      { class: 'row' },
      h('button', { type: 'button', class: 'primary', onclick: save }, 'Save'),
      h('button', { type: 'button', onclick: () => ((editing = null), render()) }, 'Cancel'),
    ),
  );
  return editorEl;
}

function themes(): Node[] {
  const list = allThemes(settings);
  const importInput = h('input', { type: 'url', placeholder: 'https://getnoir.app/theme?name=…&bg=…&text=…', 'aria-label': 'Theme link' });
  const importError = h('p', { class: 'error', role: 'alert' });
  const doImport = () => {
    try {
      const parsed = parseThemeLink(importInput.value);
      const th: Theme = { ...parsed, id: newThemeId() };
      void updateLibrary((s) => ({ ...s, customThemes: [...s.customThemes, th] }));
      importInput.value = '';
      importError.textContent = '';
    } catch (e) {
      importError.textContent = e instanceof ThemeLinkError ? e.message : 'Could not import that link.';
    }
  };
  const hidden = BUILT_IN_THEMES.filter((b) => settings.hiddenThemeIds.includes(b.id));
  return [
    card(
      'Add a Theme',
      h('p', { class: 'hint' }, 'Paste a shared theme link. Links shared from Noir (getnoir.app/theme or noir://theme) work too.'),
      h('div', { class: 'row' }, importInput, h('button', { type: 'button', onclick: doImport }, 'Import')),
      importError,
      h(
        'button',
        {
          type: 'button',
          class: 'primary',
          onclick: () => {
            const th: Theme = { id: newThemeId(), name: 'New Theme', background: '#000000', text: '#ffffff', imageBrightness: 1, grayscale: 0 };
            editing = th.id;
            void updateLibrary((s) => ({ ...s, customThemes: [...s.customThemes, th] }));
          },
        },
        'Create New Theme',
      ),
    ),
    h(
      'div',
      { class: 'theme-grid' },
      ...list.map((th) => {
        if (editing === th.id) return h('article', { class: 'theme-card editing' }, themeEditor(th));
        const original = BUILT_IN_THEMES.find((b) => b.id === th.id);
        const modified = !!original && !!settings.themeOverrides[th.id];
        const shareBtn = h('button', { type: 'button', onclick: () => copy(themeShareLink(th), shareBtn) }, 'Copy Link');
        const noirBtn = h('button', { type: 'button', title: 'Copy a link in Noir’s format', onclick: () => copy(themeShareLink(th, 'noir'), noirBtn) }, 'Copy Noir Link');
        return h(
          'article',
          { class: `theme-card ${th.id === settings.global.defaultThemeId ? 'selected' : ''}` },
          preview(th),
          h('h3', {}, th.name, th.collection ? h('small', {}, th.collection) : null),
          h(
            'div',
            { class: 'row wrap' },
            h('button', { type: 'button', onclick: () => update((s) => updateGlobal(s, { defaultThemeId: th.id })) }, th.id === settings.global.defaultThemeId ? 'Default ✓' : 'Use as Default'),
            h('button', { type: 'button', onclick: () => ((editing = th.id), render()) }, 'Edit'),
            shareBtn,
            noirBtn,
            h(
              'button',
              {
                type: 'button',
                onclick: () => {
                  const { builtIn: _b, collection: _c, ...rest } = th;
                  const copyTheme: Theme = { ...rest, id: newThemeId(), name: `${th.name} Copy` };
                  void updateLibrary((s) => ({ ...s, customThemes: [...s.customThemes, copyTheme] }));
                },
              },
              'Duplicate',
            ),
            modified
              ? h('button', { type: 'button', onclick: () => updateLibrary((s) => { const o = { ...s.themeOverrides }; delete o[th.id]; return { ...s, themeOverrides: o }; }) }, 'Reset')
              : null,
            original
              ? h('button', { type: 'button', class: 'danger', onclick: () => updateLibrary((s) => ({ ...s, hiddenThemeIds: [...s.hiddenThemeIds, th.id] })) }, 'Hide')
              : h('button', { type: 'button', class: 'danger', onclick: () => { if (confirm(`Delete “${th.name}”?`)) void updateLibrary((s) => ({ ...s, customThemes: s.customThemes.filter((x) => x.id !== th.id) })); } }, 'Delete'),
          ),
        );
      }),
    ),
    hidden.length
      ? card(
          'Hidden Built-in Themes',
          h(
            'div',
            { class: 'row wrap' },
            ...hidden.map((b) => h('button', { type: 'button', onclick: () => updateLibrary((s) => ({ ...s, hiddenThemeIds: s.hiddenThemeIds.filter((x) => x !== b.id) })) }, `Show ${b.name}`)),
          ),
        )
      : null,
  ].filter(Boolean) as Node[];
}

function websites(): Node[] {
  const themes = allThemes(settings);
  const entries = Object.entries(settings.sites)
    .filter(([, s]) => !isDefaultSite(s))
    .sort(([a], [b]) => a.localeCompare(b));
  const add = h('input', { type: 'text', placeholder: 'example.com', 'aria-label': 'Website' });
  return [
    card(
      'Websites',
      h('p', { class: 'hint' }, 'Websites, subdomains and pages with their own settings. Add example.com, app.example.com, 192.168.1.2:8080 or example.com/some/page.'),
      h(
        'div',
        { class: 'row' },
        add,
        h(
          'button',
          {
            type: 'button',
            onclick: () => {
              const host = add.value.trim();
              if (host) void update((s) => updateSite(s, normalizeSiteKey(host), { mode: 'off' }));
            },
          },
          'Add (Off)',
        ),
      ),
      entries.length === 0 ? h('p', { class: 'muted' }, 'No websites with custom settings yet.') : null,
      h(
        'ul',
        { class: 'site-list' },
        ...entries.map(([host, s]) => {
          const select = h(
            'select',
            { 'aria-label': `Theme for ${host}`, onchange: (e: Event) => update((x) => updateSite(x, host, { themeId: (e.target as HTMLSelectElement).value || null })) },
            h('option', { value: '' }, 'Default theme'),
            ...themes.map((th) => h('option', { value: th.id }, th.name)),
          );
          select.value = s.themeId ?? '';
          const th = findTheme(themes, s.themeId ?? settings.global.defaultThemeId);
          return h(
            'li',
            {},
            themeSwatch(th.background, th.text),
            h('strong', {}, host),
            segmented<SiteMode>(
              `Status for ${host}`,
              [
                { value: 'default', label: 'Default' },
                { value: 'auto', label: 'Auto' },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ],
              s.mode,
              (mode) => update((x) => updateSite(x, host, { mode })),
            ),
            select,
            s.ignoreBuiltInDarkMode === true ? h('span', { class: 'badge' }, 'Ignores built-in dark mode') : null,
            s.pausedUntil && s.pausedUntil > Date.now() ? h('span', { class: 'badge' }, `Paused until ${formatTime(s.pausedUntil)}`) : null,
            h('button', { type: 'button', class: 'danger', onclick: () => update((x) => resetSite(x, host)) }, 'Remove'),
          );
        }),
      ),
    ),
  ];
}

function advanced(): Node[] {
  const g = settings.global;
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json',
    onchange: async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const imported = normalizeSettings(JSON.parse(await file.text()));
        if (confirm('Replace all settings with the imported backup?')) await saveSettings(imported);
      } catch {
        alert('That file is not a Nyx backup.');
      }
    },
  });
  return [
    card(
      'Advanced Appearance Options',
      toggle(
        'Show advanced appearance options',
        g.advancedAppearanceEnabled,
        (v) => update((s) => updateGlobal(s, { advancedAppearanceEnabled: v })),
        'Adds per-website appearance switches to the toolbar menu.',
      ),
      g.advancedAppearanceEnabled
        ? h(
            'div',
            { class: 'stack' },
            h('h3', {}, 'Defaults for all websites'),
            toggle('Dynamic colors', g.appearance.dynamicColors, (v) => update((s) => updateGlobal(s, { appearance: { ...s.global.appearance, dynamicColors: v } })), 'Off maps every color to the theme’s background and text colors.'),
            toggle('Background images', g.appearance.backgroundImages, (v) => update((s) => updateGlobal(s, { appearance: { ...s.global.appearance, backgroundImages: v } })), 'Off hides all CSS background images.'),
            toggle('Image inversion', g.appearance.imageInversion, (v) => update((s) => updateGlobal(s, { appearance: { ...s.global.appearance, imageInversion: v } })), 'Inverts dark logos and icons on transparent backgrounds.'),
          )
        : null,
    ),
    card(
      'Built-in Dark Mode',
      toggle(
        'Ignore built-in dark modes',
        g.ignoreBuiltInDarkMode,
        (v) => update((s) => updateGlobal(s, { ignoreBuiltInDarkMode: v })),
        'Nyx normally leaves websites that have their own dark mode alone. Detection is not perfect, so it is best to leave this off and turn it on per website from the toolbar menu.',
      ),
    ),
    card(
      'Built-in Dark Mode Reports',
      h('p', { class: 'hint' }, 'When a website’s own dark mode is detected incorrectly, Nyx can offer to open a pre-filled report. Nothing is sent unless you submit it.'),
      segmented<'ask' | 'never'>('Reports', [{ value: 'ask', label: 'Offer to Report' }, { value: 'never', label: 'Never' }], g.darkModeReporting, (v) =>
        update((s) => updateGlobal(s, { darkModeReporting: v })),
      ),
    ),
    card(
      'Keyboard Shortcuts',
      h('p', { class: 'hint' }, 'Toggle the current website, pause it until tomorrow, cycle themes or set the global status. Change the key combinations in your browser’s extension shortcut settings.'),
    ),
    card(
      'Backup',
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            type: 'button',
            onclick: () => {
              const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
              const a = h('a', { href: URL.createObjectURL(blob), download: 'nyx-settings.json' });
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            },
          },
          'Export Settings',
        ),
        h('label', { class: 'button' }, 'Import Settings…', fileInput),
      ),
    ),
    card('About', h('p', {}, `Nyx ${api.runtime.getManifest().version}. Open source under the MIT license. Nyx never collects your browsing data.`)),
  ];
}

async function main(): Promise<void> {
  settings = await loadSettings();
  render();
  onSettingsChanged((s) => {
    settings = s;
    render();
  });
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1) as TabId;
    if (TABS.some(([t]) => t === id) && id !== tab) {
      tab = id;
      render();
    }
  });
}

void main();
