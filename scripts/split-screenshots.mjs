// Before/after screenshots for the README and website: each image shows the original page and
// the page with Nyx, split along a diagonal.
//   npm run build && node scripts/split-screenshots.mjs  → docs/images/split-*.png (needs network)
import { chromium } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs/images');
await mkdir(out, { recursive: true });
const ext = process.env.NYX_EXT || join(root, 'dist/chrome');
const [W, H, SCALE] = [1280, 800, 2];

const pages = [
  { name: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Night_sky', theme: 'dark' },
  { name: 'hackernews', url: 'https://news.ycombinator.com/', theme: 'dark' },
  { name: 'github', url: 'https://github.com/torvalds/linux', theme: 'dracula' },
  { name: 'xkcd', url: 'https://xkcd.com/', theme: 'sepia' },
];

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nyx-split-')), {
  channel: 'chromium',
  headless: true,
  colorScheme: 'light',
  deviceScaleFactor: SCALE,
  viewport: { width: W, height: H },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const setGlobal = (patch) =>
  worker.evaluate(async (p) => {
    const s = (await chrome.storage.local.get('settings')).settings ?? {};
    s.global = { ...(s.global ?? {}), ...p, updatedAt: Date.now() };
    await chrome.storage.local.set({ settings: s });
  }, patch);

async function capture(url, theme) {
  await setGlobal(theme ? { mode: 'on', defaultThemeId: theme } : { mode: 'off' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return `data:image/png;base64,${png.toString('base64')}`;
}

const composer = await context.newPage();
for (const { name, url, theme } of pages) {
  const [before, after] = [await capture(url, null), await capture(url, theme)];
  // The dark half is clipped to the lower-right triangle; a thin line marks the seam.
  await composer.setContent(`<!doctype html><body style="margin:0;width:${W}px;height:${H}px;position:relative;overflow:hidden">
    <img src="${before}" style="position:absolute;inset:0;width:${W}px;height:${H}px">
    <img src="${after}" style="position:absolute;inset:0;width:${W}px;height:${H}px;clip-path:polygon(62% 0,100% 0,100% 100%,38% 100%)">
    <svg width="${W}" height="${H}" style="position:absolute;inset:0"><line x1="${W * 0.62}" y1="0" x2="${W * 0.38}" y2="${H}" stroke="#7c6cf0" stroke-width="3"/></svg>
  </body>`);
  await composer.waitForTimeout(200);
  await composer.screenshot({ path: join(out, `split-${name}.png`) });
  console.log(join(out, `split-${name}.png`));
}
await context.close();
