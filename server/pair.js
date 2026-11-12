// Phone hand-off relay. The laptop listens on a random session id (a
// server-sent event stream); the phone, opened from the laptop's QR code,
// posts to the same id. Nothing but tiny JSON messages passes through, and
// sessions live in memory only.

import { networkInterfaces } from 'node:os';

const ID = /^[A-Za-z0-9_-]{16,64}$/;
const STATE = /^[URFDLBX]{54}$/;
/** Sessions idle this long are forgotten. */
const IDLE_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;
const MAX_BODY = 1024;

/** @type {Map<string, { listeners: Set<import('node:http').ServerResponse>, last: string | null, seq: number, seen: number }>} */
const sessions = new Map();

function session(id) {
  let s = sessions.get(id);
  if (!s) {
    if (sessions.size >= MAX_SESSIONS) sweep(true);
    s = { listeners: new Set(), last: null, seq: 0, seen: 0 };
    sessions.set(id, s);
  }
  s.seen = Date.now();
  return s;
}

/** Drop idle sessions; `force` also drops the oldest unwatched ones to make room. */
function sweep(force = false) {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.listeners.size === 0 && (force || now - s.seen > IDLE_MS)) sessions.delete(id);
  }
}
setInterval(() => sweep(), 60 * 1000).unref();

function lanAddress() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Handle `/api/pair...` requests; returns false for anything else so the
 * caller can serve it.
 *
 *   GET  /api/pair            → { lan }  (this machine's LAN IP, for QR links made on localhost)
 *   GET  /api/pair/:id/events → event stream: `joined` when the phone opens the link, `state` ({ state, seq })
 *                               with each scan; on (re)connect the latest scan is replayed, so listeners skip seqs they've had
 *   POST /api/pair/:id        ← { type: 'joined' } or { type: 'state', state }
 */
export function handlePair(req, res) {
  const url = new URL(req.url ?? '/', 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'pair') return false;

  if (parts.length === 2 && req.method === 'GET') {
    json(res, 200, { lan: lanAddress() });
    return true;
  }
  const id = parts[2];
  if (!id || !ID.test(id)) { json(res, 400, { error: 'bad session id' }); return true; }

  if (parts.length === 4 && parts[3] === 'events' && req.method === 'GET') {
    const s = session(id);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // don't let a proxy sit on the stream
    });
    res.write('retry: 2000\n\n');
    // A scan sent while the laptop was reconnecting still gets through.
    if (s.last) send(res, 'state', { state: s.last, seq: s.seq });
    s.listeners.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20 * 1000);
    req.on('close', () => { clearInterval(ping); s.listeners.delete(res); s.seen = Date.now(); });
    return true;
  }

  if (parts.length === 3 && req.method === 'POST') {
    readBody(req).then((body) => {
      let msg;
      try { msg = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }
      const s = session(id);
      if (msg?.type === 'joined') {
        for (const l of s.listeners) send(l, 'joined', {});
      } else if (msg?.type === 'state' && typeof msg.state === 'string' && STATE.test(msg.state)) {
        s.last = msg.state;
        s.seq++;
        for (const l of s.listeners) send(l, 'state', { state: msg.state, seq: s.seq });
      } else {
        return json(res, 400, { error: 'bad message' });
      }
      json(res, 200, { listeners: s.listeners.size });
    }, () => json(res, 413, { error: 'too large' }));
    return true;
  }

  json(res, 404, { error: 'not found' });
  return true;
}
