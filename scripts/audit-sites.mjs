// Loads real websites with the built extension in Chromium and flags pages that
// Nyx leaves light or renders unreadable. Needs network access.
//   npm run build && node scripts/audit-sites.mjs [url ...]  → test-results/audit/
import { chromium } from '@playwright/test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'test-results/audit');
await mkdir(out, { recursive: true });

const defaults = [
  'https://www.linkedin.com/', 'https://www.linkedin.com/company/microsoft', 'https://www.linkedin.com/pulse/topics/home/',
  'https://www.google.com/search?q=dark+mode', 'https://en.wikipedia.org/wiki/Moon', 'https://github.com/microsoft/vscode',
  'https://stackoverflow.com/questions/11227809', 'https://www.reddit.com/r/programming/', 'https://old.reddit.com/r/programming/',
  'https://news.ycombinator.com/item?id=1', 'https://www.youtube.com/', 'https://www.amazon.com/', 'https://www.nytimes.com/',
  'https://www.bbc.com/news', 'https://www.theguardian.com/international', 'https://medium.com/', 'https://www.apple.com/',
  'https://www.microsoft.com/en-us/', 'https://docs.python.org/3/tutorial/index.html', 'https://developer.mozilla.org/en-US/docs/Web/CSS',
  'https://www.npmjs.com/package/react', 'https://craigslist.org/', 'https://www.ebay.com/', 'https://www.imdb.com/', 'https://edition.cnn.com/',
  'https://stripe.com/docs', 'https://www.notion.com/', 'https://dev.to/', 'https://arstechnica.com/', 'https://www.theverge.com/',
  'https://www.wired.com/', 'https://www.booking.com/', 'https://www.airbnb.com/', 'https://www.paypal.com/', 'https://www.yelp.com/',
  'https://www.pinterest.com/', 'https://www.quora.com/', 'https://archive.org/', 'https://duckduckgo.com/?q=dark+mode', 'https://www.bing.com/',
  'https://www.espn.com/', 'https://www.nasa.gov/', 'https://www.gov.uk/', 'https://www.spiegel.de/', 'https://www.bahn.de/', 'https://xkcd.com/',
  'https://www.figma.com/', 'https://www.dropbox.com/', 'https://slack.com/', 'https://www.twitch.tv/', 'https://substack.com/',
  'https://www.wolframalpha.com/', 'https://www.w3.org/', 'https://www.craigslist.org/about/', 'https://www.economist.com/',
];
const urls = process.argv.slice(2).length ? process.argv.slice(2) : defaults;
const ext = join(root, 'dist/chrome');
const local = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nyx-audit-')), {
  ...(local ? { executablePath: local } : { channel: 'chromium' }),
  headless: true,
  colorScheme: 'light',
  viewport: { width: 1280, height: 860 },
  locale: 'en-US',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
await worker.evaluate(async () => {
  const s = (await chrome.storage.local.get('settings')).settings ?? {};
  s.global = { ...(s.global ?? {}), mode: 'on', defaultThemeId: 'dark', updatedAt: Date.now() };
  await chrome.storage.local.set({ settings: s });
});

// NYX_NO_FETCH=1 simulates Safari without host access to CDNs: the background
// script cannot fetch cross-origin stylesheets or images.
if (process.env.NYX_NO_FETCH) await worker.evaluate(() => { self.fetch = () => Promise.reject(new TypeError('blocked')); });

// Pixel stats of a screenshot, computed in a blank page.
const stats = await context.newPage();
async function measure(png) {
  return stats.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let light = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      if (l > 0.75) light++;
      n++;
    }
    return { light: +(light / n).toFixed(3) };
  }, `data:image/png;base64,${png.toString('base64')}`);
}

const results = [];
for (const url of urls) {
  const name = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  const page = await context.newPage();
  const row = { url, name };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    row.active = await page.evaluate(() => document.documentElement.hasAttribute('data-nyx-active'));
    row.nyxStyles = await page.evaluate(() => document.querySelectorAll('style[data-nyx=override]').length);
    const png = await page.screenshot({ type: 'png' });
    writeFileSync(join(out, `${name}.png`), png);
    Object.assign(row, await measure(png));
  } catch (e) {
    row.error = String(e.message || e).split('\n')[0];
  }
  await page.close();
  results.push(row);
  console.log(JSON.stringify(row));
}
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));
await context.close();
