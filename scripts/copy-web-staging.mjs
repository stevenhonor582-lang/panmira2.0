// Copy frontend build output from staging into dist/web/ alongside the
// backend's compiled output. Clears stale chunks first so the browser
// never sees a hash referenced in HTML that's been deleted on disk.
import { existsSync, rmSync, mkdirSync, readdirSync, statSync, copyFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const staging = join(root, 'dist', 'web-staging');
const target = join(root, 'dist', 'web');

if (!existsSync(staging)) {
  console.error('[copy-web-staging] staging dir missing:', staging);
  process.exit(1);
}

mkdirSync(target, { recursive: true });

// Remove only assets/ and index.html in target — leave backend's .js modules
// (ws-server.js, chat-subscriptions.js, etc.) untouched.
for (const name of ['index.html', 'assets']) {
  const p = join(target, name);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

// Copy index.html and assets/ from staging
for (const name of readdirSync(staging)) {
  const src = join(staging, name);
  const dst = join(target, name);
  if (statSync(src).isDirectory()) {
    cpSync(src, dst, { recursive: true });
  } else {
    copyFileSync(src, dst);
  }
  console.log('[copy-web-staging] copied', name);
}

// Best-effort cleanup of staging
rmSync(staging, { recursive: true, force: true });
console.log('[copy-web-staging] done');
