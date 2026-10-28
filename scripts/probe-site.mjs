// Prints Nyx's state on one live page: stylesheets (readable or not), overrides, key colors.
//   npm run build && node scripts/probe-site.mjs https://example.com/
import { chromium } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ext = process.env.NYX_EXT || join(process.cwd(), 'dist/chrome'), url = process.argv[2];
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'p-')), { ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }), headless: true, colorScheme: 'light', viewport: { width: 1280, height: 860 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
const w = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
await w.evaluate(async () => { const s = (await chrome.storage.local.get('settings')).settings ?? {}; s.global = { ...(s.global ?? {}), mode: 'on', defaultThemeId: 'dark', updatedAt: Date.now() }; await chrome.storage.local.set({ settings: s }); });
const p = await ctx.newPage();
p.on('console', (m) => (m.type() === 'error' || m.text().startsWith('NYXDBG')) && console.log('console:', m.text().slice(0, 200)));
await p.goto(url, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000);
for (const colorScheme of (process.env.NYX_PROBE_SCHEMES || '').split(',').filter(Boolean)) {
  await p.emulateMedia({ colorScheme });
  await p.waitForTimeout(1800);
}
if (!process.env.PROBE_JS) console.log(JSON.stringify(await p.evaluate(() => {
  const cs = (el) => el && getComputedStyle(el);
  const sheets = [...document.styleSheets].map((s) => { let n = -1; try { n = s.cssRules.length } catch {} return { href: s.href?.slice(0, 90), n, owner: s.ownerNode?.localName, nyx: s.ownerNode?.dataset?.nyx }; });
  const overrides = [...document.querySelectorAll('style[data-nyx]')].map((e) => ({ k: e.dataset.nyx, len: e.textContent.length }));
  return { active: document.documentElement.hasAttribute('data-nyx-active'), htmlBg: cs(document.documentElement).backgroundColor, bodyBg: cs(document.body).backgroundColor, bodyColor: cs(document.body).color, adopted: document.adoptedStyleSheets.length, sheets, overrides };
}), null, 1));
if (process.env.PROBE_JS) console.log(JSON.stringify(await p.evaluate(process.env.PROBE_JS), null, 1));
if (process.env.NYX_PROBE_SHOT) await p.screenshot({ path: process.env.NYX_PROBE_SHOT });
await ctx.close();
