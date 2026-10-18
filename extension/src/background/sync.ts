// Settings sync. On Safari the containing app stores settings in iCloud (NSUbiquitousKeyValueStore)
// and in the shared App Group, so the app, Shortcuts and widgets see the same data. Other browsers
// use storage.sync. Both sides are merged per entry by `updatedAt`.

import { api } from '../shared/browser';
import { mergeSettings, normalizeSettings, type Settings } from '../shared/settings';
import { SETTINGS_KEY, loadSettings, saveSettings } from '../shared/storage';

const NATIVE_APP_ID = 'app.nyx.NyxDarkMode';
const CHUNK = 7000;

interface Remote {
  pull(): Promise<Settings | null>;
  push(settings: Settings): Promise<void>;
}

const native: Remote = {
  async pull() {
    const res = await api.runtime.sendNativeMessage!(NATIVE_APP_ID, { type: 'pull' });
    return res?.settings ? normalizeSettings(typeof res.settings === 'string' ? JSON.parse(res.settings) : res.settings) : null;
  },
  async push(settings) {
    await api.runtime.sendNativeMessage!(NATIVE_APP_ID, { type: 'push', settings: JSON.stringify(settings) });
  },
};

const storageSync: Remote = {
  async pull() {
    const area = api.storage.sync!;
    const meta = (await area.get('nyx_meta'))?.nyx_meta as { chunks: number } | undefined;
    if (!meta) return null;
    const keys = Array.from({ length: meta.chunks }, (_, i) => `nyx_${i}`);
    const data = await area.get(keys);
    const json = keys.map((k) => data[k] ?? '').join('');
    return normalizeSettings(JSON.parse(json));
  },
  async push(settings) {
    const area = api.storage.sync!;
    const json = JSON.stringify(settings);
    const items: Record<string, unknown> = {};
    const chunks = Math.ceil(json.length / CHUNK);
    for (let i = 0; i < chunks; i++) items[`nyx_${i}`] = json.slice(i * CHUNK, (i + 1) * CHUNK);
    items.nyx_meta = { chunks, updatedAt: Date.now() };
    await area.set(items);
  },
};

let remote: Remote | null | undefined;
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushed = '';

async function pickRemote(): Promise<Remote | null> {
  if (remote !== undefined) return remote;
  if (api.runtime.sendNativeMessage) {
    try {
      await api.runtime.sendNativeMessage(NATIVE_APP_ID, { type: 'ping' });
      return (remote = native);
    } catch {
      /* no native host: not Safari, or the app is not installed */
    }
  }
  return (remote = api.storage.sync ? storageSync : null);
}

export async function syncNow(): Promise<void> {
  const r = await pickRemote();
  if (!r) return;
  const local = await loadSettings();
  const incoming = await r.pull().catch(() => null);
  const merged = incoming ? mergeSettings(local, incoming) : local;
  const json = JSON.stringify(merged);
  if (json !== JSON.stringify(local)) {
    applyingRemote = true;
    try {
      await saveSettings(merged);
    } finally {
      applyingRemote = false;
    }
  }
  if (!incoming || json !== JSON.stringify(incoming)) {
    await r.push(merged);
    lastPushed = json;
  }
}

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const r = await pickRemote();
    if (!r) return;
    const s = await loadSettings();
    const json = JSON.stringify(s);
    if (json === lastPushed) return;
    lastPushed = json;
    await r.push(s).catch(() => undefined);
  }, 1500);
}

export function startSync(): void {
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY] && !applyingRemote) schedulePush();
    if (area === 'sync' && remote === storageSync) void syncNow();
  });
  api.alarms?.create('nyx-sync', { periodInMinutes: 5 });
  api.alarms?.onAlarm.addListener((a) => {
    if (a.name === 'nyx-sync') void syncNow();
  });
  api.runtime.onStartup.addListener(() => void syncNow());
  void syncNow();
}
