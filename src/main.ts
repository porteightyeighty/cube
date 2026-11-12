import './style.css';
import { BLANK, FACES, SOLVED, applyMove, applyMoves, isSolved, rotateFaceStickers, type Move } from './model/cube';
import { invertMove, randomScramble } from './model/moves';
import { validate, type FaceFix } from './model/validate';
import { COLOR_NAME } from './colors';
import { SolverClient } from './solver/client';
import { Scanner } from './scan/flow';
import { Stage } from './view/scene';
import { CubeView } from './view/cubies';
import { Animator } from './view/animator';
import { attachInteraction } from './view/interaction';
import { NetView } from './ui/net';
import { Palette } from './ui/palette';
import { SolutionView, type Solution } from './ui/solution';
import { bindKeys, buildMovePad } from './ui/controls';
import { Trainer } from './trainer/panel';
import { LaptopLink, PhoneLink, dropPairParam, pairedId } from './pair';

const STORE_KEY = 'cube-solver-state';
const TAB_KEY = 'cube-tab';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function loadState(): string {
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (s && /^[URFDLBX]{54}$/.test(s)) return s;
  } catch { /* storage unavailable */ }
  return SOLVED;
}

// ---- state: the facelet string is the single source of truth ----
let state = loadState();
let painting = false;
let solution: Solution | null = null;
let history: Move[] = [];
let solverState: 'loading' | 'ready' | 'solving' | 'failed' = 'loading';
let note = '';
// Practise mode borrows the 3D cube to show last-layer cases; `state` is left alone.
let training = false;

// ---- 3D ----
const stage = new Stage($('stage'));
const cubeView = new CubeView();
stage.scene.add(cubeView.root);
const animator = new Animator(cubeView, state);

// ---- panel ----
const net = new NetView($('net'), (i) => paint(i));
const palette = new Palette($('palette'));
const solutionView = new SolutionView($('solution'), (k) => gotoStep(k));
const scanner = new Scanner($('scan'), onScanned, () => setPainting(true));
const solver = new SolverClient();
// Phone hand-off: on the laptop, a link that receives the phone's scans; on a
// phone opened from the laptop's QR code, a link that sends them.
const phoneLink = new PhoneLink($('pair'), (s) => {
  setTraining(false);
  painting = true;
  stage.resetView();
  replaceState(s, validate(s).ok
    ? 'Scan received from your phone. Compare it with your cube, then press Solve.'
    : 'Scan received from your phone, but it needs fixing — see above.');
});
let laptopLink: LaptopLink | null = (() => { const id = pairedId(); return id ? new LaptopLink(id) : null; })();
phoneLink.onChange = () => refresh();
if (laptopLink) laptopLink.onChange = () => refresh();
const trainer = new Trainer($('trainer'), {
  show(s) {
    animator.onTurnDone = null;
    animator.steady = false;
    animator.setState(s);
  },
  play(start, turns, onStep) {
    this.show(start);
    animator.steady = true;
    let done = 0;
    onStep(0);
    animator.onTurnDone = () => {
      onStep(++done);
      if (done === turns.length) { animator.steady = false; animator.onTurnDone = null; }
    };
    turns.forEach((t) => animator.enqueue(t));
  },
});
solver.ready.then(
  () => { solverState = 'ready'; refresh(); },
  () => { solverState = 'failed'; refresh(); },
);

function refresh() {
  const v = validate(state);
  const bad = new Set(v.errors.filter((e) => !e.quiet).flatMap((e) => e.facelets));
  cubeView.setHighlight(bad);
  net.render(state, bad);
  palette.render(state);
  solutionView.render(solution);

  document.body.classList.toggle('painting', painting);
  $('paint-tools').hidden = !painting;
  $('btn-paint').classList.toggle('on', painting);
  $('btn-paint').textContent = painting ? 'Done painting' : 'Paint colours';
  $('hint').textContent = training
    ? 'Yellow on top, green in front · drag a face to try a move'
    : painting
      ? 'Tap stickers to paint · drag to look around'
      : 'Drag a face to turn it · drag the background to look around';
  $('solve-ui').hidden = training;
  $('trainer').hidden = !training;
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
    b.classList.toggle('on', (b.dataset.tab === 'train') === training));

  const msgs = $('messages');
  msgs.innerHTML = '';
  for (const e of v.errors) {
    const p = document.createElement('p');
    p.className = e.quiet ? 'msg info' : 'msg error';
    p.textContent = e.message;
    msgs.appendChild(p);
  }
  v.fixes.slice(0, 3).forEach((fix) => msgs.appendChild(fixButton(fix)));
  if (note) {
    const p = document.createElement('p');
    p.className = 'msg info';
    p.textContent = note;
    msgs.appendChild(p);
  }

  const solve = $<HTMLButtonElement>('btn-solve');
  solve.disabled = solverState !== 'ready';
  solve.textContent = {
    loading: 'Preparing solver…', ready: 'Solve', solving: 'Solving…', failed: 'Solver failed to load',
  }[solverState];
  $<HTMLButtonElement>('btn-undo').disabled = history.length === 0;
  renderPairBar();

  try { localStorage.setItem(STORE_KEY, state); } catch { /* ignore */ }
}

function renderPairBar() {
  const bar = $('pair-bar');
  const button = (label: string, onclick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small';
    b.textContent = label;
    b.onclick = onclick;
    return b;
  };
  const line = (text: string, cls = '') => {
    const p = document.createElement('p');
    p.textContent = text;
    p.className = cls;
    return p;
  };
  $('btn-phone').hidden = !!laptopLink;
  $('entry').classList.toggle('two', !!laptopLink);
  if (laptopLink) {
    const { status } = laptopLink;
    const unlink = () => { laptopLink = null; dropPairParam(); refresh(); };
    bar.replaceChildren(
      status === 'sent' ? line('Sent to your laptop ✓ — carry on there.', 'ok')
        : status === 'failed' ? line('Couldn\'t reach your laptop. Check both are online, then send again.', 'bad')
          : status === 'sending' ? line('Sending to your laptop…')
            : line('Linked to your laptop: scan the cube and it\'ll appear there.'),
      button('Send again', () => void laptopLink?.send(state)),
      button('Unlink', unlink),
    );
    (bar.children[1] as HTMLElement).hidden = status === 'idle' || status === 'sending' || state.includes(BLANK);
    bar.hidden = false;
  } else if (phoneLink.status === 'joined' || phoneLink.status === 'linked') {
    bar.replaceChildren(
      line(phoneLink.status === 'linked'
        ? 'Phone linked: new scans from it will replace this cube.'
        : 'Phone connected: waiting for its scan…'),
      button('Show code', () => phoneLink.show()),
      button('Unlink', () => phoneLink.unlink()),
    );
    bar.hidden = false;
  } else {
    bar.hidden = true;
  }
}

function fixButton(fix: FaceFix): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn fix';
  const how = ['', 'a quarter turn clockwise', 'a half turn', 'a quarter turn anticlockwise'][fix.quarterTurns];
  b.textContent = `Likely fix: the ${COLOR_NAME[fix.face]} face was entered rotated — turn its stickers ${how}`;
  b.onclick = () => replaceState(rotateFaceStickers(state, fix.face, fix.quarterTurns));
  return b;
}

/** Set a whole new position (paint, scan, reset): drops solution and undo history. */
function replaceState(next: string, message = '') {
  state = next;
  solution = null;
  history = [];
  note = message;
  animator.setState(state);
  refresh();
}

function turn(move: Move, record = true) {
  if (training) {
    // Free play on the case being practised; the solver's cube is untouched.
    animator.onTurnDone = null;
    animator.steady = false;
    animator.enqueue(move);
    return;
  }
  if (state.includes(BLANK)) return; // nothing sensible to turn while half painted
  state = applyMove(state, move);
  animator.enqueue(move);
  solution = null;
  note = '';
  if (record) history.push(move);
  refresh();
}

function paint(i: number) {
  if (!painting || i % 9 === 4 || state[i] === palette.selected) return;
  replaceState(state.slice(0, i) + palette.selected + state.slice(i + 1));
}

function setTraining(on: boolean) {
  if (on === training) return;
  training = on;
  painting = false;
  try { localStorage.setItem(TAB_KEY, on ? 'train' : 'solve'); } catch { /* ignore */ }
  stage.resetView();
  if (on) {
    trainer.activate();
  } else {
    trainer.deactivate();
    animator.onTurnDone = null;
    animator.steady = false;
    animator.setState(state);
  }
  refresh();
}

function setPainting(on: boolean) {
  painting = on;
  refresh();
}

function onScanned(scanned: string) {
  void laptopLink?.send(scanned);
  painting = true;
  stage.resetView();
  replaceState(scanned, validate(scanned).ok ? 'Scan complete. Compare it with your cube, then press Solve.' : '');
}

async function solve() {
  const v = validate(state);
  if (!v.ok) {
    note = 'Fix the problems above first — the cube as entered can\'t be solved.';
    painting = true;
    refresh();
    $('messages').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (isSolved(state)) {
    note = 'Already solved — nothing to do.';
    refresh();
    return;
  }
  const start = state;
  solverState = 'solving';
  note = '';
  refresh();
  try {
    const moves = await solver.solve(start);
    solverState = 'ready';
    if (state !== start) return refresh(); // cube changed while solving
    solution = { start, moves, cursor: 0 };
    painting = false;
    history = [];
    stage.resetView();
    refresh();
    $('solution').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch (err) {
    solverState = 'ready';
    note = `Couldn't solve this cube: ${err instanceof Error ? err.message : err}`;
    refresh();
  }
}

/** Show the cube as it is after the first `k` solution moves. */
function gotoStep(k: number) {
  if (!solution || k < 0 || k > solution.moves.length) return;
  const { start, moves, cursor } = solution;
  state = applyMoves(start, moves.slice(0, k));
  if (k === cursor + 1 && !animator.busy) animator.enqueue(moves[cursor]);
  else if (k === cursor - 1 && !animator.busy) animator.enqueue(invertMove(moves[k]));
  else animator.setState(state);
  solution.cursor = k;
  refresh();
}

// ---- wiring ----
attachInteraction({
  dom: stage.renderer.domElement,
  camera: stage.camera,
  controls: stage.controls,
  mode: () => (painting ? 'paint' : 'turn'),
  onTurn: (m) => turn(m),
  onPaint: (i) => paint(i),
});
buildMovePad($('movepad'), (m) => turn(m));
bindKeys({
  onMove: (m) => { if (!scanner.isOpen && !phoneLink.isOpen) turn(m); },
  onStep: (d) => { if (solution && !scanner.isOpen && !phoneLink.isOpen && !training) gotoStep(solution.cursor + d); },
});

document.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
  b.onclick = () => setTraining(b.dataset.tab === 'train');
});
$('btn-scan').onclick = () => void scanner.open();
$('btn-phone').onclick = () => void phoneLink.open();
$('btn-paint').onclick = () => setPainting(!painting);
$('btn-blank').onclick = () =>
  replaceState(FACES.map((f) => BLANK.repeat(4) + f + BLANK.repeat(4)).join(''));
$('btn-solve').onclick = () => void solve();
$('btn-reset').onclick = () => replaceState(SOLVED);
$('btn-view').onclick = () => stage.resetView();
$('btn-scramble').onclick = () => {
  if (state.includes(BLANK) || !validate(state).ok) replaceState(SOLVED);
  randomScramble().forEach((m) => turn(m, false));
  history = [];
  refresh();
};
$('btn-undo').onclick = () => {
  const last = history.pop();
  if (last) turn(invertMove(last), false);
};

refresh();
// Opened from the laptop's QR code: go straight to the camera.
if (laptopLink) void scanner.open();
// #practise links straight to the trainer (handy as a phone bookmark); otherwise reopen the last tab.
try {
  if (!laptopLink && (location.hash === '#practise' || localStorage.getItem(TAB_KEY) === 'train')) setTraining(true);
} catch { /* ignore */ }
requestAnimationFrame(function frame(now) {
  animator.update(now);
  cubeView.tick(now);
  stage.render();
  requestAnimationFrame(frame);
});

if (import.meta.env.DEV) {
  // Handy in the console while developing.
  Object.assign(window, { cube: { get state() { return state; }, set: replaceState, turn, solve, gotoStep } });
}
