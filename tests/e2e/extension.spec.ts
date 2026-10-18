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
const LOCAL_CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

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
    if (path.endsWith('.html')) body = body.toString().replaceAll('CROSS_ORIGIN', `http://127.0.0.1:${port}`);
    const cors: Record<string, string> = req.url!.includes('nocors') ? {} : { 'access-control-allow-origin': '*' };
    const delay = Number(new URL(req.url!, 'http://x').searchParams.get('delay') ?? 0);
    setTimeout(() => res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', ...cors }).end(body), delay);
  });
  return new Promise((r) => server.listen(0, () => ((port = (server.address() as { port: number }).port), r())));
}

const url = (name: string) => `http://localhost:${port}/${name}`;

type Fixtures = { context: BrowserContext; worker: Worker };

const test = base.extend<Fixtures>({
  context: async ({ colorScheme }, use) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nyx-')), {
      // Extensions need full Chromium (new headless), not the headless shell.
      ...(LOCAL_CHROMIUM ? { executablePath: LOCAL_CHROMIUM } : { channel: 'chromium' }),
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

test('a modal backdrop over a light page is not mistaken for a dark mode', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('modal.html'));
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  expect(await page.getAttribute('html', 'data-nyx-active')).toBe('');
  await expect.poll(async () => luminance(await bg(page, '#card'))).toBeLessThan(0.05);
});

test('falls back to fetching cross-origin sheets from the page when the background cannot', async ({ context, worker }) => {
  // Safari grants host access per website, so the background often can't reach a site's CDN.
  await worker.evaluate(() => {
    (globalThis as any).fetch = () => Promise.reject(new TypeError('blocked'));
  });
  const page = await context.newPage();
  await page.goto(url('light.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await bg(page, '#cross'))).toBeLessThan(0.1);
});

test('a stylesheet that can be neither read nor fetched is darkened from computed colors (Apple Support in Safari)', async ({ context, worker }) => {
  await worker.evaluate(() => {
    (globalThis as any).fetch = () => Promise.reject(new TypeError('blocked'));
  });
  const page = await context.newPage();
  await page.goto(url('blind.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await bg(page, 'body'))).toBeLessThan(0.08);
  await expect.poll(async () => luminance(await bg(page, '#card'))).toBeLessThan(0.1);
  await expect.poll(async () => luminance(await fg(page, '#text'))).toBeGreaterThan(0.3);
  // A white top gradient layer over a gradient border (Naver's popup): the surface is mapped, the border stays.
  await expect.poll(() => page.$eval('#popup', (el) => getComputedStyle(el).backgroundImage)).not.toContain('rgb(255, 255, 255)');
  expect(await page.$eval('#popup', (el) => getComputedStyle(el).backgroundImage)).toContain('rgb(50, 131, 253)');
  await expect.poll(async () => luminance(await fg(page, '#popup p'))).toBeGreaterThan(0.18);
  await expect.poll(() => page.$eval('#dots', (el) => getComputedStyle(el).backgroundImage)).not.toContain('rgb(255, 255, 255)');
  // Text drawn as a wide SVG (Apple's global nav) is lifted like an icon.
  await expect.poll(async () => luminance(await page.$eval('#wordmark', (el) => getComputedStyle(el).fill))).toBeGreaterThan(0.18);
});

test('a pale hero image whose pixels cannot be read is dimmed when the page text on it is dark (Box in Safari)', async ({ context, worker }) => {
  await worker.evaluate(() => {
    (globalThis as any).fetch = () => Promise.reject(new TypeError('blocked'));
  });
  const page = await context.newPage();
  await page.goto(url('pale-hero-blind.html'));
  await page.waitForLoadState('load');
  await expect.poll(() => page.getAttribute('#hero', 'data-nyx-dim-bg'), { timeout: 8000 }).toBe('');
});

test('legacy pages: body background tiles, bgcolor and text attributes', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('legacy.html'));
  await page.waitForLoadState('load');
  await expect.poll(() => page.$eval('body', (el) => getComputedStyle(el).backgroundImage)).toBe('none');
  expect(luminance(await bg(page, 'body'))).toBeLessThan(0.05);
  expect(luminance(await fg(page, '#essay'))).toBeGreaterThan(0.5);
});

test('a cross-origin stylesheet included twice is darkened in both places', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('duplicate-sheets.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await bg(page, '#cross'))).toBeLessThan(0.1);
});

test('text whose color Nyx could not map is lifted to a readable contrast', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('unmapped.html'));
  await page.waitForLoadState('load');
  const ratio = async (sel: string) => {
    const fgL = luminance(await fg(page, sel));
    const bgL = luminance(await bg(page, 'body'));
    return (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05);
  };
  await expect.poll(() => ratio('#name')).toBeGreaterThan(4.4);
  // Custom properties set inline get role copies, so this is mapped rather than rescued.
  await expect.poll(async () => luminance(await bg(page, '#inlinevar'))).toBeLessThan(0.08);
  expect(await page.getAttribute('#name', 'data-nyx-fix')).toBeNull();
  // Inline !important colors (cookie banners, widgets) beat any stylesheet rule.
  await expect.poll(async () => luminance(await bg(page, '#inlineimp'))).toBeLessThan(0.08);
  expect(luminance(await fg(page, '#inlineimp'))).toBeGreaterThan(0.5);
  await page.waitForSelector('#scripted');
  await expect.poll(() => ratio('#scripted')).toBeGreaterThan(4.4);
});

test('a large pale background image is darkened so text on it stays readable', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('pale-hero.html'));
  await page.waitForLoadState('load');
  await expect.poll(() => page.getAttribute('#hero', 'data-nyx-dim-bg')).toBe('');
  expect(await page.$eval('#hero', (el) => getComputedStyle(el).backgroundBlendMode)).toBe('multiply');
  expect(luminance(await fg(page, '#title'))).toBeGreaterThan(0.4);
});

test('an image used only as a mask over a CSS color is not inverted (Notion logo wall)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('masked-logo.html'));
  await page.waitForLoadState('load');
  await expect.poll(() => page.getAttribute('#plain', 'data-nyx-invert')).toBe('');
  expect(await page.getAttribute('#masked', 'data-nyx-invert')).toBeNull();
  expect(luminance(await page.$eval('#masked', (el) => getComputedStyle(el).backgroundColor))).toBeGreaterThan(0.4);
});

test('a logo mixing color with a gray wordmark is recolored, keeping the color', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('logos.html'));
  await page.waitForLoadState('load');
  await expect.poll(() => page.getAttribute('#mixed', 'data-nyx-recolor')).toBe('');
  expect(await page.$eval('#mixed', (el) => getComputedStyle(el).content)).toMatch(/^url\("data:image\/png/);
  expect(await page.getAttribute('#mixed', 'data-nyx-invert')).toBeNull();
  // The same logo drawn as a CSS background, from a stylesheet and from an inline style.
  for (const sel of ['#bglogo', '#inlinelogo']) {
    await expect.poll(() => page.getAttribute(sel, 'data-nyx-bg-recolor'), { timeout: 8000 }).toBe('');
    expect(await page.$eval(sel, (el) => getComputedStyle(el).backgroundImage)).toMatch(/^url\("data:image\/png/);
  }
});

test('text on a button with an icon background is still checked (Gmail Compose)', async ({ context, worker }) => {
  // The label's color comes from a stylesheet Nyx can't read at all.
  await worker.evaluate(() => {
    (globalThis as any).fetch = () => Promise.reject(new TypeError('blocked'));
  });
  const page = await context.newPage();
  await page.goto(url('compose.html'));
  await page.waitForLoadState('load');
  const ratio = async () => {
    const t = luminance(await fg(page, '#compose'));
    const b = luminance(await bg(page, '.compose'));
    return (Math.max(t, b) + 0.05) / (Math.min(t, b) + 0.05);
  };
  await expect.poll(ratio).toBeGreaterThan(4.4);
  // Faded with opacity: what you see is the color mixed 70% over the background.
  const seen = async () => {
    const [t, b] = await page.$eval('#meta', (el) => [getComputedStyle(el).color, getComputedStyle(document.body).backgroundColor]);
    const ch = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const mix = ch(t).map((v, i) => v * 0.7 + ch(b)[i] * 0.3);
    const tl = luminance(`rgb(${mix.join(',')})`), bl = luminance(b);
    return (Math.max(tl, bl) + 0.05) / (Math.min(tl, bl) + 0.05);
  };
  await expect.poll(seen).toBeGreaterThan(4.4);
  // A gray icon is lifted; a red one keeps its color.
  const fill = (sel: string) => page.$eval(sel, (el) => getComputedStyle(el).fill);
  await expect.poll(async () => luminance(await fill('#icon'))).toBeGreaterThan(0.15); // ≥ 3:1 on the dark page
  expect(await fill('#icon-red')).toBe('rgb(197, 34, 31)');
  // An icon-font glyph drawn by ::before.
  await expect.poll(async () => luminance(await page.$eval('#star', (el) => getComputedStyle(el, '::before').color))).toBeGreaterThan(0.15);
  // Text in a form field (not a text node).
  await expect.poll(async () => luminance(await fg(page, '#search'))).toBeGreaterThan(0.15); // ≥ 3:1
  // A mask icon whose ink color comes from another rule.
  await expect.poll(async () => luminance(await bg(page, '#maskicon'))).toBeGreaterThan(0.15);
});

test('a WebGL hero whose pixels cannot be read is darkened under light text (Asana)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('webgl-hero.html'));
  await page.waitForLoadState('load');
  await expect.poll(() => page.getAttribute('#webgl', 'data-nyx-dim-bg'), { timeout: 8000 }).toBe('');
});

test('backdrops beside the content and canvas heroes are darkened', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('backdrops.html'));
  await page.waitForLoadState('load');
  // A full-page pale image behind a sign-in card, a sibling of the text rather than an ancestor.
  await expect.poll(() => page.getAttribute('#backdrop', 'data-nyx-dim-bg'), { timeout: 8000 }).toBe('');
  // A pale <canvas> with a heading drawn over it.
  await expect.poll(() => page.getAttribute('#canvas', 'data-nyx-dim-bg'), { timeout: 8000 }).toBe('');
  // A button-sized pale sprite with text on it (old Reddit's "Submit a new link").
  await expect.poll(() => page.getAttribute('#submit', 'data-nyx-dim-bg'), { timeout: 8000 }).toBe('');
  // A short full-width header strip with nothing on it (timeanddate.com).
  await expect.poll(() => page.getAttribute('#banner', 'data-nyx-dim-bg'), { timeout: 8000 }).toBe('');
});

test('a light page that transitions its background is not mistaken for a dark one (Bandcamp)', async ({ context }) => {
  const page = await context.newPage();
  // The fixture's load event waits on a slow image, so the DOMContentLoaded check runs alone.
  await page.goto(url('transition.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  expect(await page.getAttribute('html', 'data-nyx-active')).toBe('');
  await page.waitForLoadState('load');
  await page.waitForTimeout(800);
  expect(await page.getAttribute('html', 'data-nyx-active')).toBe('');
  expect(luminance(await bg(page, 'body'))).toBeLessThan(0.05);
});

test('channel lists assembled from one variable per channel are mapped (XenForo)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('split-channels.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await fg(page, '#text')), { timeout: 8000 }).toBeGreaterThan(0.5);
  await expect.poll(async () => luminance(await bg(page, '#block')), { timeout: 8000 }).toBeLessThan(0.08);
  // A gradient whose second stop is composed in place from the channel variables.
  await expect
    .poll(() => page.$eval('#header', (el) => getComputedStyle(el).backgroundImage), { timeout: 8000 })
    .not.toMatch(/rgb\((2[3-5]\d), \1, \1\)/);
  // A gradient lost to the CSSOM behind a var() shorthand is read back and darkened.
  await expect
    .poll(() => page.$eval('#card', (el) => getComputedStyle(el).backgroundImage), { timeout: 8000 })
    .not.toContain('rgb(232, 240, 254)');
});

test('colors composed from several variables are resolved and darkened (iCloud)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('composed.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await bg(page, 'body'))).toBeLessThan(0.05);
  await expect.poll(async () => luminance(await bg(page, '#panel'))).toBeLessThan(0.08);
  await expect.poll(async () => luminance(await bg(page, '#menu'))).toBeLessThan(0.08);
  await expect.poll(async () => luminance(await bg(page, '#lost'))).toBeLessThan(0.08);
  // background-color: currentColor is mapped as a background (darker), so white labels stay readable.
  await expect.poll(async () => luminance(await bg(page, '#brand'))).toBeLessThan(0.2);
  expect(luminance(await fg(page, '#menu'))).toBeGreaterThan(0.4);
  expect(luminance(await fg(page, '#text'))).toBeGreaterThan(0.5);
});

test('a shadow root attached to a plain element after load is styled (consent dialogs)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('late-shadow.html'));
  await page.waitForLoadState('load');
  await expect
    .poll(async () => {
      const panelBg = await page.evaluate(() => {
        const panel = document.getElementById('consent')?.shadowRoot?.getElementById('panel');
        return panel ? getComputedStyle(panel).backgroundColor : 'rgb(255, 255, 255)';
      });
      return luminance(panelBg);
    }, { timeout: 5000 })
    .toBeLessThan(0.08);
});

test('a fetched stylesheet starting with a Google Fonts @import is still darkened (ycombinator.com)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('fonts-import.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await bg(page, 'body'))).toBeLessThan(0.08);
});

test('color functions over a channel variable with a channel fallback are darkened (IKEA)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('channel-fallback.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await bg(page, 'body'))).toBeLessThan(0.08);
  const color = await page.evaluate(() => getComputedStyle(document.getElementById('text')!).color);
  expect(luminance(color)).toBeGreaterThan(0.4);
});

test('an SVG fill attribute that points at a variable is mapped (The Guardian)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('svg-var-fill.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await page.$eval('#icon', (el) => getComputedStyle(el).fill))).toBeGreaterThan(0.18);
});

test('a closed shadow root is styled where the browser exposes it (Transcend consent manager)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('closed-shadow.html'));
  await page.waitForLoadState('load');
  await expect
    .poll(async () => luminance(await page.evaluate(() => {
      const root = (window as unknown as { __closedRoot?: ShadowRoot }).__closedRoot;
      const panel = root?.getElementById('panel');
      return panel ? getComputedStyle(panel).backgroundColor : 'rgb(255, 255, 255)';
    })), { timeout: 8000 })
    .toBeLessThan(0.1);
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
  await expect(page.locator('.tile h3', { hasText: 'John’s Theme' })).toBeVisible();
  const stored = await worker.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('settings')).settings.customThemes);
  expect(stored[0]).toMatchObject({ name: 'John’s Theme', background: '#182530', text: '#dbb745', imageBrightness: 0.93 });
  if (SCREENSHOTS) await page.screenshot({ path: join(SCREENSHOTS, 'settings-themes.png'), fullPage: false });
});

test('a problem report can show the page without Nyx for a moment', async ({ context, worker }) => {
  const page = await context.newPage();
  await page.goto(url('light.html'));
  await page.waitForLoadState('load');
  await expect.poll(async () => luminance(await bg(page, 'body'))).toBeLessThan(0.05);
  const suspend = (suspended: boolean) =>
    worker.evaluate(async ({ href, suspended }) => {
      const c = (globalThis as any).chrome;
      const [t] = await c.tabs.query({ url: href });
      return c.tabs.sendMessage(t.id, { type: 'setSuspended', suspended });
    }, { href: page.url(), suspended });
  // The answer comes after the original page has been painted, ready for a screenshot.
  expect(await suspend(true)).toBe(true);
  expect(luminance(await bg(page, 'body'))).toBeGreaterThan(0.8);
  await suspend(false);
  await expect.poll(async () => luminance(await bg(page, 'body'))).toBeLessThan(0.05);
});

test('toolbar menu renders', async ({ context, worker }) => {
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 340, height: 520 });
  await page.goto(`chrome-extension://${id}/popup.html`);
  await expect(page.getByRole('radiogroup', { name: 'Global status' })).toBeVisible();
});
