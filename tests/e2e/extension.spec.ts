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

/** Samples composited screenshots, including filters and opacity that getImageData ignores. */
async function renderedPixels(page: Page, selector: string, points: number[][]): Promise<number[][]> {
  const png = await page.locator(selector).screenshot();
  return page.evaluate(async ({ bytes, points }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3));
  }, { bytes: Array.from(png), points });
}

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

test('contrast rechecks keep repaired text readable when it transitions color', async ({ context, worker }) => {
  await worker.evaluate(() => { (globalThis as any).fetch = () => Promise.reject(new TypeError('blocked')); });
  const page = await context.newPage();
  await page.goto(url('compose.html'));
  await expect(page.locator('#compose')).toHaveAttribute('data-nyx-fix', '');
  await page.locator('#compose').evaluate((el: HTMLElement) => {
    el.style.transition = 'color 5s linear';
    el.firstChild!.textContent = 'Compose message';
  });
  await page.waitForTimeout(300);
  expect(await page.getAttribute('#compose', 'data-nyx-fix')).toBe('');
  const text = luminance(await fg(page, '#compose'));
  const paper = luminance(await bg(page, '.compose'));
  expect((Math.max(text, paper) + .05) / (Math.min(text, paper) + .05)).toBeGreaterThan(4.4);
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

test('native form controls stay editable after shadow-root polling', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(url('native-controls.html'));
  await expect(page.locator('body')).toHaveAttribute('data-settled', 'true');
  expect(await page.getAttribute('html', 'data-nyx-active')).toBe('');
  await page.locator('#comment').fill('First line\nSecond line');
  await page.locator('#late-comment').fill('Added after load');
  await page.locator('#search').fill('Search text');
  await page.locator('#choice').selectOption({ label: 'Two' });
  await expect(page.locator('#comment')).toHaveValue('First line\nSecond line');
  await expect(page.locator('#late-comment')).toHaveValue('Added after load');
  await expect(page.locator('#search')).toHaveValue('Search text');
  await expect(page.locator('#choice')).toHaveValue('Two');
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

for (const mode of ['auto', 'on']) {
  for (const delayed of [false, true]) {
    test(`system appearance changes preserve native dark mode (${mode}, ${delayed ? 'delayed JS' : 'CSS'})`, async ({ context, worker }) => {
      await setSettings(worker, (s) => {
        s.global = { ...s.global, mode, updatedAt: Date.now() };
      });
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(url(`system-theme.html${delayed ? '?delayed=1' : ''}`));
      await page.waitForTimeout(350);
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBeNull();
      await expect.poll(() => bg(page, 'body')).toBe('rgb(16, 20, 24)');
      await page.emulateMedia({ colorScheme: 'light' });
      if (mode === 'on') {
        await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBe('');
        await expect.poll(() => bg(page, 'body')).toBe('rgb(28, 28, 30)');
      } else {
        await expect.poll(() => bg(page, 'body')).toBe('rgb(255, 255, 255)');
      }
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBeNull();
      await expect.poll(() => bg(page, 'body')).toBe('rgb(16, 20, 24)');
    });
  }
}

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

test('Google Sheets darkens canvas cells and sprites, follows new grids, and restores on disable', async ({ context, worker }) => {
  const fixture = readFileSync(join(FIXTURES, 'google-surfaces.html'), 'utf8');
  await context.route('https://docs.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: fixture }));
  const page = await context.newPage();
  await page.goto('https://docs.google.com/spreadsheets/d/nyx-fixture/edit');
  const filter = (selector: string) => page.$eval(selector, (el) => getComputedStyle(el).filter);
  await expect.poll(() => filter('#grid')).toContain('invert(');
  expect(await filter('#chart')).toBe('none');
  expect(await filter('.docs-icon-img')).toBe('invert(1)');

  const pixels = async () => {
    const [paper, ink, blue] = await renderedPixels(page, '#grid', [[80, 80], [25, 25], [170, 20]]);
    return { paper, ink, blue };
  };
  const dark = await pixels();
  expect(Math.max(...dark.paper)).toBeLessThan(55);
  expect(Math.min(...dark.ink)).toBeGreaterThan(200);
  expect(dark.blue[2]).toBeGreaterThan(dark.blue[0] + 60);
  if (SCREENSHOTS) await page.screenshot({ path: join(SCREENSHOTS, 'google-sheets-dark.png') });

  await page.evaluate(() => {
    const grid = document.querySelector('#grid')!;
    const replacement = grid.cloneNode() as HTMLCanvasElement;
    grid.replaceWith(replacement);
    replacement.getContext('2d')!.fillRect(0, 0, 10, 10);
  });
  expect(await filter('#grid')).toContain('invert(');
  await setSettings(worker, (s) => { s.global = { ...s.global, mode: 'off', updatedAt: Date.now() }; });
  await expect.poll(() => filter('#grid')).toBe('none');
  expect(await filter('.docs-icon-img')).toBe('none');
  await page.reload();
  expect((await pixels()).paper).toEqual([255, 255, 255]);
  expect((await pixels()).ink).toEqual([0, 0, 0]);

  // A Docs document with the same markup must not receive the Sheets workaround.
  await setSettings(worker, (s) => { s.global = { ...s.global, mode: 'on', updatedAt: Date.now() }; });
  await page.goto('https://docs.google.com/document/d/nyx-fixture/edit');
  await expect(page.locator('html')).toHaveAttribute('data-nyx-active', '');
  expect(await filter('#grid')).toBe('none');
  if (SCREENSHOTS) await page.screenshot({ path: join(SCREENSHOTS, 'google-docs-unaffected.png') });
});

test('Gmail search sprites remain visible at rest and on keyboard focus', async ({ context, worker }) => {
  void worker;
  await context.route('https://mail.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: readFileSync(join(FIXTURES, 'google-surfaces.html'), 'utf8') }));
  const page = await context.newPage();
  await page.goto('https://mail.google.com/mail/u/0/');
  const filter = (selector: string) => page.$eval(selector, (el) => getComputedStyle(el).filter);
  await expect.poll(() => filter('.asor_i5')).toBe('invert(1)');
  expect(await filter('.gsaq_b')).toBe('invert(1)');
  expect(await filter('#grid')).toBe('none');
  const iconContrast = async (selector: string) => {
    const [ink, paper] = await renderedPixels(page, selector, [[10, 10], [10, 2]]);
    return (luminance(`rgb(${ink.join(',')})`) + 0.05) / (luminance(`rgb(${paper.join(',')})`) + 0.05);
  };
  expect(await iconContrast('.asor_i5')).toBeGreaterThan(3);
  expect(await iconContrast('.gsaq_b')).toBeGreaterThan(3);
  await page.locator('.suggestion').focus();
  expect(await iconContrast('.asor_i5')).toBeGreaterThan(3);
  await page.locator('.suggestion').hover();
  expect(await iconContrast('.gsaq_b')).toBeGreaterThan(3);
  if (SCREENSHOTS) await page.screenshot({ path: join(SCREENSHOTS, 'gmail-search-sprites.png') });
});

test('browser appearance changes hand native dark mode back to the site in Auto', async ({ context, worker }) => {
  void worker;
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(url('system-theme.html'));
  await expect.poll(() => bg(page, 'body')).toBe('rgb(255, 255, 255)');
  await page.waitForTimeout(350); // let the initial native-theme detection settle
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBeNull();
  await expect.poll(() => bg(page, 'body')).toBe('rgb(16, 20, 24)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => bg(page, 'body')).toBe('rgb(255, 255, 255)');
  await page.waitForTimeout(350); // let the initial native-theme detection settle
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => bg(page, 'body')).toBe('rgb(16, 20, 24)');
  expect(await page.getAttribute('html', 'data-nyx-active')).toBeNull();
});

test('browser appearance changes re-detect native dark mode while Nyx is forced On', async ({ context, worker }) => {
  await setSettings(worker, (s) => { s.global = { ...(s.global ?? {}), mode: 'on' }; });
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(url('system-theme.html'));
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBe('');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBeNull();
  expect(await bg(page, 'body')).toBe('rgb(16, 20, 24)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBe('');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBeNull();
  await setSettings(worker, (s) => {
    s.sites = { localhost: { mode: 'default', themeId: null, pausedUntil: null, ignoreBuiltInDarkMode: true, appearance: {}, updatedAt: Date.now() } };
  });
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBe('');
});

test('a native light-dark canvas is left alone in dark browser appearance', async ({ context, worker }) => {
  void worker;
  const page = await context.newPage();
  await page.goto(url('system-canvas.html'));
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBeNull();
  expect(await page.$$eval('style.nyx-style', (els) => els.length)).toBe(0);
});

test('fixed navigation over an article image does not dim it as a hero backdrop', async ({ context, worker }) => {
  void worker;
  const page = await context.newPage();
  await page.goto(url('chart-under-header.html'));
  await expect.poll(() => page.getAttribute('html', 'data-nyx-active')).toBe('');
  await page.waitForTimeout(2000); // allow asynchronous image analysis and the hydration retry
  expect(await page.getAttribute('#chart', 'data-nyx-dim-bg')).toBeNull();
  expect(await page.$eval('#chart', (el) => getComputedStyle(el).filter)).not.toContain('brightness(0.3)');
});

async function openReportReview(context: BrowserContext, worker: Worker, screenshot = true): Promise<Page> {
  await context.addInitScript(() => {
    if (!location.pathname.endsWith('/report.html')) return;
    (window as any).__clipboardWrites = 0;
    Object.defineProperty(navigator, 'clipboard', { value: { write: async (items: ClipboardItem[]) => {
      (window as any).__clipboardWrites++;
      const blob = await items[0].getType('image/png');
      (window as any).__copiedPng = Array.from(new Uint8Array(await blob.arrayBuffer()));
    } } });
    // Keep the review tab open after Continue so its resulting PNG can be inspected.
    window.close = () => undefined;
  });
  await context.route('https://github.com/mohsen1/nyx/issues/new?*', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Test issue draft</h1>' }));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  const opened = context.waitForEvent('page');
  await popup.evaluate(async (screenshot) => {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 648; canvas.height = 272;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1c1c1e'; ctx.fillRect(0, 0, 648, 272);
    for (const x of [0, 328]) {
      ctx.fillStyle = x ? '#202124' : '#fff'; ctx.fillRect(x, 32, 320, 240);
      ctx.fillStyle = x ? '#eee' : '#222'; ctx.font = '18px system-ui';
      ctx.fillText('Example account', x + 16, 67);
      ctx.font = '13px system-ui'; ctx.fillText('private@example.test', x + 16, 94);
      ctx.fillText('Recent activity', x + 16, 153);
      ctx.fillText('A sample row for screenshot review', x + 16, 184);
    }
    await (window as any).chrome.runtime.sendMessage({ type: 'prepareReport', draft: {
      title: 'Website issue: example.test', details: '**Website:** https://example.test/\n**Nyx:** test',
      image: screenshot ? canvas.toDataURL('image/png') : null,
      layout: screenshot ? { width: 648, height: 272, panels: [{ x: 0, y: 32, width: 320, height: 240 }, { x: 328, y: 32, width: 320, height: 240 }] } : null,
    } });
  }, screenshot);
  const review = await opened;
  await review.getByRole('heading', { name: 'Review screenshot', exact: true }).waitFor();
  if (screenshot) await expect.poll(() => review.locator('.report-preview').evaluateAll((els) => els.length === 2 && els.every((el) => (el as HTMLImageElement).complete))).toBe(true);
  return review;
}

test('report review burns blackouts into both PNG views before any clipboard write', async ({ context, worker }) => {
  const page = await openReportReview(context, worker);
  expect(await page.evaluate(() => (window as any).__clipboardWrites)).toBe(0);
  const preview = await page.locator('.report-preview').first().boundingBox();
  expect(preview).not.toBeNull();
  const r = preview!;
  await page.mouse.move(r.x + r.width * 0.03, r.y + r.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.6, r.y + r.height * 0.3);
  await page.mouse.up();
  await expect(page.getByRole('status')).toHaveText('1 blackout applied to both views.');
  // Reversible while editing, then committed through the keyboard-accessible percentage form.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByText('Black out an area using the keyboard', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Left percent' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Top percent' }).fill('10');
  await page.getByRole('spinbutton', { name: 'Width percent' }).fill('57');
  await page.getByRole('spinbutton', { name: 'Height percent' }).fill('20');
  await page.getByRole('button', { name: 'Add blackout', exact: true }).click();
  const copied = page.evaluate(() => new Promise<number[][]>((resolve) => {
    const timer = setInterval(async () => {
      const bytes = (window as any).__copiedPng;
      if (!bytes) return;
      clearInterval(timer);
      const image = new Image();
      image.src = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      resolve([Array.from(ctx.getImageData(30, 80, 1, 1).data), Array.from(ctx.getImageData(358, 80, 1, 1).data), Array.from(ctx.getImageData(250, 80, 1, 1).data)]);
      URL.revokeObjectURL(image.src);
    }, 20);
  }));
  await page.getByRole('button', { name: 'Copy screenshot and continue', exact: true }).click();
  expect(await copied).toEqual([[0, 0, 0, 255], [0, 0, 0, 255], [255, 255, 255, 255]]);
  expect(await page.evaluate(() => (window as any).__clipboardWrites)).toBe(1);
  const storage = await worker.evaluate(async () => (globalThis as any).chrome.storage.local.get(null));
  expect(JSON.stringify(storage)).not.toContain('data:image/png');
});

test('canceling a report copies nothing; raw screenshots cannot be retrieved after reload', async ({ context, worker }) => {
  const page = await openReportReview(context, worker);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__clipboardWrites)).toBe(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Screenshot no longer available' })).toBeVisible();
});

test('reporting still works when screenshots cannot be captured', async ({ context, worker }) => {
  const page = await openReportReview(context, worker, false);
  await expect(page.getByRole('button', { name: 'Copy screenshot and continue', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Continue without screenshot', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue without screenshot', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__clipboardWrites)).toBe(0);
});

test('clipboard failure keeps blackouts available and opens no issue', async ({ context, worker }) => {
  const page = await openReportReview(context, worker);
  await page.evaluate(() => { navigator.clipboard.write = async () => { throw new Error('Clipboard denied'); }; });
  await page.getByText('Black out an area using the keyboard', { exact: true }).click();
  await page.getByRole('button', { name: 'Add blackout', exact: true }).click();
  await page.getByRole('button', { name: 'Copy screenshot and continue', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Could not copy the screenshot.');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Copy screenshot and continue', exact: true })).toBeEnabled();
  expect(context.pages().some((p) => p.url().startsWith('https://github.com/'))).toBe(false);
});

test('the toolbar report action opens privacy review before touching the clipboard', async ({ context, worker }) => {
  const popup = await context.newPage();
  await popup.addInitScript(() => {
    (window as any).__clipboardWrites = 0;
    Object.defineProperty(navigator, 'clipboard', { value: { write: async () => { (window as any).__clipboardWrites++; } } });
    const tabs = (window as any).chrome.tabs;
    tabs.query = async () => [{ id: 7, windowId: 1, url: 'https://example.test/' }];
    tabs.sendMessage = async (_id: number, message: { type: string }) => message.type === 'getPageState' ? {
      url: 'https://example.test/', active: true, builtInDarkMode: false,
      decision: { enabled: true, reason: 'global-on', effectiveMode: 'on', ignoreBuiltInDarkMode: false, themeId: 'dark' },
    } : true;
    tabs.captureVisibleTab = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 640, 480);
      return canvas.toDataURL('image/png');
    };
    window.close = () => undefined;
  });
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  const opened = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'Report a problem', exact: true }).click();
  const review = await opened;
  await expect(review.getByRole('heading', { name: 'Review screenshot', exact: true })).toBeVisible();
  await expect(review.locator('.report-preview')).toHaveCount(2);
  expect(await popup.evaluate(() => (window as any).__clipboardWrites)).toBe(0);
});


for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`report appearance ${colorScheme}`, () => {
    test.use({ colorScheme });
    for (const [device, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['user-1280', 1280, 720]] as const) {
      test(`${device} keeps both screenshot previews readable`, async ({ context, worker }) => {
        const page = await openReportReview(context, worker);
        await page.setViewportSize({ width, height });
        await page.getByText('Black out an area using the keyboard', { exact: true }).click();
        await page.getByRole('spinbutton', { name: 'Left percent' }).fill('3');
        await page.getByRole('spinbutton', { name: 'Top percent' }).fill('10');
        await page.getByRole('spinbutton', { name: 'Width percent' }).fill('57');
        await page.getByRole('spinbutton', { name: 'Height percent' }).fill('20');
        await page.getByRole('button', { name: 'Add blackout', exact: true }).click();
        await expect(page.getByRole('status')).toHaveText('1 blackout applied to both views.');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (SCREENSHOTS) await page.screenshot({ path: join(SCREENSHOTS, `report-review-${device}-${colorScheme}.png`), fullPage: true });
      });
    }
  });
}


test('actual-size inspection scrolls without misaligning blackout pixels', async ({ context, worker }) => {
  const page = await openReportReview(context, worker);
  await page.setViewportSize({ width: 240, height: 844 });
  await page.getByText('Black out an area using the keyboard', { exact: true }).click();
  await page.getByRole('button', { name: 'Add blackout', exact: true }).click();
  await page.getByRole('button', { name: 'Show actual size', exact: true }).click();
  const viewport = page.getByRole('region', { name: 'Original screenshot scroll area' });
  expect(await viewport.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const sizes = await page.locator('.report-preview').first().evaluate((el) => {
    const img = el as HTMLImageElement;
    const mask = img.parentElement!.querySelector('.report-blackout')!;
    return { width: img.getBoundingClientRect().width, natural: img.naturalWidth, mask: mask.getBoundingClientRect().width };
  });
  expect(sizes.width).toBe(sizes.natural);
  expect(sizes.mask).toBeCloseTo(sizes.width * 0.2, 0);
  if (SCREENSHOTS) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(SCREENSHOTS, 'report-review-mobile-actual-size-dark.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'Fit screenshots', exact: true }).click();
  expect(await viewport.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
