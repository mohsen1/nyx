// Chrome Web Store images: 1280x800 screenshots (from the Mac App Store ones) and the 440x280
// small promo tile.  node scripts/chrome-store-assets.mjs  → docs/chromestore/
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs/chromestore');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const shots = [1, 2, 3, 4].map((i) => join(root, `docs/appstore/mac-${i}.png`));
shots.push(join(root, 'docs/images/settings-themes.png'));
for (const [i, file] of shots.entries()) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fit = i === 4 ? 'contain' : 'cover';
  await page.setContent(`<body style="margin:0;background:#16131f"><img src="${dataUrl(file)}" style="width:1280px;height:800px;object-fit:${fit};display:block"></body>`);
  await page.screenshot({ path: join(out, `screenshot-${i + 1}.png`) });
}

await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<!doctype html><body style="margin:0;width:440px;height:280px;display:flex;align-items:center;gap:22px;padding:0 36px;box-sizing:border-box;
  font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#f2f0ff;background:radial-gradient(120% 120% at 20% 0%,#3a2f6b,#17132b 60%,#0b0a14)">
  <img src="${dataUrl(join(root, 'extension/static/icons/icon-256.png'))}" style="width:104px;height:104px;border-radius:24px">
  <div><div style="font-size:40px;font-weight:800;letter-spacing:-.02em">Nyx</div>
  <div style="font-size:17px;color:#c9c3e6;margin-top:6px;line-height:1.3">Dark mode for websites<br>that don't have one</div></div></body>`);
await page.screenshot({ path: join(out, 'promo-small-440x280.png') });
await browser.close();
console.log('Wrote', out);
