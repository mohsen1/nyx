// Captures README screenshots: the demo page without and with Nyx, in a few themes.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs/images');
await mkdir(out, { recursive: true });
const server = createServer((req, res) => res.end(readFileSync(join(root, 'tests/fixtures/demo.html')))).listen(0);
const url = `http://localhost:${server.address().port}/`;
const ext = join(root, 'dist/chrome');
const local = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nyx-shots-')), {
  ...(local ? { executablePath: local } : { channel: 'chromium' }),
  headless: true,
  colorScheme: 'dark',
  viewport: { width: 1100, height: 720 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const setGlobal = (patch) =>
  worker.evaluate(async (p) => {
    const s = (await chrome.storage.local.get('settings')).settings ?? {};
    s.global = { ...(s.global ?? {}), ...p, updatedAt: Date.now() };
    await chrome.storage.local.set({ settings: s });
  }, patch);

const page = await context.newPage();
await setGlobal({ mode: 'off' });
await page.goto(url);
await page.waitForTimeout(500);
await page.screenshot({ path: join(out, 'demo-original.png') });
for (const theme of ['dark', 'sepia', 'dracula', 'blue']) {
  await setGlobal({ mode: 'on', defaultThemeId: theme });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, `demo-${theme}.png`) });
}
const id = new URL(worker.url()).host;
await page.setViewportSize({ width: 1000, height: 760 });
await page.goto(`chrome-extension://${id}/options.html#themes`);
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, 'settings-themes.png') });
await context.close();
server.close();
console.log('Screenshots written to', out);
