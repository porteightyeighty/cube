import { GEOM, SOLVED, applyTurn, type LayerTurn } from '../model/cube';
import { applyNotation, invertNotation, parseNotation, type AlgMove } from '../model/notation';

// Last-layer cases for 2-look OLL and PLL.
//
// Everything here works in the trainer's frame: the solved cube turned z2, so
// YELLOW is on top and green still faces you. A case's start position is never
// written by hand. It is derived by undoing the algorithm on a solved cube, so
// the picture always matches the algorithm in use (including your own).

export type Step = 'oll1' | 'oll2' | 'pll1' | 'pll2';

export interface LLCase {
  id: string;
  step: Step;
  name: string;
  alg: string;
  /** Recognition tip / memory hook (the user can replace it). */
  note: string;
}

export const STEPS: { id: Step; name: string; blurb: string }[] = [
  { id: 'oll1', name: 'OLL 1 · cross', blurb: 'Orient the top edges (make the yellow cross)' },
  { id: 'oll2', name: 'OLL 2 · corners', blurb: 'Orient the top corners (whole top yellow)' },
  { id: 'pll1', name: 'PLL 1 · corners', blurb: 'Put the top corners in place' },
  { id: 'pll2', name: 'PLL 2 · edges', blurb: 'Put the top edges in place' },
];

export const CASES: LLCase[] = [
  { id: 'oll-dot', step: 'oll1', name: 'Dot', alg: "F (R U R' U') F' f (R U R' U') f'",
    note: 'No yellow edges. It is the Line alg followed by the L alg.' },
  { id: 'oll-l', step: 'oll1', name: 'L shape', alg: "f (R U R' U') f'",
    note: 'Two yellow edges in an L: hold it so they are at the front and right. Same as Line, but with a wide f.' },
  { id: 'oll-line', step: 'oll1', name: 'Line', alg: "F (R U R' U') F'",
    note: 'Hold the line left-to-right. F, sexy move, F\'.' },

  { id: 'oll-sune', step: 'oll2', name: 'Sune', alg: "R U R' U R U2 R'",
    note: 'One yellow corner on top: hold it front-left. The front-right corner\'s yellow faces you.' },
  { id: 'oll-antisune', step: 'oll2', name: 'Antisune', alg: "R U2 R' U' R U' R'",
    note: 'One yellow corner on top: hold it back-right. The front-left corner\'s yellow faces you. Sune played backwards.' },
  { id: 'oll-h', step: 'oll2', name: 'H', alg: "(R U R' U) (R U' R' U) (R U2 R')",
    note: 'No yellow corners on top, yellow pairs on two opposite sides: hold them left and right. Sune with R U\' R\' U in the middle.' },
  { id: 'oll-pi', step: 'oll2', name: 'Pi', alg: "R U2 (R2 U' R2 U' R2) U2 R",
    note: 'No yellow corners on top, one side with a yellow pair: hold that side on the left. R U2, R2 U\' R2 U\' R2, U2 R.' },
  { id: 'oll-u', step: 'oll2', name: 'U (headlights)', alg: "R2 D (R' U2 R) D' (R' U2 R')",
    note: 'Two yellow corners at the back; the front shows a yellow pair (headlights) facing you.' },
  { id: 'oll-t', step: 'oll2', name: 'T', alg: "(r U R' U') (r' F R F')",
    note: 'Two yellow corners on the right; the left two have yellow facing front and back.' },
  { id: 'oll-bowtie', step: 'oll2', name: 'L (bowtie)', alg: "F' (r U R' U') (r' F R)",
    note: 'Yellow corners on a diagonal: hold them front-left and back-right, so the front-right corner\'s yellow faces you.' },

  { id: 'pll-adj', step: 'pll1', name: 'Adjacent swap', alg: "(R U R' U') (R' F R2 U') (R' U' R U) (R' F')",
    note: 'One side has headlights (matching corners). Put that side on the left. This is the T-perm.' },
  { id: 'pll-diag', step: 'pll1', name: 'Diagonal swap', alg: "F (R U' R' U') (R U R' F') (R U R' U') (R' F R F')",
    note: 'No headlights anywhere. Hold it any way round. This is the Y-perm.' },

  { id: 'pll-ua', step: 'pll2', name: 'Ua', alg: "(R U' R U) (R U R U') (R' U' R2)",
    note: 'One side solved: hold it at the back. The front edge belongs on the right.' },
  { id: 'pll-ub', step: 'pll2', name: 'Ub', alg: "(R2 U R U) (R' U' R' U') (R' U R')",
    note: 'One side solved: hold it at the back. The front edge belongs on the left. Ua played backwards.' },
  { id: 'pll-h', step: 'pll2', name: 'H', alg: 'M2 U M2 U2 M2 U M2',
    note: 'Opposite edges swap: every side has the opposite side\'s colour in the middle.' },
  { id: 'pll-z', step: 'pll2', name: 'Z', alg: "M' U M2 U M2 U M' U2 M2",
    note: 'Edges swap with their neighbours in two pairs: the middle stickers belong on the side next door.' },
];

export const CASE_BY_ID = new Map(CASES.map((c) => [c.id, c]));

// ---- frame and helpers ----

const ALL = [-1, 0, 1];
const turn = (axis: number, q: 1 | 2 | 3, layers: readonly number[] = ALL): LayerTurn => ({ axis, layers, q });
/** n clockwise U turns (U is a negative rotation about +y). */
const U_TURN = (n: number): LayerTurn | null => {
  const q = (((3 * n) % 4) + 4) % 4;
  return q ? turn(1, q as 1 | 2 | 3, [1]) : null;
};
const uTurns = (s: string, n: number) => {
  const t = U_TURN(n);
  return t ? applyTurn(s, t) : s;
};

/** Solved cube held yellow-up, green-front. */
export const HOME = applyTurn(SOLVED, turn(2, 2));
/** Letter of the yellow (top) colour in the facelet string. */
export const TOP_COLOUR = HOME[4];

const CENTRES = GEOM.flatMap((g, i) => (g.pos.filter((v) => v === 0).length === 2 ? [i] : []));
/** The 21 stickers of the top layer. */
export const TOP_LAYER = GEOM.flatMap((g, i) => (g.pos[1] === 1 ? [i] : []));
const LOWER = GEOM.flatMap((g, i) => (g.pos[1] !== 1 ? [i] : []));
const isCorner = (i: number) => GEOM[i].pos.every((v) => v !== 0);

// All 24 whole-cube orientations, as rotation sequences.
const ORIENTATIONS: LayerTurn[][] = (() => {
  const seen = new Map<string, LayerTurn[]>([[CENTRES.map((i) => HOME[i]).join(''), []]]);
  const queue: [string, LayerTurn[]][] = [[HOME, []]];
  while (queue.length) {
    const [s, path] = queue.shift()!;
    for (const r of [turn(0, 3), turn(1, 3)]) {
      const n = applyTurn(s, r);
      const k = CENTRES.map((i) => n[i]).join('');
      if (!seen.has(k)) {
        seen.set(k, [...path, r]);
        queue.push([n, [...path, r]]);
      }
    }
  }
  return [...seen.values()];
})();

/** Turn the whole cube so the centres are back yellow-up, green-front. */
export function orientHome(state: string): string {
  for (const rots of ORIENTATIONS) {
    const s = rots.reduce(applyTurn, state);
    if (CENTRES.every((i) => s[i] === HOME[i])) return s;
  }
  throw new Error('no orientation puts the centres home');
}

/** Which stickers matter for a step. OLL steps only care whether a sticker is yellow. */
export function relevant(step: Step): Set<number> {
  const top = TOP_LAYER.filter((i) => GEOM[i].normal[1] === 1);
  switch (step) {
    case 'oll1': return new Set(TOP_LAYER.filter((i) => !isCorner(i)));
    case 'oll2': return new Set(TOP_LAYER);
    case 'pll1': return new Set([...top, ...TOP_LAYER.filter((i) => isCorner(i))]);
    case 'pll2': return new Set(TOP_LAYER);
  }
}
const RELEVANT = Object.fromEntries((['oll1', 'oll2', 'pll1', 'pll2'] as Step[]).map((s) => [s, [...relevant(s)]])) as Record<Step, number[]>;
export const isOll = (step: Step) => step === 'oll1' || step === 'oll2';

function masked(state: string, step: Step): string {
  return RELEVANT[step].map((i) => (isOll(step) ? (state[i] === TOP_COLOUR ? 'Y' : '.') : state[i])).join('');
}

const f2lIntact = (state: string) => LOWER.every((i) => state[i] === HOME[i]);
/** Has `state` got this step done (the parts that matter for it), with the first two layers untouched? */
export const stepDone = (state: string, step: Step) => f2lIntact(state) && masked(state, step) === masked(HOME, step);

// ---- drills ----

export interface Plan {
  /** U turns before the algorithm (0..3; 3 = U'). */
  pre: number;
  /** U turns after it. */
  post: number;
}

/** How to finish the step from `state` with this algorithm, or null if it doesn't. Prefers the fewest extra U turns. */
export function planFor(state: string, step: Step, alg: AlgMove[]): Plan | null {
  const order = [0, 1, 3, 2];
  for (const pre of order) {
    const after = orientHome(applyNotation(uTurns(state, pre), alg));
    for (const post of order) if (stepDone(uTurns(after, post), step)) return { pre, post };
  }
  return null;
}

export interface Drill {
  caseId: string;
  /** Cube position to show (trainer frame). */
  state: string;
  alg: AlgMove[];
  plan: Plan;
}

/** A case seen from a random side (and, for PLL, with the top layer's colours shifted round). */
export function makeDrill(c: LLCase, algText: string, rng: () => number = Math.random): Drill {
  const alg = parseNotation(algText);
  const k = Math.floor(rng() * 4);
  const b = isOll(c.step) ? 0 : Math.floor(rng() * 4);
  const state = orientHome(uTurns(applyNotation(uTurns(HOME, b), invertNotation(alg)), k));
  const plan = planFor(state, c.step, alg);
  if (!plan) throw new Error(`${c.name}: the algorithm doesn't solve its own case`);
  return { caseId: c.id, state, alg, plan };
}

/** The case as the algorithm expects to find it (no extra U turns needed). */
export const caseState = (algText: string) => orientHome(applyNotation(HOME, invertNotation(parseNotation(algText))));

/** Check a replacement algorithm: null if it solves the case, otherwise what's wrong. */
export function checkAlg(c: LLCase, algText: string): string | null {
  let alg: AlgMove[];
  try {
    alg = parseNotation(algText);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (!alg.length) return 'Enter some moves.';
  const back = orientHome(applyNotation(HOME, alg));
  if (!f2lIntact(back)) return 'This breaks the first two layers.';
  if (!planFor(caseState(c.alg), c.step, alg)) return `This doesn't solve the ${c.name} case.`;
  return null;
}

/** Text for the U turns around an algorithm, e.g. "U'". */
export const auf = (n: number) => ['', 'U', 'U2', "U'"][((n % 4) + 4) % 4];
/** The pre/post U turns as layer turns, to animate. */
export const aufTurn = (n: number) => U_TURN(n);

