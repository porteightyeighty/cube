import { FACES, type Face } from '../model/cube';
import { validate } from '../model/validate';
import { COLOR_HEX, COLOR_NAME } from '../colors';
import { Camera } from './camera';
import { DEFAULT_REFS, classifyBalanced, nearest, toFacelets, type RGB } from './detect';
import { CORNER_SHOTS, FACE_SHOTS, type Shot } from './shots';

type Mode = 'corner' | 'face';
const MODE_KEY = 'cube.scanMode';

/** Extra guidance for face-by-face mode, keyed by the face being shown. */
const HOW: Record<Face, string> = {
  F: 'Start here.',
  R: 'Turn the whole cube sideways, keeping white on top.',
  B: 'Turn the whole cube sideways again.',
  L: 'And once more — last side face.',
  U: 'Back to green, then tip the top toward the camera.',
  D: 'Back to green, then tip the bottom toward the camera.',
};

const swatch = (f: Face) =>
  `<b class="sw" style="--c:${COLOR_HEX[f]}"></b><b>${COLOR_NAME[f].toUpperCase()}</b>`;

const isCentre = (facelet: number) => facelet % 9 === 4;
const centreFace = (facelet: number) => FACES[Math.floor(facelet / 9)];

const SVG = 'http://www.w3.org/2000/svg';

function loadMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === 'face' ? 'face' : 'corner'; } catch { return 'corner'; }
}

export class Scanner {
  private camera: Camera;
  private mode: Mode = loadMode();
  private step = 0;
  private phase: 'live' | 'review' = 'live';
  /** Per facelet: sampled colour, letter shown to the user, and any hand correction. */
  private samples: (RGB | null)[] = [];
  private letters: (Face | null)[] = [];
  private manual: (Face | null)[] = [];
  private brush: Face = 'U';
  private timer = 0;
  private $: Record<string, HTMLElement>;
  private grid: SVGSVGElement;

  constructor(
    private el: HTMLElement,
    private onDone: (state: string) => void,
    private onManual: () => void,
  ) {
    el.innerHTML = `
      <div class="scan-top">
        <div class="scan-dots" data-k="dots"></div>
        <h2 data-k="title"></h2>
        <p data-k="sub"></p>
      </div>
      <div class="scan-view">
        <video playsinline muted></video>
        <div class="scan-toptag" data-k="toptag"></div>
        <svg class="scan-grid" viewBox="0 0 1 1" preserveAspectRatio="none"></svg>
        <div class="scan-error" data-k="error" hidden></div>
      </div>
      <p class="scan-note" data-k="note"></p>
      <div class="scan-brush" data-k="brush" hidden>${FACES.map(
        (f) => `<button type="button" data-f="${f}" style="--c:${COLOR_HEX[f]}" aria-label="${COLOR_NAME[f]}"></button>`,
      ).join('')}</div>
      <div class="scan-actions">
        <button type="button" class="btn" data-k="cancel">Cancel</button>
        <button type="button" class="btn" data-k="retake" hidden>Retake</button>
        <button type="button" class="btn primary" data-k="capture">Capture</button>
        <button type="button" class="btn primary" data-k="next" hidden>Looks right</button>
        <button type="button" class="btn primary" data-k="manual" hidden>Enter colours by hand</button>
      </div>
      <button type="button" class="linkbtn" data-k="mode"></button>`;
    this.$ = Object.fromEntries(
      [...el.querySelectorAll<HTMLElement>('[data-k]')].map((n) => [n.dataset.k!, n]),
    );
    this.grid = el.querySelector('svg')!;
    this.camera = new Camera(el.querySelector('video')!);

    this.$.cancel.onclick = () => this.close();
    this.$.manual.onclick = () => { this.close(); this.onManual(); };
    this.$.capture.onclick = () => this.capture();
    this.$.retake.onclick = () => this.retake();
    this.$.next.onclick = () => this.next();
    this.$.mode.onclick = () => this.setMode(this.mode === 'corner' ? 'face' : 'corner');
    this.$.brush.onclick = (e) => {
      const f = (e.target as HTMLElement).dataset.f as Face | undefined;
      if (f) { this.brush = f; this.render(); }
    };
    this.grid.onclick = (e) => {
      const i = (e.target as Element).closest('polygon')?.getAttribute('data-i');
      if (i == null || this.phase !== 'review') return;
      const facelet = this.shot.cells[+i].facelet;
      if (isCentre(facelet)) return; // the centre defines the face
      this.letters[facelet] = this.brush;
      this.manual[facelet] = this.brush;
      this.render();
    };
  }

  get isOpen() { return !this.el.hidden; }

  private get shots(): Shot[] { return this.mode === 'corner' ? CORNER_SHOTS : FACE_SHOTS; }
  private get shot(): Shot { return this.shots[this.step]; }

  async open() {
    this.reset();
    this.el.hidden = false;
    this.$.error.hidden = true;
    this.$.capture.hidden = false;
    this.render();
    try {
      await this.camera.start();
      this.timer = window.setInterval(() => this.preview(), 200);
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      this.$.error.textContent = denied
        ? 'Camera permission was refused. Allow it in your browser settings, or enter the colours by hand.'
        : `Couldn't open a camera (${err instanceof Error ? err.message : err}). You can enter the colours by hand instead.`;
      this.$.error.hidden = false;
      this.$.capture.hidden = true;
      this.$.mode.hidden = true;
      this.$.manual.hidden = false;
    }
  }

  close() {
    clearInterval(this.timer);
    this.camera.stop();
    this.el.hidden = true;
  }

  private reset() {
    this.step = 0;
    this.phase = 'live';
    this.samples = Array(54).fill(null);
    this.letters = Array(54).fill(null);
    this.manual = Array(54).fill(null);
    this.buildGrid();
  }

  private setMode(mode: Mode) {
    this.mode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* fine, just not remembered */ }
    this.reset();
    void this.el.querySelector('video')!.play();
    this.render();
  }

  /** One polygon (plus a live-preview dot) per sticker in the current shot. */
  private buildGrid() {
    this.grid.replaceChildren(...this.shot.cells.flatMap((c, i) => {
      const poly = document.createElementNS(SVG, 'polygon');
      poly.setAttribute('points', c.poly.map((p) => p.join(',')).join(' '));
      poly.setAttribute('data-i', String(i));
      const dot = document.createElementNS(SVG, 'circle');
      const n = c.poly.length;
      dot.setAttribute('cx', String(c.poly.reduce((s, p) => s + p[0], 0) / n));
      dot.setAttribute('cy', String(c.poly.reduce((s, p) => s + p[1], 0) / n));
      dot.setAttribute('r', this.mode === 'corner' ? '0.014' : '0.03');
      return [poly, dot];
    }));
  }

  /** Reference colours: every centre sampled so far (plus `extra`), defaults for the rest. */
  private refs(extra?: RGB[]): Record<Face, RGB> {
    const refs = { ...DEFAULT_REFS };
    FACES.forEach((f, fi) => { const s = this.samples[fi * 9 + 4]; if (s) refs[f] = s; });
    if (extra) this.shot.cells.forEach((c, i) => { if (isCentre(c.facelet)) refs[centreFace(c.facelet)] = extra[i]; });
    return refs;
  }

  private classify(rgb: RGB[]): Face[] {
    const refs = this.refs(rgb);
    return this.shot.cells.map((c, i) => (isCentre(c.facelet) ? centreFace(c.facelet) : nearest(rgb[i], refs)));
  }

  private sample() { return this.camera.sample(this.shot.cells.map((c) => c.poly)); }

  /** Live dots showing what each sticker currently reads as. */
  private preview() {
    if (this.phase !== 'live') return;
    const rgb = this.sample();
    if (!rgb) return;
    const guess = this.classify(rgb);
    this.grid.querySelectorAll('circle').forEach((dot, i) => dot.style.setProperty('--c', COLOR_HEX[guess[i]]));
    this.warnIfWrongCentres(rgb);
  }

  private warnIfWrongCentres(rgb: RGB[]) {
    const where = (f: Face) =>
      this.shot.faces.length === 1 ? 'centre' : f === this.shot.top ? 'top centre' : f === this.shot.left ? 'left centre' : 'right centre';
    for (const [i, c] of this.shot.cells.entries()) {
      if (!isCentre(c.facelet)) continue;
      const want = centreFace(c.facelet);
      const looks = nearest(rgb[i], DEFAULT_REFS);
      if (looks !== want) {
        this.$.note.textContent = `The ${where(want)} looks ${COLOR_NAME[looks]} — it should be ${COLOR_NAME[want]}.`;
        return;
      }
    }
    this.$.note.textContent = '';
  }

  private capture() {
    const rgb = this.sample();
    if (!rgb) return;
    const letters = this.classify(rgb);
    this.shot.cells.forEach((c, i) => {
      this.samples[c.facelet] = rgb[i];
      this.letters[c.facelet] = letters[i];
      this.manual[c.facelet] = null;
    });
    this.phase = 'review';
    this.el.querySelector('video')!.pause();
    this.render();
    this.warnIfWrongCentres(rgb);
  }

  private retake() {
    for (const c of this.shot.cells) this.samples[c.facelet] = this.letters[c.facelet] = this.manual[c.facelet] = null;
    this.phase = 'live';
    void this.el.querySelector('video')!.play();
    this.render();
  }

  private next() {
    if (this.step < this.shots.length - 1) {
      this.step++;
      this.phase = 'live';
      this.buildGrid();
      void this.el.querySelector('video')!.play();
      this.render();
      return;
    }
    this.close();
    this.onDone(this.result());
  }

  /**
   * Prefer the all-stickers classification (calibrated on every centre, nine
   * per colour); fall back to what the user approved shot by shot if only that
   * one is a legal cube.
   */
  private result(): string {
    const byFace = <T,>(a: T[]) => Object.fromEntries(FACES.map((f, fi) => [f, a.slice(fi * 9, fi * 9 + 9)])) as Record<Face, T[]>;
    const balanced = toFacelets(classifyBalanced(byFace(this.samples as RGB[]), byFace(this.manual)));
    const approved = toFacelets(byFace(this.letters));
    return !validate(balanced).ok && validate(approved).ok ? approved : balanced;
  }

  private render() {
    const shot = this.shot;
    const n = this.shots.length;
    const review = this.phase === 'review';
    this.$.dots.innerHTML = this.shots
      .map((_, i) => `<i class="${i < this.step ? 'done' : i === this.step ? 'now' : ''}"></i>`)
      .join('');

    if (this.mode === 'corner') {
      const { top, left, right } = shot as Required<Shot>;
      this.$.title.innerHTML = `${this.step + 1}/${n} · ${this.step === 0 ? 'Show a corner' : 'Turn it over'}`;
      this.$.sub.innerHTML = review
        ? 'Check the colours. To fix one, pick a colour below and tap the sticker.'
        : `Hold the cube corner-on: ${swatch(top)} on top, ${swatch(left)} left, ${swatch(right)} right. Fit it to the outline.`;
      this.$.toptag.innerHTML = `▲ ${swatch(top)} on top`;
    } else {
      const face = shot.faces[0];
      this.$.title.innerHTML = `${this.step + 1}/${n} · Show the ${swatch(face)} face`;
      this.$.sub.innerHTML = review
        ? 'Check the colours. To fix one, pick a colour below and tap the square.'
        : `${HOW[face]} Fill the grid with the face, ${swatch(shot.top)} centre on top.`;
      this.$.toptag.innerHTML = `▲ ${swatch(shot.top)} on top`;
    }

    this.$.note.textContent = '';
    this.grid.classList.toggle('review', review);
    if (review) {
      this.grid.querySelectorAll('polygon').forEach((p, i) => {
        p.style.setProperty('--c', COLOR_HEX[this.letters[shot.cells[i].facelet]!]);
      });
    }
    this.$.brush.hidden = !review;
    [...this.$.brush.children].forEach((b) => {
      b.classList.toggle('on', (b as HTMLElement).dataset.f === this.brush);
    });
    this.$.capture.hidden = review;
    this.$.retake.hidden = !review;
    this.$.next.hidden = !review;
    this.$.next.textContent = this.step === n - 1 ? 'Finish' : 'Looks right →';
    this.$.manual.hidden = true;
    this.$.mode.hidden = this.step > 0 || review;
    this.$.mode.textContent = this.mode === 'corner' ? 'Scan one face at a time instead' : 'Use the 2-photo scan instead';
  }
}
