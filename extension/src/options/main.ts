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
import { actionCell, cell, formatTime, group, h, icon, segmented, select, themeSwatch, toggle, type IconName } from '../shared/ui';

const LINKS: Array<[string, string, IconName]> = [
  ['Website', 'https://azimi.me/nyx/', 'house'],
  ['Source code', 'https://github.com/mohsen1/nyx', 'code-xml'],
  ['Privacy', 'https://azimi.me/nyx/privacy/', 'shield-check'],
  ['Support', 'https://azimi.me/nyx/support/', 'life-buoy'],
];
const root = document.getElementById('app')!;
let settings: Settings;
let tab = (location.hash.slice(1) || 'general') as TabId;
/** The theme open in the editor sheet, with unsaved edits kept across re-renders. */
let editing: { draft: Theme; isNew: boolean } | null = null;
let showHidden = false;

type TabId = 'general' | 'themes' | 'websites' | 'advanced';
const TABS: Array<[TabId, string, IconName]> = [
  ['general', 'General', 'sun-moon'],
  ['themes', 'Themes', 'palette'],
  ['websites', 'Websites', 'globe'],
  ['advanced', 'Advanced', 'sliders-horizontal'],
];

const update = (fn: (s: Settings) => Settings) => updateSettings(fn);
/** Theme library edits bump global.updatedAt, which is what sync uses to order library changes. */
const updateLibrary = (fn: (s: Settings) => Settings) => update((s) => updateGlobal(fn(s), {}));

function render(): void {
  const scrollY = window.scrollY;
  const title = TABS.find(([id]) => id === tab)?.[1] ?? '';
  document.title = `${title} – Nyx`;
  const tabs = TABS.map(([id, label, ic]) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        'aria-selected': String(tab === id),
        onclick: () => {
          tab = id;
          location.hash = id;
          render();
        },
      },
      icon(ic, 22),
      label,
    ),
  );
  root.replaceChildren(
    h(
      'header',
      { class: 'toolbar' },
      h('span', { class: 'brand' }, h('img', { src: 'icons/icon-48.png', alt: '' }), h('span', {}, 'Nyx')),
      h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Settings' }, ...tabs),
    ),
    h(
      'main',
      { class: tab === 'themes' ? 'page wide' : 'page', role: 'tabpanel', 'aria-label': title },
      h('h1', {}, title),
      ...(tab === 'general' ? general() : tab === 'themes' ? themes() : tab === 'websites' ? websites() : advanced()),
    ),
  );
  if (editing) openEditor(editing);
  window.scrollTo(0, scrollY);
}

// ── General ──────────────────────────────────────────────

function statusFooter(g: Settings['global']): string {
  if (g.mode === 'on') return 'Websites are always dark.';
  if (g.mode === 'off') return 'Websites stay as they are, unless you turn Nyx on for one.';
  return g.autoTrigger === 'schedule' ? 'Websites are dark during your schedule.' : 'Websites are dark when your device is in Dark Mode.';
}

function timeInput(label: string, value: string, key: 'start' | 'end'): HTMLInputElement {
  return h('input', {
    type: 'time',
    class: 'field',
    'aria-label': label,
    value,
    onchange: (e: Event) => update((s) => updateGlobal(s, { schedule: { ...s.global.schedule, [key]: (e.target as HTMLInputElement).value } })),
  });
}

function general(): Node[] {
  const g = settings.global;
  const paused = !!g.pausedUntil && g.pausedUntil > Date.now();
  const themes = allThemes(settings);
  const current = findTheme(themes, g.defaultThemeId);
  return [
    group(
      null,
      [
        cell(
          'Dark mode',
          segmented<GlobalMode>(
            'Status',
            [
              { value: 'auto', label: 'Auto' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ],
            g.mode,
            (mode) => update((s) => updateGlobal(s, { mode })),
          ),
        ),
        g.mode === 'auto'
          ? cell(
              'Auto follows',
              select(
                'Auto follows',
                [
                  { value: 'system', label: 'System appearance' },
                  { value: 'schedule', label: 'Schedule' },
                ],
                g.autoTrigger,
                (v) => update((s) => updateGlobal(s, { autoTrigger: v as AutoTrigger })),
              ),
            )
          : null,
        g.mode === 'auto' && g.autoTrigger === 'schedule'
          ? cell(
              'Schedule',
              h('span', { class: 'time-range' }, timeInput('From', g.schedule.start, 'start'), 'to', timeInput('To', g.schedule.end, 'end')),
            )
          : null,
      ],
      statusFooter(g),
    ),
    group(
      null,
      [
        actionCell(paused ? 'Resume all websites' : 'Pause all until tomorrow', paused ? 'play' : 'pause', () =>
          update((s) => updateGlobal(s, { pausedUntil: paused ? null : tomorrowMorning(new Date()) })),
        ),
      ],
      paused ? `Paused until ${formatTime(g.pausedUntil!)}.` : null,
    ),
    group(
      null,
      [
        cell(
          'Default theme',
          h(
            'span',
            { class: 'row-value' },
            themeSwatch(current.background, current.text),
            select(
              'Default theme',
              themes.map((th) => ({ value: th.id, label: th.name })),
              g.defaultThemeId,
              (v) => update((s) => updateGlobal(s, { defaultThemeId: v })),
            ),
          ),
        ),
      ],
    ),
  ];
}

// ── Themes ───────────────────────────────────────────────

/** "Editor Themes" → "Editor themes" for section headings. */
function sentenceCase(text: string): string {
  return text.charAt(0) + text.slice(1).toLowerCase();
}

function thumb(th: Pick<Theme, 'background' | 'text' | 'imageBrightness' | 'grayscale'>): HTMLElement {
  return h(
    'span',
    { class: 'thumb', style: `background:${th.background};color:${th.text}`, 'aria-hidden': 'true' },
    h('i', { class: 'head' }),
    h('i'),
    h('i', { class: 'short' }),
    h('i', { class: 'wide' }),
    h('i', { class: 'wide short' }),
    h('b', { style: `filter:brightness(${th.imageBrightness}) grayscale(${th.grayscale})` }),
  );
}

async function copy(text: string, done: () => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    done();
  } catch {
    prompt('Copy this link:', text);
  }
}

function closeMenus(except?: Element): void {
  for (const d of document.querySelectorAll<HTMLDetailsElement>('details.menu[open]')) if (d !== except) d.open = false;
}

function themeMenu(th: Theme): HTMLElement {
  const original = BUILT_IN_THEMES.find((b) => b.id === th.id);
  const modified = !!original && !!settings.themeOverrides[th.id];
  const menu = h('details', { class: 'menu', ontoggle: () => menu.open && closeMenus(menu) });
  const item = (label: string, ic: IconName, run: () => void, destructive = false) =>
    h(
      'button',
      {
        type: 'button',
        class: destructive ? 'destructive' : '',
        onclick: () => {
          menu.open = false;
          run();
        },
      },
      icon(ic),
      label,
    );
  const copied = () => {
    const name = menu.closest('.tile')?.querySelector('.tile-name');
    if (!name) return;
    const old = name.textContent;
    name.textContent = 'Link copied';
    setTimeout(() => (name.textContent = old), 1200);
  };
  menu.append(
    h('summary', { 'aria-label': `Options for ${th.name}`, title: 'Options' }, icon('ellipsis', 14)),
    h(
      'div',
      { class: 'menu-items', role: 'menu' },
      item('Edit…', 'pencil', () => {
        editing = { draft: { ...th }, isNew: false };
        render();
      }),
      item('Duplicate', 'copy-plus', () => {
        const { builtIn: _b, collection: _c, ...rest } = th;
        const copyTheme: Theme = { ...rest, id: newThemeId(), name: `${th.name} Copy` };
        void updateLibrary((s) => ({ ...s, customThemes: [...s.customThemes, copyTheme] }));
      }),
      item('Copy link', 'link', () => copy(themeShareLink(th), copied)),
      modified
        ? item('Reset to original', 'rotate-ccw', () =>
            updateLibrary((s) => {
              const o = { ...s.themeOverrides };
              delete o[th.id];
              return { ...s, themeOverrides: o };
            }),
          )
        : null,
      h('hr'),
      original
        ? item('Hide', 'eye-off', () => updateLibrary((s) => ({ ...s, hiddenThemeIds: [...s.hiddenThemeIds, th.id] })))
        : item(
            'Delete',
            'trash-2',
            () => {
              if (confirm(`Delete “${th.name}”?`)) void updateLibrary((s) => ({ ...s, customThemes: s.customThemes.filter((x) => x.id !== th.id) }));
            },
            true,
          ),
    ),
  );
  return menu;
}

function tile(th: Theme): HTMLElement {
  const selected = th.id === settings.global.defaultThemeId;
  return h(
    'article',
    { class: selected ? 'tile selected' : 'tile', 'data-theme': th.id },
    h(
      'button',
      {
        type: 'button',
        class: 'tile-pick',
        'aria-pressed': String(selected),
        'aria-label': `${th.name}${selected ? ', default theme' : ''}`,
        onclick: () => update((s) => updateGlobal(s, { defaultThemeId: th.id })),
      },
      thumb(th),
    ),
    h('h3', { class: 'tile-name' }, th.name),
    themeMenu(th),
  );
}

const MY_THEMES = 'My themes';

function newThemeTile(): HTMLElement {
  return h(
    'article',
    { class: 'tile tile-new' },
    h(
      'button',
      {
        type: 'button',
        class: 'tile-pick',
        onclick: () => {
          editing = { draft: { id: newThemeId(), name: 'New theme', background: '#1c1c1e', text: '#e3e3e6', imageBrightness: 1, grayscale: 0 }, isNew: true };
          render();
        },
      },
      h('span', { class: 'thumb new', 'aria-hidden': 'true' }, icon('plus', 22)),
      h('span', { class: 'tile-name' }, 'New theme…'),
    ),
  );
}

function themes(): Node[] {
  const list = allThemes(settings);
  const collections = new Map<string, Theme[]>();
  for (const th of list) {
    const name = th.collection ?? MY_THEMES;
    collections.set(name, [...(collections.get(name) ?? []), th]);
  }
  // My themes always shows, last, ending with a tile that creates a new theme.
  const mine = collections.get(MY_THEMES) ?? [];
  collections.delete(MY_THEMES);
  collections.set(MY_THEMES, mine);
  const importInput = h('input', { type: 'url', class: 'field', placeholder: 'Paste a theme link', 'aria-label': 'Theme link' });
  const importError = h('span', { class: 'error', role: 'alert' });
  const doImport = () => {
    try {
      const parsed = parseThemeLink(importInput.value);
      const th: Theme = { ...parsed, id: newThemeId() };
      void updateLibrary((s) => ({ ...s, customThemes: [...s.customThemes, th] }));
      importInput.value = '';
      importError.textContent = '';
    } catch (e) {
      importError.textContent = e instanceof ThemeLinkError ? e.message : 'That link isn’t a theme.';
    }
  };
  importInput.addEventListener('keydown', (e) => e.key === 'Enter' && doImport());
  const hidden = BUILT_IN_THEMES.filter((b) => settings.hiddenThemeIds.includes(b.id));

  return [
    h(
      'div',
      { class: 'gallery' },
      ...[...collections].map(([name, items]) =>
        h(
          'section',
          { class: 'collection' },
          h('h2', { class: 'group-title' }, sentenceCase(name)),
          h('div', { class: 'list tiles' }, ...items.map(tile), name === MY_THEMES ? newThemeTile() : null),
        ),
      ),
    ),
    group(null, [cell(importInput, h('button', { type: 'button', class: 'btn', onclick: doImport }, 'Import'), { icon: 'link' })], importError),
    hidden.length
      ? group(
          null,
          [
            actionCell(`${showHidden ? 'Hide' : 'Show'} hidden themes (${hidden.length})`, showHidden ? 'eye-off' : 'eye', () => {
              showHidden = !showHidden;
              render();
            }),
            ...(showHidden
              ? hidden.map((b) =>
                  cell(
                    b.name,
                    h(
                      'button',
                      { type: 'button', class: 'btn', onclick: () => updateLibrary((s) => ({ ...s, hiddenThemeIds: s.hiddenThemeIds.filter((x) => x !== b.id) })) },
                      'Show',
                    ),
                  ),
                )
              : []),
          ],
        )
      : null,
  ].filter(Boolean) as Node[];
}

function openEditor(state: { draft: Theme; isNew: boolean }): void {
  const draft = state.draft;
  const preview = h('div', {}, thumb(draft));
  const refresh = () => preview.replaceChildren(thumb(draft));
  const color = (key: 'background' | 'text', label: string) =>
    cell(
      label,
      h('input', {
        type: 'color',
        'aria-label': label,
        value: draft[key],
        oninput: (e: Event) => {
          draft[key] = (e.target as HTMLInputElement).value;
          refresh();
        },
      }),
      { tag: 'label' },
    );
  const slider = (key: 'imageBrightness' | 'grayscale', label: string, min: number) =>
    cell(
      label,
      h('input', {
        type: 'range',
        'aria-label': label,
        min,
        max: 1,
        step: 0.01,
        value: draft[key],
        oninput: (e: Event) => {
          draft[key] = parseFloat((e.target as HTMLInputElement).value);
          refresh();
        },
      }),
      { tag: 'label' },
    );
  const close = () => {
    editing = null;
    dialog.close();
    dialog.remove();
  };
  const save = (e: Event) => {
    e.preventDefault();
    const th: Theme = { ...draft, name: draft.name.trim() || 'Untitled theme' };
    editing = null;
    void updateLibrary((s) => {
      if (state.isNew) return { ...s, customThemes: [...s.customThemes, th] };
      if (th.builtIn) return { ...s, themeOverrides: { ...s.themeOverrides, [th.id]: { ...th, builtIn: true } } };
      return { ...s, customThemes: s.customThemes.map((x) => (x.id === th.id ? th : x)) };
    }).then(render);
    dialog.close();
    dialog.remove();
  };
  const dialog = h(
    'dialog',
    { class: 'sheet', 'aria-label': state.isNew ? 'New theme' : 'Edit theme', oncancel: close },
    h(
      'form',
      { method: 'dialog', class: 'theme-editor', onsubmit: save },
      h('h2', {}, state.isNew ? 'New theme' : 'Edit theme'),
      preview,
      group(null, [
        h(
          'label',
          { class: 'cell' },
          h('input', {
            type: 'text',
            class: 'field',
            'aria-label': 'Name',
            maxlength: 80,
            value: draft.name,
            oninput: (e: Event) => (draft.name = (e.target as HTMLInputElement).value),
          }),
        ),
        color('background', 'Background'),
        color('text', 'Text'),
      ]),
      group('Images', [slider('imageBrightness', 'Brightness', 0.3), slider('grayscale', 'Grayscale', 0)]),
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary' }, 'Save'),
      ),
    ),
  );
  document.body.querySelector('dialog.sheet')?.remove();
  document.body.append(dialog);
  dialog.showModal();
}

// ── Websites ─────────────────────────────────────────────

function websites(): Node[] {
  const themes = allThemes(settings);
  const entries = Object.entries(settings.sites)
    .filter(([, s]) => !isDefaultSite(s))
    .sort(([a], [b]) => a.localeCompare(b));
  const add = h('input', { type: 'text', class: 'field', placeholder: 'example.com', 'aria-label': 'Website', autocapitalize: 'off', spellcheck: 'false' });
  const doAdd = () => {
    const host = add.value.trim();
    if (host) void update((s) => updateSite(s, normalizeSiteKey(host), { mode: 'off' }));
  };
  add.addEventListener('keydown', (e) => e.key === 'Enter' && doAdd());

  const rows = entries.map(([host, s]) => {
    const th = findTheme(themes, s.themeId ?? settings.global.defaultThemeId);
    const notes = [
      s.pausedUntil && s.pausedUntil > Date.now() ? `Paused until ${formatTime(s.pausedUntil)}` : null,
      s.ignoreBuiltInDarkMode === true ? 'Ignores website’s dark mode' : null,
    ].filter(Boolean);
    return h(
      'div',
      { class: 'cell site-row' },
      themeSwatch(th.background, th.text),
      h('span', { class: 'label' }, h('strong', {}, host), notes.length ? h('small', {}, notes.join(' · ')) : null),
      h(
        'span',
        { class: 'controls' },
        select(
          `Status for ${host}`,
          [
            { value: 'default', label: 'Default' },
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ],
          s.mode,
          (mode) => update((x) => updateSite(x, host, { mode: mode as SiteMode })),
        ),
        select(
          `Theme for ${host}`,
          [{ value: '', label: 'Default theme' }, ...themes.map((t) => ({ value: t.id, label: t.name }))],
          s.themeId ?? '',
          (v) => update((x) => updateSite(x, host, { themeId: v || null })),
        ),
        h(
          'button',
          { type: 'button', class: 'icon-button danger', title: 'Remove', 'aria-label': `Remove ${host}`, onclick: () => update((x) => resetSite(x, host)) },
          icon('trash-2'),
        ),
      ),
    );
  });

  return [
    group(
      null,
      [cell(add, h('button', { type: 'button', class: 'btn', onclick: doAdd }, 'Turn off'), { icon: 'plus' })],
    ),
    rows.length
      ? group('Customized websites', rows)
      : group(null, [h('p', { class: 'empty' }, 'Websites you change from the toolbar menu appear here.')]),
  ];
}

// ── Advanced ─────────────────────────────────────────────

/** The browser's shortcut settings page, when an extension may open it (Safari and Firefox have none it can open). */
function shortcutsUrl(): string | null {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return null;
  if (/Edg\//.test(ua)) return 'edge://extensions/shortcuts';
  if (/Chrome\//.test(ua)) return 'chrome://extensions/shortcuts';
  return null;
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
        if (confirm('Replace all settings with this backup?')) await saveSettings(imported);
      } catch {
        alert('That file isn’t a Nyx backup.');
      }
    },
  });
  const setAppearance = (k: keyof Settings['global']['appearance']) => (v: boolean) =>
    update((s) => updateGlobal(s, { appearance: { ...s.global.appearance, [k]: v } }));
  return [
    group(
      'Websites with their own dark mode',
      [toggle('Ignore their dark mode', g.ignoreBuiltInDarkMode, (v) => update((s) => updateGlobal(s, { ignoreBuiltInDarkMode: v })))],
    ),
    group(
      'Appearance options',
      [
        toggle('Show in toolbar menu', g.advancedAppearanceEnabled, (v) => update((s) => updateGlobal(s, { advancedAppearanceEnabled: v }))),
        ...(g.advancedAppearanceEnabled
          ? [
              toggle('Dynamic colors', g.appearance.dynamicColors, setAppearance('dynamicColors'), 'Keep each website’s accent colors.'),
              toggle('Background images', g.appearance.backgroundImages, setAppearance('backgroundImages')),
              toggle('Invert dark images', g.appearance.imageInversion, setAppearance('imageInversion'), 'Keep dark logos and icons visible.'),
            ]
          : []),
      ],
    ),
    shortcutsUrl()
      ? group(null, [actionCell('Keyboard shortcuts', 'keyboard', () => void api.tabs.create({ url: shortcutsUrl()! }))])
      : null,
    group('Backup', [
      actionCell('Export settings…', 'download', () => {
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: 'nyx-settings.json' });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }),
      h('label', { class: 'cell action has-icon' }, icon('upload'), h('span', { class: 'label' }, 'Import settings…'), fileInput),
    ]),
    group(
      'About',
      [
        h(
          'div',
          { class: 'cell about' },
          h('img', { src: 'icons/icon-96.png', alt: '' }),
          h('span', { class: 'label' }, h('strong', {}, 'Nyx'), h('small', {}, `Version ${api.runtime.getManifest().version}`)),
        ),
        ...LINKS.map(([label, href, ic]) =>
          h(
            'a',
            { class: 'cell action has-icon', href, target: '_blank', rel: 'noopener' },
            icon(ic),
            h('span', { class: 'label' }, label),
            icon('external-link', 14),
          ),
        ),
      ],
      'Nyx doesn’t collect any data.',
    ),
  ].filter(Boolean) as Node[];
}

async function main(): Promise<void> {
  settings = await loadSettings();
  render();
  onSettingsChanged((s) => {
    settings = s;
    render();
  });
  document.addEventListener('click', (e) => {
    const inMenu = (e.target as Element).closest('details.menu');
    closeMenus(inMenu ?? undefined);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus();
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
