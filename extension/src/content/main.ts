// Content script entry point. Runs at document_start in every frame.

import { api } from '../shared/browser';
import type { FetchResult, Message, PageState } from '../shared/messages';
import { decide, matchSiteKey, type Decision, type Settings } from '../shared/settings';
import { loadSettings, onSettingsChanged } from '../shared/storage';
import { detectDarkPage } from './detect';
import { afterPaint } from './paint';
import { DarkEngine, type EngineConfig } from './engine';

declare global {
  interface Window {
    __nyxLoaded?: boolean;
  }
}

const isTop = window.top === window;

/** URL of the top-level page; frames are styled according to the website they are shown on. */
function topUrl(): string {
  if (isTop) return location.href;
  try {
    return window.top!.location.href;
  } catch {
    const ancestors = location.ancestorOrigins;
    if (ancestors && ancestors.length) return ancestors[ancestors.length - 1];
    return document.referrer || location.href;
  }
}

async function fetchResource(url: string, as: 'text' | 'dataUrl'): Promise<string | null> {
  try {
    const res = (await api.runtime.sendMessage({ type: 'fetchResource', url, as } satisfies Message)) as FetchResult;
    if (res?.ok && res.body) return res.body;
  } catch {
    /* fall through */
  }
  // The background script can't reach hosts the user hasn't granted (Safari grants access per
  // website, so a site's CDN is often not covered). Many CDNs allow CORS reads, so try from here.
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    if (as === 'text') return await res.text();
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

class Controller {
  private settings: Settings | null = null;
  private decision: Decision | null = null;
  private engine: DarkEngine | null = null;
  private builtInDarkMode = false;
  private detected = false;
  private timer: number | null = null;
  private redetectTimer: number | null = null;
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private url = topUrl();
  private siteKey: string | null = null;
  /** Switched off for a moment so a problem report can show the original page. */
  private suspended = false;
  private resumeTimer: number | null = null;

  async init(): Promise<void> {
    onSettingsChanged((s) => {
      this.settings = s;
      this.apply();
    });
    this.media.addEventListener('change', () => {
      // Media-query styles have already changed. Inspect the site's own colors before applying
      // ours, then re-check after any asynchronous site theme handlers have settled.
      this.detect();
      this.apply();
      this.detectSoon();
    });
    api.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
      if (msg?.type === 'getPageState' && isTop) {
        sendResponse(this.state());
        return true;
      }
      if (msg?.type === 'setSuspended') {
        this.suspend(msg.suspended);
        // Answer after the change has been painted, so a screenshot taken next shows it.
        afterPaint(() => sendResponse(true));
        return true;
      }
      return false;
    });
    this.settings = await loadSettings();
    this.apply();
    // Picks up changes made in the app, Shortcuts or on other devices.
    if (isTop) void api.runtime.sendMessage({ type: 'syncSoon' } satisfies Message).catch(() => undefined);
    const detectSoon = () => window.setTimeout(() => this.detect(), 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', detectSoon, { once: true });
    else detectSoon();
    window.addEventListener('load', () => this.detect(), { once: true });
    this.watchThemeSwitches();
    // Page-scoped settings must follow single-page-app navigations.
    if (isTop) window.setInterval(() => location.href !== this.url && this.apply(), 1000);
  }

  private state(): PageState {
    const d = this.decision;
    return {
      siteKey: this.siteKey,
      url: this.url,
      decision: {
        enabled: d?.enabled ?? false,
        reason: d?.reason ?? 'global-off',
        effectiveMode: d?.effectiveMode ?? 'auto',
        ignoreBuiltInDarkMode: d?.ignoreBuiltInDarkMode ?? false,
        themeId: d?.theme.id ?? '',
      },
      active: !!this.engine?.running,
      builtInDarkMode: this.builtInDarkMode,
    };
  }

  private config(d: Decision): EngineConfig {
    return { theme: d.theme, appearance: d.appearance };
  }

  apply(): void {
    if (!this.settings) return;
    if (isTop && location.href !== this.url) this.url = location.href; // SPA navigation
    this.siteKey = matchSiteKey(this.settings, this.url);
    const d = decide(this.settings, this.siteKey, { systemDark: this.media.matches, now: new Date() });
    this.decision = d;
    const want = d.enabled && !(this.builtInDarkMode && !d.ignoreBuiltInDarkMode) && !this.suspended;
    if (want) {
      if (!this.engine) this.engine = new DarkEngine(document, this.config(d), fetchResource);
      else this.engine.update(this.config(d));
      this.engine.start();
    } else {
      this.engine?.stop();
    }
    document.documentElement.toggleAttribute('data-nyx-active', want);
    this.scheduleRecheck();
  }

  private suspend(on: boolean): void {
    if (this.resumeTimer !== null) window.clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
    // The toolbar menu may close mid-capture; never leave the page undarkened.
    if (on) this.resumeTimer = window.setTimeout(() => this.suspend(false), 5000);
    if (this.suspended === on) return;
    this.suspended = on;
    this.apply();
  }

  /** Re-evaluates when a pause ends or the schedule flips. */
  private scheduleRecheck(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    const s = this.settings;
    if (!s) return;
    const site = this.siteKey ? s.sites[this.siteKey] : undefined;
    const now = Date.now();
    const deadlines = [site?.pausedUntil, s.global.pausedUntil].filter((t): t is number => !!t && t > now);
    let delay = deadlines.length ? Math.min(...deadlines) - now + 50 : Infinity;
    if (s.global.autoTrigger === 'schedule') delay = Math.min(delay, 60_000 - (now % 60_000) + 50);
    if (Number.isFinite(delay)) this.timer = window.setTimeout(() => this.apply(), Math.min(delay, 2 ** 31 - 1));
  }

  private detect(): void {
    if (!document.body) return;
    const run = () => detectDarkPage(document);
    const report = this.engine?.running ? this.engine.withoutStyles(run, true) : run();
    this.detected = true;
    if (report.dark !== this.builtInDarkMode) {
      this.builtInDarkMode = report.dark;
      this.apply();
    }
  }

  private detectSoon(): void {
    if (this.redetectTimer !== null) window.clearTimeout(this.redetectTimer);
    this.redetectTimer = window.setTimeout(() => {
      this.redetectTimer = null;
      this.detect();
    }, 250);
  }

  /** Sites that switch their own theme by toggling a class/attribute on <html> or <body>. */
  private watchThemeSwitches(): void {
    const observer = new MutationObserver(() => {
      if (!this.detected) return;
      this.detectSoon();
    });
    const opts: MutationObserverInit = {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-color-mode', 'data-bs-theme', 'theme', 'dark'],
    };
    observer.observe(document.documentElement, opts);
    const watchBody = () => document.body && observer.observe(document.body, opts);
    if (document.body) watchBody();
    else document.addEventListener('DOMContentLoaded', watchBody, { once: true });
  }
}

function boot(): void {
  // Only HTML documents (not SVG or XML files opened directly).
  if (window.__nyxLoaded || !(document.documentElement instanceof HTMLElement)) return;
  window.__nyxLoaded = true;
  void new Controller().init();
}

if (document.documentElement) boot();
else {
  // Some engines run document_start scripts before <html> exists; wait for it.
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    boot();
  });
  observer.observe(document, { childList: true });
}
