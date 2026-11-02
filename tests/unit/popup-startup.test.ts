// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
  storage: { local: { get: vi.fn() }, onChanged: { addListener: vi.fn() } },
  runtime: { sendMessage: vi.fn(), openOptionsPage: vi.fn() },
}));
vi.mock('../../extension/src/shared/browser', () => ({ api: browser }));

afterEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('shows usable controls while the page-state request is still pending', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  browser.tabs.query.mockResolvedValue([{ id: 1, url: 'https://news.ycombinator.com/' }]);
  browser.storage.local.get.mockResolvedValue({});
  browser.tabs.sendMessage.mockReturnValue(new Promise(() => {}));
  browser.runtime.sendMessage.mockResolvedValue({});
  await import('../../extension/src/popup/main');
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Global status"]')).not.toBeNull());
  expect(document.querySelector('[aria-label="Website status"]')).not.toBeNull();
});
