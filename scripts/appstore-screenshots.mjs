// Renders App Store screenshots: well-known websites darkened by the real
// extension in Chromium, framed with a caption, at the exact pixel sizes App
// Store Connect wants. Needs network access.
//   npm run build && node scripts/appstore-screenshots.mjs  → docs/appstore/*.png
import { chromium } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs/appstore');
await mkdir(out, { recursive: true });
const ext = join(root, 'dist/chrome');
const local = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

let context, worker;
async function open(scale, userAgent) {
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nyx-appstore-')), {
    ...(local ? { executablePath: local } : { channel: 'chromium' }),
    headless: true,
    // Light, so sites with their own dark mode show their light pages for Nyx to darken.
    colorScheme: 'light',
    deviceScaleFactor: scale,
    ...(userAgent ? { userAgent } : {}),
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}
const setGlobal = (patch) =>
  worker.evaluate(async (p) => {
    const s = (await chrome.storage.local.get('settings')).settings ?? {};
    s.global = { ...(s.global ?? {}), ...p, updatedAt: Date.now() };
    await chrome.storage.local.set({ settings: s });
  }, patch);

// Device presets: output size in pixels, CSS viewport of the framed page, and
// the CSS viewport of the website shown inside the frame.
const devices = {
  mac: { size: [2880, 1800], scale: 2, site: [1180, 640], pair: [620, 640], layout: 'wide' },
  iphone: {
    size: [1320, 2868], scale: 3, site: [390, 760], pair: [390, 345], layout: 'tall',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  ipad: { size: [2064, 2752], scale: 2, site: [880, 1000], pair: [880, 470], layout: 'tall' },
};

const shots = [
  { title: 'Dark mode for every website', sub: 'Nyx darkens pages in Safari as they load.', theme: 'dark', url: 'https://news.ycombinator.com/' },
  { title: 'Keeps each site’s character', sub: 'Links stay blue, images stay natural, text stays readable.', theme: 'dark', compare: true, url: 'https://en.wikipedia.org/wiki/Night_sky' },
  { title: '26 themes to choose from', sub: 'Sepia, Black, Dracula, Nord, Solarized and more, or make your own.', theme: 'sepia', url: 'https://xkcd.com/' },
  { title: 'Your night, your rules', sub: 'Follow Dark Mode or a schedule. Set any site On, Off or Auto.', theme: 'dracula', url: 'https://github.com/torvalds/linux' },
];

async function capture(url, theme, [width, height]) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await setGlobal(theme ? { mode: 'on', defaultThemeId: theme } : { mode: 'off' });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const shot = await page.screenshot({ type: 'png', scale: 'device' });
  await page.close();
  return `data:image/png;base64,${shot.toString('base64')}`;
}

function frame(device, shot, images) {
  const { layout } = device;
  const host = new URL(shot.url).host;
  const window = (src, label = '') => `
    <div class="win">${label ? `<span class="label">${label}</span>` : ''}
      <div class="bar">${device.userAgent ? '' : '<i></i><i></i><i></i>'}<span class="url">${host}</span></div>
      <img src="${src}"></div>`;
  const body = images.length === 2
    ? `<div class="pair">${window(images[0], 'Before')}${window(images[1], 'With Nyx')}</div>`
    : window(images[0]);
  return `<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; }
    html, body { width: 100%; height: 100%; }
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif; color: #f2f0ff;
      background: radial-gradient(120% 80% at 50% 0%, #3a2f6b 0%, #17132b 55%, #0b0a14 100%);
      display: flex; flex-direction: column; align-items: center; overflow: hidden;
      padding: ${layout === 'wide' ? '56px 80px 0' : '64px 28px 0'}; }
    h1 { font-size: ${layout === 'wide' ? 54 : 40}px; font-weight: 800; letter-spacing: -0.02em; text-align: center; line-height: 1.08; }
    p { margin-top: 14px; font-size: ${layout === 'wide' ? 22 : 19}px; color: #c9c3e6; text-align: center; max-width: 30em; line-height: 1.35; }
    .stage { flex: 1; width: 100%; display: flex; align-items: flex-start; justify-content: center; margin-top: ${layout === 'wide' ? 40 : 36}px; }
    .pair { display: flex; gap: ${layout === 'wide' ? 28 : 16}px; ${layout === 'tall' ? 'flex-direction: column; align-items: center;' : ''} }
    .win { position: relative; border-radius: 14px; overflow: hidden; background: #222;
      box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
    .bar { height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 14px; background: #2b2a33; }
    .bar i { width: 11px; height: 11px; border-radius: 50%; background: #5d5b66; }
    .bar .url { margin: 0 auto;  font-size: 13px; color: #b9b6c6; background: #1d1c23; padding: 3px 40px; border-radius: 7px; }
    .win img { display: block; width: ${shot.cssWidth}px; }
    .label { position: absolute; bottom: 14px; left: 14px; z-index: 1; background: rgba(20,18,35,.85); color: #fff;
      font-size: 14px; font-weight: 700; padding: 5px 12px; border-radius: 99px; }
  </style></head><body><h1>${shot.title}</h1><p>${shot.sub}</p><div class="stage">${body}</div></body></html>`;
}

for (const [name, device] of Object.entries(devices)) {
  const [w, h] = device.size;
  await open(device.scale, device.userAgent);
  const page = await context.newPage();
  await page.setViewportSize({ width: w / device.scale, height: h / device.scale });
  for (const [i, shot] of shots.entries()) {
    const site = shot.compare ? device.pair : device.site;
    const images = shot.compare
      ? [await capture(shot.url, null, site), await capture(shot.url, shot.theme, site)]
      : [await capture(shot.url, shot.theme, site)];
    const cssWidth = site[0];
    await page.setContent(frame(device, { ...shot, cssWidth }, images));
    await page.waitForTimeout(150);
    const file = join(out, `${name}-${i + 1}.png`);
    await page.screenshot({ path: file, type: 'png', scale: 'device', clip: { x: 0, y: 0, width: w / device.scale, height: h / device.scale } });
    console.log(file);
  }
  await page.close();
  await context.close();
}

