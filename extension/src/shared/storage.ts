// Settings persistence on top of browser.storage.local (fast, available to content scripts).

import { api } from './browser';
import { normalizeSettings, type Settings } from './settings';

export const SETTINGS_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  try {
    const data = await api.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(data?.[SETTINGS_KEY]);
  } catch {
    return normalizeSettings(null);
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await api.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** Load-modify-save helper. Writes are serialized so concurrent updates are not lost. */
let queue: Promise<unknown> = Promise.resolve();
export function updateSettings(fn: (s: Settings) => Settings): Promise<Settings> {
  const run = queue.then(async () => {
    const next = fn(await loadSettings());
    await saveSettings(next);
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function onSettingsChanged(cb: (settings: Settings) => void): void {
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) cb(normalizeSettings(changes[SETTINGS_KEY].newValue));
  });
}
