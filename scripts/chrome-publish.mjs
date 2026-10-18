// Packages dist/chrome as a zip, and optionally uploads and publishes it to the Chrome Web Store.
//
//   node scripts/chrome-publish.mjs --package-only   → dist/nyx-chrome-<version>.zip
//   node scripts/chrome-publish.mjs                  → package, upload and submit for review
//
// Publishing needs Chrome Web Store API credentials in the environment
// (https://developer.chrome.com/docs/webstore/using-api):
//   CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const zip = join(root, 'dist', `nyx-chrome-${version}.zip`);

execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', '-X', zip, '.'], { cwd: join(root, 'dist/chrome'), stdio: 'inherit' });
console.log(`Packaged ${zip}`);
if (process.argv.includes('--package-only')) process.exit(0);

const { CWS_EXTENSION_ID: id, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN } = process.env;
if (!id || !CWS_CLIENT_ID || !CWS_CLIENT_SECRET || !CWS_REFRESH_TOKEN) {
  console.error('Set CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET and CWS_REFRESH_TOKEN to publish.');
  process.exit(1);
}

const token = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({ client_id: CWS_CLIENT_ID, client_secret: CWS_CLIENT_SECRET, refresh_token: CWS_REFRESH_TOKEN, grant_type: 'refresh_token' }),
}).then((r) => r.json());
if (!token.access_token) throw new Error(`OAuth failed: ${JSON.stringify(token)}`);
const headers = { authorization: `Bearer ${token.access_token}`, 'x-goog-api-version': '2' };

const upload = await fetch(`https://www.googleapis.com/upload/chromewebstore/v1.1/items/${id}`, {
  method: 'PUT',
  headers,
  body: readFileSync(zip),
}).then((r) => r.json());
if (upload.uploadState !== 'SUCCESS') throw new Error(`Upload failed: ${JSON.stringify(upload)}`);
console.log(`Uploaded version ${version}`);

const publish = await fetch(`https://www.googleapis.com/chromewebstore/v1.1/items/${id}/publish`, { method: 'POST', headers }).then((r) => r.json());
if (!publish.status?.includes('OK')) throw new Error(`Publish failed: ${JSON.stringify(publish)}`);
console.log('Submitted for review. Track it in the Chrome Web Store developer dashboard.');
