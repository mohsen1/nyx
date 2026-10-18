// Background script: fetches cross-origin resources for the content script, handles keyboard
// shortcuts, and keeps settings in sync (iCloud through the native app on Safari,
// storage.sync elsewhere).

import { api, type Tab } from '../shared/browser';
import type { FetchResult, Message, PageState } from '../shared/messages';
import {
  decide,
  matchSiteKey,
  nextSiteMode,
  nextThemeId,
  tomorrowMorning,
  updateGlobal,
  updateSite,
  type GlobalMode,
} from '../shared/settings';
import { loadSettings, updateSettings } from '../shared/storage';
import { startSync, syncNow, syncSoon } from './sync';

const MAX_TEXT = 4 * 1024 * 1024;
const MAX_IMAGE = 1024 * 1024;

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

async function fetchResource(url: string, as: 'text' | 'dataUrl'): Promise<FetchResult> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'unsupported protocol' };
    const res = await fetch(u.href, { credentials: 'include', cache: 'force-cache', redirect: 'follow' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const blob = await res.blob();
    if (as === 'text') {
      if (blob.size > MAX_TEXT) return { ok: false, error: 'too large' };
      return { ok: true, body: await blob.text() };
    }
    if (blob.size > MAX_IMAGE || !/^image\//.test(blob.type)) return { ok: false, error: 'not an image or too large' };
    return { ok: true, body: await blobToDataUrl(blob) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

api.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg?.type === 'fetchResource') {
    fetchResource(msg.url, msg.as).then(sendResponse);
    return true;
  }
  if (msg?.type === 'syncSoon') {
    syncSoon();
    return false;
  }
  if (msg?.type === 'syncNow') {
    syncNow().then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});

async function activeTab(): Promise<Tab | undefined> {
  const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function pageState(tab: Tab | undefined): Promise<PageState | null> {
  if (!tab?.id) return null;
  try {
    return (await api.tabs.sendMessage(tab.id, { type: 'getPageState' } satisfies Message, { frameId: 0 })) ?? null;
  } catch {
    return null;
  }
}

const GLOBAL_MODES: Record<string, GlobalMode> = {
  'global-auto': 'auto',
  'global-on': 'on',
  'global-off': 'off',
};

/** Keyboard shortcuts (see manifest "commands"). */
async function onCommand(command: string, tabArg?: Tab): Promise<void> {
  if (command in GLOBAL_MODES) {
    await updateSettings((s) => updateGlobal(s, { mode: GLOBAL_MODES[command], pausedUntil: null }));
    return;
  }
  const tab = tabArg ?? (await activeTab());
  if (command === 'cycle-theme') {
    await updateSettings((s) => updateGlobal(s, { defaultThemeId: nextThemeId(s, s.global.defaultThemeId) }));
    return;
  }
  const siteKey = tab?.url ? matchSiteKey(await loadSettings(), tab.url) : null;
  if (!siteKey) return;
  if (command === 'toggle-site') {
    const state = await pageState(tab);
    const settings = await loadSettings();
    const enabled = state?.active ?? decide(settings, siteKey, { systemDark: true, now: new Date() }).enabled;
    await updateSettings((s) => updateSite(s, siteKey, { mode: enabled ? 'off' : 'on', pausedUntil: null }));
  } else if (command === 'cycle-site-status') {
    await updateSettings((s) => updateSite(s, siteKey, { mode: nextSiteMode(s.sites[siteKey]?.mode ?? 'default'), pausedUntil: null }));
  } else if (command === 'toggle-ignore-dark-mode') {
    await updateSettings((s) => {
      const current = s.sites[siteKey]?.ignoreBuiltInDarkMode ?? s.global.ignoreBuiltInDarkMode;
      return updateSite(s, siteKey, { ignoreBuiltInDarkMode: !current });
    });
  } else if (command === 'pause-site') {
    await updateSettings((s) => updateSite(s, siteKey, { pausedUntil: tomorrowMorning(new Date()) }));
  } else if (command === 'cycle-site-theme') {
    await updateSettings((s) => {
      const current = s.sites[siteKey]?.themeId ?? s.global.defaultThemeId;
      return updateSite(s, siteKey, { themeId: nextThemeId(s, current) });
    });
  }
}

api.commands?.onCommand.addListener((command, tab) => void onCommand(command, tab));

startSync();
