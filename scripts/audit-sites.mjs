// Loads real websites with the built extension in Chromium and flags pages that
// Nyx leaves light or renders unreadable. Needs network access.
//   npm run build && node scripts/audit-sites.mjs [url ...]  → audit-results/
import { chromium } from '@playwright/test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'audit-results');
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
const ext = process.env.NYX_EXT || join(root, 'dist/chrome');
const local = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nyx-audit-')), {
  ...(local ? { executablePath: local } : { channel: 'chromium' }),
  headless: true,
  colorScheme: 'light',
  viewport: { width: 1280, height: 860 },
  locale: 'en-US',
  // Some sites (Reddit) block the headless user agent outright.
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
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

const RESIDUAL = `(() => {
  // Any CSS color (oklch, lab, color(display-p3 ...)) to sRGB, through a 1x1 canvas.
  const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  cx.canvas.width = cx.canvas.height = 1;
  const cache = new Map();
  const parse = (c) => {
    if (cache.has(c)) return cache.get(c);
    let out = null;
    if (c && c !== 'transparent' && !/^rgba\\(0, 0, 0, 0\\)$/.test(c)) {
      const alpha = (() => { const m = /\\/\\s*([\\d.]+%?)\\s*\\)$|rgba\\([^,]+,[^,]+,[^,]+,\\s*([\\d.]+)\\)/.exec(c); if (!m) return 1; const v = m[1] ?? m[2]; return v.endsWith('%') ? parseFloat(v) / 100 : +v; })();
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000'; cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
      // getImageData returns un-premultiplied values; the alpha comes from the string.
      out = a ? { r, g, b, a: alpha } : null;
      if (out && alpha === 0) out = null;
    }
    cache.set(c, out);
    return out;
  };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const ratio = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
  const canvas = parse(getComputedStyle(document.documentElement).backgroundColor);
  const base = canvas && canvas.a > 0.01 ? canvas : { r: 255, g: 255, b: 255, a: 1 };
  const bad = [];
  let checked = 0;
  for (const el of document.querySelectorAll('body *')) {
    let own = false;
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim().length > 1) { own = true; break; }
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || +cs.opacity < 0.1) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.1) continue;
    const layers = [];
    let skip = false;
    let opacity = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== 'none') {
        const icon = !/gradient\\(/.test(s.backgroundImage) && s.backgroundRepeat.split(',').every((x) => x.trim() === 'no-repeat') &&
          (s.backgroundSize.split(',').every((v) => v.trim().split(/\\s+/).every((q) => /^[\\d.]+px$/.test(q) && parseFloat(q) <= 64)) ||
           (s.backgroundSize.split(',').every((v) => ['auto', 'contain'].includes(v.trim())) && n.getBoundingClientRect().height <= 64));
        if (!icon) { skip = true; break; }
      }
      const c = parse(s.backgroundColor);
      if (c && c.a >= 0.99) { layers.push(c); break; }
      opacity *= +s.opacity;
      if (c && c.a > 0.01) layers.push(c);
    }
    if (skip || opacity < 0.5) continue;
    let bg = base;
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    checked++;
    const t = over(fg, bg);
    const k = ratio(over({ ...t, a: opacity }, bg), bg);
    if (k < 3) bad.push({ k: +k.toFixed(2), tag: el.localName, cls: String(el.className?.baseVal ?? el.className ?? '').slice(0, 50), text: el.textContent.trim().slice(0, 30), fg: cs.color, bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')' });
  }
  return { checked, lowContrast: bad.length, samples: bad.slice(0, 5) };
})()`;

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
    // Text the contrast guard had to rescue: each one is a color the rewriter missed.
    row.fixes = await page.evaluate(() => document.querySelectorAll('[data-nyx-fix]').length);
    // Visible text still under 3:1 after everything Nyx does (an independent check of the guard).
    Object.assign(row, await page.evaluate(RESIDUAL));
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
