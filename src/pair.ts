// Hand a scan over to a phone: the laptop shows a QR code for this page with
// a random `?pair=<id>`, the phone opens it and scans, and each scan is posted
// back through the relay in `server/pair.js` to the laptop's event stream.

import { renderSVG } from 'uqr';

const PARAM = 'pair';
const api = (id = '') => `/api/pair${id ? `/${id}` : ''}`;

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const isLocal = (host: string) => host === 'localhost' || host === '[::1]' || host.startsWith('127.');

/** The session id when this page was opened from a laptop's QR code. */
export function pairedId(): string | null {
  const id = new URLSearchParams(location.search).get(PARAM);
  return id && /^[A-Za-z0-9_-]{16,64}$/.test(id) ? id : null;
}

/** Forget the pairing in the address bar, so a reload starts fresh. */
export function dropPairParam() {
  const url = new URL(location.href);
  url.searchParams.delete(PARAM);
  history.replaceState(null, '', url);
}

/**
 * Laptop side: a dialog with the QR code, then a live link that hands every
 * scan the phone makes to `onState`.
 */
export class PhoneLink {
  private source: EventSource | null = null;
  /** Latest scan applied; reconnecting replays it, and it mustn't overwrite edits made since. */
  private seq = 0;
  private $: Record<string, HTMLElement>;
  /** 'off' → 'waiting' (QR shown) → 'joined' (phone opened it) → 'linked' (a scan arrived). */
  status: 'off' | 'waiting' | 'joined' | 'linked' = 'off';
  onChange = () => {};

  constructor(private el: HTMLElement, private onState: (state: string) => void) {
    el.innerHTML = `
      <div class="pair-card" role="dialog" aria-modal="true" aria-labelledby="pair-title">
        <h2 id="pair-title">Scan with your phone</h2>
        <p class="small-text">Point your phone's camera at this code and open the link. Scan the cube there and it'll appear here.</p>
        <div class="pair-qr" data-k="qr"></div>
        <a class="pair-url" data-k="url" target="_blank" rel="noopener"></a>
        <p class="pair-status" data-k="status" aria-live="polite"></p>
        <p class="msg error" data-k="error" hidden></p>
        <button type="button" class="btn" data-k="close">Close</button>
      </div>`;
    this.$ = Object.fromEntries([...el.querySelectorAll<HTMLElement>('[data-k]')].map((n) => [n.dataset.k!, n]));
    this.$.close.onclick = () => this.hide();
    el.onclick = (e) => { if (e.target === el) this.hide(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) this.hide(); });
  }

  get isOpen() { return !this.el.hidden; }

  /** Bring the code back up for a session already running. */
  show() { this.el.hidden = false; }

  async open() {
    this.unlink();
    const id = randomId();
    this.el.hidden = false;
    this.$.error.hidden = true;
    this.$.qr.innerHTML = '';
    this.$.url.textContent = '';
    this.setStatus('waiting');

    let lan: string | null = null;
    try {
      const r = await fetch(api());
      if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw new Error();
      lan = (await r.json()).lan ?? null;
    } catch {
      return this.fail('Phone hand-off needs the app\'s own server (npm run dev or npm start). This copy is served without it.');
    }

    // A link to "localhost" means nothing to the phone: swap in this machine's LAN address.
    const host = isLocal(location.hostname) && lan ? `${lan}${location.port ? `:${location.port}` : ''}` : location.host;
    const url = `${location.protocol}//${host}${location.pathname}?${PARAM}=${id}`;
    this.$.qr.innerHTML = renderSVG(url, { border: 2 });
    this.$.url.textContent = url;
    (this.$.url as HTMLAnchorElement).href = url;
    if (location.protocol === 'http:') {
      this.$.error.textContent = isLocal(location.hostname) && !lan
        ? 'Couldn\'t find this computer\'s network address, so your phone can\'t reach this link.'
        : 'Phones only allow the camera on https pages. Use npm run dev:https (or the deployed site), or the phone can only paint colours by hand.';
      this.$.error.hidden = false;
    }

    this.seq = 0;
    const source = new EventSource(api(id) + '/events');
    this.source = source;
    source.addEventListener('joined', () => { if (this.status === 'waiting') this.setStatus('joined'); });
    source.addEventListener('state', (e) => {
      const { state, seq } = JSON.parse((e as MessageEvent).data);
      if (seq <= this.seq) return;
      this.seq = seq;
      this.setStatus('linked');
      this.hide();
      this.onState(state);
    });
  }

  hide() {
    this.el.hidden = true;
    // Closing the dialog before the phone has done anything gives up on it.
    if (this.status === 'waiting') this.unlink();
  }

  unlink() {
    this.source?.close();
    this.source = null;
    this.setStatus('off');
  }

  private fail(message: string) {
    this.source?.close();
    this.source = null;
    this.$.error.textContent = message;
    this.$.error.hidden = false;
    this.$.status.textContent = '';
    this.status = 'off';
  }

  private setStatus(s: PhoneLink['status']) {
    this.status = s;
    this.$.status.textContent = {
      off: '',
      waiting: 'Waiting for your phone…',
      joined: 'Phone connected — scan the cube on it.',
      linked: 'Scan received.',
    }[s];
    this.onChange();
  }
}

/** Phone side: report in, then send each finished scan to the laptop. */
export class LaptopLink {
  status: 'sending' | 'sent' | 'failed' | 'idle' = 'idle';
  onChange = () => {};

  constructor(readonly id: string) {
    void this.post({ type: 'joined' });
  }

  async send(state: string) {
    this.status = 'sending';
    this.onChange();
    const ok = await this.post({ type: 'state', state });
    this.status = ok ? 'sent' : 'failed';
    this.onChange();
  }

  private async post(msg: object): Promise<boolean> {
    try {
      const r = await fetch(api(this.id), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg),
      });
      return r.ok;
    } catch {
      return false;
    }
  }
}
