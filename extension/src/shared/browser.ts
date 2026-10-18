// Minimal, promise-based view of the WebExtension API shared by Safari, Chrome and Firefox.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface Tab {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
  windowId?: number;
}

export interface MessageSender {
  tab?: Tab;
  frameId?: number;
  url?: string;
}

export interface ExtensionApi {
  runtime: {
    id: string;
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<any>;
    sendNativeMessage?(application: string, message: unknown): Promise<any>;
    onMessage: {
      addListener(cb: (message: any, sender: MessageSender, sendResponse: (r?: unknown) => void) => boolean | void | Promise<unknown>): void;
    };
    onInstalled: { addListener(cb: (details: { reason: string }) => void): void };
    onStartup: { addListener(cb: () => void): void };
    openOptionsPage(): Promise<void>;
    getManifest(): { version: string; name: string };
    lastError?: { message?: string };
  };
  storage: {
    local: {
      get(keys?: string | string[] | null): Promise<Record<string, any>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    sync?: {
      get(keys?: string | string[] | null): Promise<Record<string, any>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: { addListener(cb: (changes: Record<string, StorageChange>, area: string) => void): void };
  };
  tabs: {
    query(q: { active?: boolean; currentWindow?: boolean; lastFocusedWindow?: boolean }): Promise<Tab[]>;
    sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<any>;
    create(props: { url: string }): Promise<Tab>;
  };
  commands?: { onCommand: { addListener(cb: (command: string, tab?: Tab) => void): void } };
  alarms?: {
    create(name: string, info: { periodInMinutes?: number; when?: number }): void;
    onAlarm: { addListener(cb: (alarm: { name: string }) => void): void };
  };
  action?: {
    setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    setBadgeBackgroundColor?(details: { color: string; tabId?: number }): Promise<void>;
    setTitle?(details: { title: string; tabId?: number }): Promise<void>;
  };
}

const g = globalThis as any;
export const api: ExtensionApi = g.browser ?? g.chrome;

export const isSafari =
  typeof navigator !== 'undefined' && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent);
