// Snap the sticker overlay onto the cube actually in the photo. People never
// line the cube up exactly with the guide, so before sampling we search small
// shifts, scale changes and rotations of the whole outline for the fit where
// sticker middles are flat and bright and the lines between stickers are dark.

import type { Poly, Pt } from './detect';

export interface Fit {
  /** Scale about the preview centre. */
  k: number;
  /** Rotation about the preview centre, radians. */
  rot: number;
  dx: number;
  dy: number;
}

export const IDENTITY: Fit = { k: 1, rot: 0, dx: 0, dy: 0 };

export function applyFit(fit: Fit, [x, y]: Pt): Pt {
  const c = Math.cos(fit.rot) * fit.k;
  const s = Math.sin(fit.rot) * fit.k;
  const u = x - 0.5;
  const v = y - 0.5;
  return [0.5 + c * u - s * v + fit.dx, 0.5 + s * u + c * v + fit.dy];
}

/** Point at (u, v) in 0..1 across a quad whose corners go round in order. */
function bilerp(q: Poly, u: number, v: number): Pt {
  const a = q[0], b = q[1], c = q[2], d = q[3];
  return [
    (1 - v) * ((1 - u) * a[0] + u * b[0]) + v * ((1 - u) * d[0] + u * c[0]),
    (1 - v) * ((1 - u) * a[1] + u * b[1]) + v * ((1 - u) * d[1] + u * c[1]),
  ];
}

const INNER: Pt[] = [0.3, 0.5, 0.7].flatMap((u) => [0.3, 0.5, 0.7].map((v) => [u, v] as Pt));
/**
 * Border samples sit just inside each sticker's own black rim, not on the
 * outline itself: on the cube's outer edge the outline borders the
 * background, and sampling there biases the fit toward shrinking.
 */
const RIM = 0.04;
const EDGE: Pt[] = [0.25, 0.5, 0.75].flatMap((t) => [[t, RIM], [1 - RIM, t], [t, 1 - RIM], [RIM, t]] as Pt[]);

/** How well an outline sits on the cube: sticker middles bright and even, sticker borders dark. */
export function fitScore(data: Uint8ClampedArray, size: number, polys: Poly[], fit: Fit): number {
  const px = (p: Pt) => {
    const [x, y] = applyFit(fit, p);
    const i = Math.max(0, Math.min(size - 1, Math.floor(x * size)));
    const j = Math.max(0, Math.min(size - 1, Math.floor(y * size)));
    return (j * size + i) * 4;
  };
  let score = 0;
  for (const q of polys) {
    let r = 0, g = 0, b = 0, rr = 0, gg = 0, bb = 0;
    for (const [u, v] of INNER) {
      const p = px(bilerp(q, u, v));
      r += data[p]; g += data[p + 1]; b += data[p + 2];
      rr += data[p] ** 2; gg += data[p + 1] ** 2; bb += data[p + 2] ** 2;
    }
    const n = INNER.length;
    const variance = (rr - r * r / n + gg - g * g / n + bb - b * b / n) / n;
    let edge = 0;
    for (const [u, v] of EDGE) {
      const p = px(bilerp(q, u, v));
      edge += 0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2];
    }
    const inner = (0.3 * r + 0.59 * g + 0.11 * b) / n;
    score += inner - edge / EDGE.length - 0.5 * Math.sqrt(Math.max(0, variance));
  }
  return score / polys.length;
}

/** Search for the outline placement that best matches the photo. */
export function snapFit(data: Uint8ClampedArray, size: number, polys: Poly[]): Fit {
  const deg = Math.PI / 180;
  let best = IDENTITY;
  let bestScore = fitScore(data, size, polys, best);
  const tryFit = (f: Fit) => {
    const s = fitScore(data, size, polys, f);
    if (s > bestScore) { bestScore = s; best = f; }
  };
  // Coarse grid over the range a hand-held cube plausibly strays...
  const range = (lo: number, hi: number, step: number) => {
    const out: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  };
  for (const k of range(0.8, 1.2, 0.05))
    for (const rot of range(-10 * deg, 10 * deg, 5 * deg))
      for (const dx of range(-0.1, 0.1, 0.025))
        for (const dy of range(-0.1, 0.1, 0.025)) tryFit({ k, rot, dx, dy });
  // ...then refine around the best, halving the steps each round.
  let step = { k: 0.025, rot: 2.5 * deg, d: 0.0125 };
  for (let round = 0; round < 4; round++) {
    const c = best;
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
      tryFit({ k: c.k + a * step.k, rot: c.rot + b * step.rot, dx: c.dx + x * step.d, dy: c.dy + y * step.d });
    }
    step = { k: step.k / 2, rot: step.rot / 2, d: step.d / 2 };
  }
  return best;
}
