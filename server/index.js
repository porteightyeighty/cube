// Production server: serves the built app from dist/ plus the phone hand-off
// relay (pair.js). Run with `npm start` after `npm run build`.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePair } from './pair.js';

const ROOT = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

function fileFor(pathname) {
  let path;
  try { path = join(ROOT, normalize(decodeURIComponent(pathname))); } catch { return null; }
  if (!path.startsWith(ROOT)) return null; // no climbing out of dist/
  try { if (statSync(path).isFile()) return path; } catch { /* fall through */ }
  return null;
}

createServer((req, res) => {
  if (handlePair(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  const { pathname } = new URL(req.url ?? '/', 'http://x');
  // Unknown paths get the app itself (single-page app).
  const path = fileFor(pathname) ?? join(ROOT, 'index.html');
  const hashed = path.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(path).on('error', () => res.destroy()).pipe(res);
}).listen(PORT, () => console.log(`Cube solver on http://localhost:${PORT}`));
