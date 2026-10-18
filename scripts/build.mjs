// Builds the extension for each browser into dist/<target>/.
//   node scripts/build.mjs            build all targets
//   node scripts/build.mjs --watch    rebuild on change
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const watch = process.argv.includes('--watch');
const TARGETS = ['safari', 'chrome', 'firefox'];

const entries = {
  content: 'extension/src/content/main.ts',
  'theme-import': 'extension/src/content/theme-import.ts',
  background: 'extension/src/background/main.ts',
  popup: 'extension/src/popup/main.ts',
  options: 'extension/src/options/main.ts',
};

function manifest(target) {
  const m = {
    manifest_version: 3,
    name: 'Nyx – Dark Mode',
    short_name: 'Nyx',
    version: pkg.version,
    description: 'Dark mode for every website, generated from each page’s own colors.',
    icons: { 48: 'icons/icon-48.png', 96: 'icons/icon-96.png', 128: 'icons/icon-128.png', 256: 'icons/icon-256.png', 512: 'icons/icon-512.png' },
    action: {
      default_popup: 'popup.html',
      default_title: 'Nyx',
      default_icon: { 16: 'icons/toolbar-16.png', 32: 'icons/toolbar-32.png', 48: 'icons/toolbar-48.png' },
    },
    options_ui: { page: 'options.html', open_in_tab: true },
    permissions: ['storage', 'alarms'],
    host_permissions: ['<all_urls>'],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_start',
        all_frames: true,
        match_about_blank: true,
      },
      {
        matches: ['https://azimi.me/nyx/theme/*', 'https://mohsen1.github.io/nyx/theme/*'],
        js: ['theme-import.js'],
        run_at: 'document_end',
      },
    ],
    commands: {
      'toggle-site': { suggested_key: { default: 'Alt+Shift+N' }, description: 'Turn dark mode on or off for the current website' },
      'pause-site': { suggested_key: { default: 'Alt+Shift+P' }, description: 'Pause the current website until tomorrow' },
      'cycle-theme': { suggested_key: { default: 'Alt+Shift+T' }, description: 'Switch to the next default theme' },
      'cycle-site-status': { description: 'Step the current website through Auto, On, Off and Default' },
      'cycle-site-theme': { description: 'Switch the current website to the next theme' },
      'toggle-ignore-dark-mode': { description: 'Ignore the current website’s built-in dark mode (or stop ignoring it)' },
      'global-auto': { description: 'Set the global status to Auto' },
      'global-on': { description: 'Set the global status to On' },
      'global-off': { description: 'Set the global status to Off' },
    },
  };
  if (target === 'chrome') {
    m.background = { service_worker: 'background.js' };
    m.content_scripts[0].match_origin_as_fallback = true;
  } else {
    m.background = { scripts: ['background.js'], persistent: false };
  }
  if (target === 'safari') m.permissions.push('nativeMessaging');
  if (target === 'firefox') {
    m.browser_specific_settings = { gecko: { id: 'nyx@mohsen1.github.io', strict_min_version: '121.0' } };
  }
  return m;
}

async function buildTarget(target) {
  const out = join(root, 'dist', target);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(join(root, 'extension/static'), out, { recursive: true });
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest(target), null, 2) + '\n');
  const options = {
    absWorkingDir: root,
    entryPoints: entries,
    outdir: out,
    bundle: true,
    format: 'iife',
    target: ['safari15.4', 'chrome109', 'firefox121'],
    legalComments: 'none',
    sourcemap: watch ? 'inline' : false,
    logLevel: 'warning',
    define: { __TARGET__: JSON.stringify(target) },
  };
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
  }
}

for (const t of TARGETS) await buildTarget(t);
console.log(`Built ${TARGETS.join(', ')} into dist/${watch ? ' (watching)' : ''}`);
