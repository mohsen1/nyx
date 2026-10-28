// Loads real websites with the built extension in Chromium and flags pages that
// Nyx leaves light or renders unreadable. Needs network access.
//   npm run build && node scripts/audit-sites.mjs [url ...]  → audit-results/
// NYX_TRANSITIONS=1 also captures light → dark → light on each page.
// NYX_AUDIT_CONCURRENCY=1..4, NYX_AUDIT_OUT and NYX_EXT support repeatable runs
// against a frozen extension build. run.json records the bundle hash and browser.
import { chromium, webkit } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.NYX_AUDIT_OUT || join(root, 'audit-results');
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
  'https://www.gutenberg.org/', 'https://www.gnu.org/', 'https://www.rust-lang.org/', 'https://go.dev/',
  'https://www.ruby-lang.org/en/', 'https://www.debian.org/', 'https://www.kernel.org/', 'https://www.sqlite.org/',
  'https://www.openstreetmap.org/', 'https://www.metmuseum.org/', 'https://www.si.edu/', 'https://www.loc.gov/',
  'https://www.weather.gov/', 'https://www.nhs.uk/', 'https://www.who.int/', 'https://www.un.org/en/',
  'https://www.khanacademy.org/', 'https://www.coursera.org/', 'https://www.edx.org/', 'https://www.ted.com/',
  'https://www.ikea.com/us/en/', 'https://www.patagonia.com/', 'https://www.etsy.com/', 'https://www.allrecipes.com/',
  'https://www.seriouseats.com/', 'https://www.lonelyplanet.com/', 'https://www.nationalgeographic.com/', 'https://www.flickr.com/',
  'https://www.mozilla.org/', 'https://www.cloudflare.com/', 'https://www.wikipedia.org/', 'https://www.freebsd.org/',
];
const urls = process.argv.slice(2).length ? process.argv.slice(2) : defaults;
const ext = process.env.NYX_EXT || join(root, 'dist/chrome');
const local = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const startedAt = new Date().toISOString();

// NYX_ENGINE=webkit runs Safari's engine. Playwright's WebKit can't load extensions, so the
// Safari build's content script is injected into each page with a small shim for the extension
// APIs; resource fetches go through Node, as Safari's background page would make them.
const WEBKIT = process.env.NYX_ENGINE === 'webkit';
let context;
if (WEBKIT) {
  const browser = await webkit.launch();
  context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 860 }, locale: 'en-US' });
  await context.exposeBinding('__nyxFetch', async (_source, url, as) => {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) return null;
      if (as === 'text') return await res.text();
      const type = res.headers.get('content-type') || 'application/octet-stream';
      return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
    } catch {
      return null;
    }
  });
  await context.addInitScript(`(() => {
    const settings = { global: { mode: 'on', defaultThemeId: 'dark', updatedAt: Date.now() } };
    window.browser = {
      runtime: {
        id: 'nyx-audit',
        sendMessage: async (m) => (m && m.type === 'fetchResource' ? { ok: true, body: await window.__nyxFetch(m.url, m.as) } : undefined),
        onMessage: { addListener() {} },
      },
      storage: { local: { get: async () => ({ settings }), set: async () => {} }, onChanged: { addListener() {} } },
    };
  })();`);
  await context.addInitScript({ content: readFileSync(join(root, 'dist/safari/content.js'), 'utf8') });
} else {
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nyx-audit-')), {
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
}

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
  const rootStyle = getComputedStyle(document.documentElement);
  const canvas = parse(rootStyle.backgroundColor);
  const darkCanvas = /\\bdark\\b/.test(rootStyle.colorScheme) && !/\\blight\\b/.test(rootStyle.colorScheme);
  const base = canvas && canvas.a > 0.01 ? canvas : { r: darkCanvas ? 18 : 255, g: darkCanvas ? 18 : 255, b: darkCanvas ? 18 : 255, a: 1 };
  const bad = [];
  let checked = 0;
  for (const el of document.querySelectorAll('body *')) {
    let own = false;
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim().length > 1) { own = true; break; }
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const top = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, r.x + r.width / 2)), Math.max(0, Math.min(innerHeight - 1, r.y + r.height / 2)));
    if (top && !el.contains(top) && !top.contains(el)) continue;
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
const transitions = !!process.env.NYX_TRANSITIONS;
async function audit(url) {
  const name = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  const page = await context.newPage();
  const row = { url, name };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(WEBKIT ? 8000 : 4000);
    // Clear only optional-cookie prompts, so the audit sees the actual page.
    for (let attempt = 0; attempt < 2; attempt++) {
      const reject = page.getByRole('button', { name: /^(reject all|reject optional cookies|reject additional cookies|reject all cookies|only allow necessary cookies|only necessary cookies|decline optional cookies|continue without accepting|reject non-essential cookies|deny all|alle ablehnen|nur notwendige cookies)$/i }).first();
      if (!await reject.isVisible().catch(() => false)) break;
      try {
        row.consentAction = await reject.innerText();
        await reject.click({ timeout: 1500 });
        await page.waitForTimeout(500);
      } catch { break; }
    }
    row.status = (await page.title()).slice(0, 180);
    row.finalUrl = page.url();
    row.active = await page.evaluate(() => document.documentElement.hasAttribute('data-nyx-active'));
    row.nyxStyles = await page.evaluate(() => document.querySelectorAll('style[data-nyx=override]').length);
    // Text the contrast guard had to rescue: each one is a color the rewriter missed.
    row.fixes = await page.evaluate(() => document.querySelectorAll('[data-nyx-fix]').length);
    // Visible text still under 3:1 after everything Nyx does (an independent check of the guard).
    Object.assign(row, await page.evaluate(RESIDUAL));
    const png = await page.screenshot({ type: 'png' });
    writeFileSync(join(out, `${name}.png`), png);
    Object.assign(row, await measure(png));
    if (transitions) {
      row.transitions = [];
      for (const scheme of ['dark', 'light']) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.waitForTimeout(1800);
        const state = await page.evaluate(() => ({ active: document.documentElement.hasAttribute('data-nyx-active'), background: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color }));
        Object.assign(state, await page.evaluate(RESIDUAL));
        const shot = await page.screenshot();
        Object.assign(state, await measure(shot));
        writeFileSync(join(out, `${name}-${scheme}.png`), shot);
        row.transitions.push({ scheme, ...state });
      }
    }
  } catch (e) {
    row.error = String(e.message || e).split('\n')[0];
  }
  await page.close();
  results.push(row);
  writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(row));
}
const pending = [...urls];
const concurrency = Math.max(1, Math.min(4, Number(process.env.NYX_AUDIT_CONCURRENCY) || 1));
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (pending.length) await audit(pending.shift());
}));
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));
writeFileSync(join(out, 'run.json'), JSON.stringify({
  startedAt, completedAt: new Date().toISOString(), urls, mode: 'on', transitions,
  viewport: { width: 1280, height: 860 }, concurrency,
  engine: WEBKIT ? 'webkit' : 'chromium', version: context.browser()?.version(),
  contentSha256: createHash('sha256').update(readFileSync(join(WEBKIT ? join(root, 'dist/safari') : ext, 'content.js'))).digest('hex'),
}, null, 2));
await context.close();
