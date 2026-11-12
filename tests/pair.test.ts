// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handlePair } from '../server/pair.js';

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => { if (!handlePair(req, res)) res.writeHead(404).end('app'); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const ID = 'abcdefghijklmnop0123';
const post = (id: string, body: unknown) =>
  fetch(`${base}/api/pair/${id}`, { method: 'POST', body: JSON.stringify(body) });

/** Open the event stream and collect parsed events as they arrive. */
async function listen(id: string) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/pair/${id}/events`, { signal: ctrl.signal });
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  const events: { event: string; data: any }[] = [];
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
      }
    } catch { /* aborted */ }
  })();
  const waitFor = async (n: number) => {
    for (let t = 0; t < 100 && events.length < n; t++) await new Promise((r) => setTimeout(r, 10));
    return events;
  };
  return { events, waitFor, close: () => ctrl.abort() };
}

describe('phone hand-off relay', () => {
  it('leaves other paths to the app', async () => {
    expect(await (await fetch(`${base}/index.html`)).text()).toBe('app');
  });

  it('reports a LAN address field', async () => {
    expect(await (await fetch(`${base}/api/pair`)).json()).toHaveProperty('lan');
  });

  it('relays joined and state from phone to laptop', async () => {
    const laptop = await listen(ID);
    expect((await post(ID, { type: 'joined' })).status).toBe(200);
    expect((await post(ID, { type: 'state', state: SOLVED })).status).toBe(200);
    const events = await laptop.waitFor(2);
    expect(events).toEqual([
      { event: 'joined', data: {} },
      { event: 'state', data: { state: SOLVED, seq: 1 } },
    ]);
    laptop.close();
  });

  it('replays the latest scan to a laptop that (re)connects', async () => {
    const id = 'replayreplayreplay01';
    await post(id, { type: 'state', state: SOLVED });
    const late = await listen(id);
    expect(await late.waitFor(1)).toEqual([{ event: 'state', data: { state: SOLVED, seq: 1 } }]);
    late.close();
  });

  it('rejects bad ids, bad states and oversized bodies', async () => {
    expect((await post('short', { type: 'joined' })).status).toBe(400);
    expect((await post(ID, { type: 'state', state: 'nope' })).status).toBe(400);
    expect((await post(ID, { type: 'state', state: SOLVED.replace('U', 'Q') })).status).toBe(400);
    expect((await fetch(`${base}/api/pair/${ID}`, { method: 'POST', body: 'x'.repeat(5000) }).catch(() => ({ status: 413 }))).status).toBe(413);
  });
});
