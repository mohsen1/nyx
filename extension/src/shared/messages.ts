// Messages exchanged between the content script, background and toolbar menu.

import type { Decision } from './settings';

export interface PageState {
  siteKey: string | null;
  url: string;
  decision: Pick<Decision, 'enabled' | 'reason' | 'effectiveMode' | 'ignoreBuiltInDarkMode'> & { themeId: string };
  /** The engine is currently restyling the page. */
  active: boolean;
  /** The page appears to ship its own dark mode. */
  builtInDarkMode: boolean;
}

export type Message =
  | { type: 'getPageState' }
  | { type: 'fetchResource'; url: string; as: 'text' | 'dataUrl' }
  | { type: 'reportBuiltInDarkMode'; siteKey: string; url: string; detected: boolean }
  | { type: 'syncNow' }
  /** Sent by pages as they load; syncs if the last sync is older than a minute. */
  | { type: 'syncSoon' };

export interface FetchResult {
  ok: boolean;
  body?: string;
  error?: string;
}
