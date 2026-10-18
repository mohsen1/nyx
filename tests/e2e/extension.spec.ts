// End-to-end checks that load the built extension (dist/chrome) into Chromium and verify the
// behaviors listed in docs/reverse-engineering/obligations.md against fixture pages.

import { test as base, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const EXT = join(ROOT, 'dist/chrome');
const FIXTURES = join(ROOT, 'tests/fixtures');
const SCREENSHOTS = process.env.NYX_SCREENSHOTS;

let server: Server;
let port = 0;
const TYPES: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve(): Promise<void> {
  server = createServer((req, res) => {
    const path = join(FIXTURES, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
    if (!path.startsWith(FIXTURES) || !existsSync(path)) {
      res.writeHead(404).end();
      return;
    }
    let body: string | Buffer = readFileSync(path);
    if (path.endsWith('.html')) body = body.toString().replace('CROSS_ORIGIN', `http://127.0.0.1:${port}`);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
  });
  return new Promise((r) => server.listen(0, () => ((port = (server.address() as { port: number }).port), r())));
}

const url = (name: string) => `http://localhost:${port}/${name}`;

type Fixtures = { context: BrowserContext; worker: Worker };

const test = base.extend<Fixtures>({
  context: async ({ colorScheme }, use) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nyx-')), {
      executablePath: process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
      headless: true,
      colorScheme: colorScheme ?? 'dark',
      viewport: { width: 900, height: 900 },
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker);
  },
});

test.use({ colorScheme: 'dark' });
test.beforeAll(serve);
test.afterAll(() => server.close());

async function setSettings(worker: Worker, patch: (s: any) => void): Promise<void> {
  const cur = (await worker.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('settings')).settings)) ?? {};
  patch(cur);
  await worker.evaluate(async (settings) => (globalThis as any).chrome.storage.local.set({ settings }), cur);
}

const bg = (page: Page, sel: string) => page.$eval(sel, (el) => getComputedStyle(el).backgroundColor);
const fg = (page: Page, sel: string) => page.$eval(sel, (el) => getComputedStyle(el).color);

function luminance(rgb: string): number {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function openLight(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url('light.html'));
  await page.waitForLoadState('load');
  await expect.poll(() => bg(page, 'body')).toBe('rgb(28, 28, 30)');
  return page;
}

test('darkens a light page with the default theme when the system is dark', async ({ context, worker }) => {
  void worker;
  const page = await openLight(context);
  expect(await page.getAttribute('html', 'data-nyx-active')).toBe('');
  expect(luminance(await fg(page, '#text'))).toBeGreaterThan(0.5);
  // Light card stays distinguishable from the page; accent button stays blue.
  expect(luminance(await bg(page, '#card'))).toBeLessThan(0.05);
  expect(await bg(page, '#card')).not.toBe(await bg(page, 'body'));
  const [r, g, b] = (await bg(page, '#cta')).match(/\d+/g)!.map(Number);
  expect(b).toBeGreaterThan(r + 60);
  expect(g).toBeLessThan(b);
  // Inline styles, bgcolor attributes and SVG fill attributes are covered.
  expect(luminance(await bg(page, '#inline'))).toBeLessThan(0.08);
  expect(luminance(await bg(page, '#cell'))).toBeLessThan(0.08);
  expect(luminance(await page.$eval('#iconpath', (el) => getComputedStyle(el).fill))).toBeGreaterThan(0.5);
  // Cross-origin stylesheet (fetched through the background) is transformed.
  await expect.poll(async () => luminance(await bg(page, '#cross'))).toBeLessThan(0.1);
  // Open shadow roots and CSS-in-JS insertRule are covered.
  await expect.poll(async () => luminance(await page.$eval('#widget', (el) => getComputedStyle(el.shadowRoot!.querySelector('#inner')!).backgroundColor))).toBeLessThan(0.05);
  await expect.poll(async () => luminance(await bg(page, '#cssinjs')), { timeout: 5000 }).toBeLessThan(0.05);
  // Dark logo on transparency is inverted; the photo is not.
  await expect.poll(() => page.getAttribute('#logo', 'data-nyx-invert')).toBe('');
  expect(await page.getAttribute('#photo', 'data-nyx-invert')).toBeNull();
  if (SCREENSHOTS) await page.screenshot({ path: join(SCREENSHOTS, 'after.png') });
});

test.describe('light system appearance', () => {
  test.use({ colorScheme: 'light' });

  test('Auto leaves pages alone in light mode; On darkens them; site Off wins', async ({ context, worker }) => {
    const page = await context.newPage();
    await page.goto(url('light.html'));
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);
    expect(await bg(page, 'body')).toBe('rgb(255, 255, 255)');
    expect(await page.getAttribute('html', 'data-nyx-active')).toBeNull();
    if (SCREENSHOTS) await page.screenshot({ path: join(SCREENSHOTS, 'before.png') });

    await setSettings(worker, (s) => {
      s.global = { ...(s.global ?? {}), mode: 'on', updatedAt: Date.now() };
    });
    await expect.poll(() => bg(page, 'body')).toBe('rgb(28, 28, 30)');

    await setSettings(worker, (s) => {
      s.sites = { localhost: { mode: 'off', themeId: null, pausedUntil: null, ignoreBuiltInDarkMode: null, appearance: {}, updatedAt: Date.now() } };
    });
    await expect.poll(() => bg(page, 'body')).toBe('rgb(255, 255, 255)');
    expect(await page.$$eval('style.nyx-style', (els) => els.length)).toBe(0);
  });
});

test('switches themes live and applies image brightness and grayscale', async ({ context, worker }) => {
  const page = await openLight(context);
  await setSettings(worker, (s) => {
    s.global = { ...(s.global ?? {}), defaultThemeId: 'sepia', updatedAt: Date.now() };
  });
  await expect.poll(() => bg(page, 'body')).toBe('rgb(58, 48, 38)');
  expect(await page.$eval('#photo', (el) => getComputedStyle(el).filter)).toContain('brightness(0.9)');
  await setSettings(worker, (s) => {
    s.global.defaultThemeId = 'grayscale';
  });
  await expect.poll(() => page.$eval('#photo', (el) => getComputedStyle(el).filter)).toContain('grayscale(1)');
});

test('pause until tomorrow stops darkening on that site only', async ({ context, worker }) => {
  const page = await openLight(context);
  await setSettings(worker, (s) => {
    s.sites = { localhost: { mode: 'default', themeId: null, pausedUntil: Date.now() + 3_600_000, ignoreBuiltInDarkMode: null, appearance: {}, updatedAt: Date.now() } };
  });
  await expect.poll(() => bg(page, 'body')).toBe('rgb(255, 255, 255)');
});

test('leaves sites with their own dark mode alone unless told to ignore it', async ({ context, worker }) => {
  const page = await context.newPage();
  await page.goto(url('dark.html'));
  await page.waitForLoadState('load');
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBeNull();
  expect(await bg(page, '#panel')).toBe('rgb(22, 27, 34)');

  await setSettings(worker, (s) => {
    s.sites = { localhost: { mode: 'default', themeId: null, pausedUntil: null, ignoreBuiltInDarkMode: true, appearance: {}, updatedAt: Date.now() } };
  });
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBe('');
});

test('re-detects when a site switches its own theme', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('toggle.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await bg(page, '#main'))).toBeLessThan(0.05);
  expect(await page.getAttribute('html', 'data-nyx-active')).toBe('');
  await page.evaluate(() => (document.documentElement.className = 'dark'));
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBeNull();
  expect(await bg(page, '#main')).toBe('rgb(16, 20, 24)');
});

test('advanced appearance: dynamic colors off, background images hidden, inversion off', async ({ context, worker }) => {
  const page = await openLight(context);
  await setSettings(worker, (s) => {
    s.global = { ...(s.global ?? {}), advancedAppearanceEnabled: true, updatedAt: Date.now() };
    s.sites = { localhost: { mode: 'default', themeId: null, pausedUntil: null, ignoreBuiltInDarkMode: null, appearance: { dynamicColors: false, imageInversion: false }, updatedAt: Date.now() } };
  });
  await expect.poll(async () => {
    const [r, , b] = (await bg(page, '#cta')).match(/\d+/g)!.map(Number);
    return Math.abs(b - r);
  }).toBeLessThan(12);
  await expect.poll(() => page.getAttribute('#logo', 'data-nyx-invert')).toBeNull();
});

test('settings page imports a Noir theme link', async ({ context, worker }) => {
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/options.html#themes`);
  await page.fill('input[type="url"]', 'https://getnoir.app/theme?name=John%E2%80%99s%20Theme&bg=182530&text=DBB745&imageBrightness=0.93');
  await page.click('text=Import');
  await expect(page.locator('.theme-card h3', { hasText: 'John’s Theme' })).toBeVisible();
  const stored = await worker.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('settings')).settings.customThemes);
  expect(stored[0]).toMatchObject({ name: 'John’s Theme', background: '#182530', text: '#dbb745', imageBrightness: 0.93 });
  if (SCREENSHOTS) await page.screenshot({ path: join(SCREENSHOTS, 'settings-themes.png'), fullPage: false });
});

test('toolbar menu renders', async ({ context, worker }) => {
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 340, height: 520 });
  await page.goto(`chrome-extension://${id}/popup.html`);
  await expect(page.getByRole('radiogroup', { name: 'Global status' })).toBeVisible();
});
