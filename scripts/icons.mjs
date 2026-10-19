// Renders assets/*.svg into the PNG icons used by the extension and the Apple app.
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'extension/static/icons');
await mkdir(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();

async function render(svgFile, size, file, { iosAppIcon = false } = {}) {
  let svg = await readFile(join(root, 'assets', svgFile), 'utf8');
  // iOS applies its own corner mask and requires an opaque, square source icon.
  if (iosAppIcon) svg = svg.replace('rx="228"', '');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: !iosAppIcon, clip: { x: 0, y: 0, width: size, height: size } });
}

for (const s of [48, 96, 128, 256, 512]) await render('icon.svg', s, join(out, `icon-${s}.png`));
for (const s of [16, 32, 48]) await render('toolbar.svg', s, join(out, `toolbar-${s}.png`));
await render('icon.svg', 1024, join(root, 'apple/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png'));
await render('icon.svg', 1024, join(root, 'apple/App/Assets.xcassets/AppIcon.appiconset/AppIcon-ios-1024.png'), { iosAppIcon: true });
await browser.close();
console.log('Icons written to', out);
