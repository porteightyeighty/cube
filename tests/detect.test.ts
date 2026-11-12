import { describe, expect, it } from 'vitest';
import { FACES, SOLVED, applyMoves, type Face } from '../src/model/cube';
import { randomScramble } from '../src/model/moves';
import {
  DEFAULT_REFS, calibratedRefs, classifyBalanced, classifyFace, samplePolys, toFacelets, type Poly, type RGB,
} from '../src/scan/detect';

// Deterministic noise so failures reproduce.
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

type Light = (c: RGB) => RGB;
const neutral: Light = (c) => c;
const warm: Light = ([r, g, b]) => [r * 1.05 + 10, g * 0.9, b * 0.6];
const dim: Light = ([r, g, b]) => [r * 0.55, g * 0.55, b * 0.6];

function photograph(state: string, light: Light, noise: number): Record<Face, RGB[]> {
  return Object.fromEntries(
    FACES.map((f, fi) => [
      f,
      [...state.slice(fi * 9, fi * 9 + 9)].map((ch) => {
        // Each face also gets its own brightness, like tilting a cube under a lamp.
        const gain = 0.85 + 0.3 * rnd();
        return light(DEFAULT_REFS[ch as Face]).map((v) => clamp(v * gain + (rnd() - 0.5) * 2 * noise)) as RGB;
      }),
    ]),
  ) as Record<Face, RGB[]>;
}

describe('colour detection', () => {
  for (const [name, light] of [['neutral', neutral], ['warm', warm], ['dim', dim]] as const) {
    it(`recovers scrambles under ${name} light`, () => {
      for (let i = 0; i < 25; i++) {
        const state = applyMoves(SOLVED, randomScramble(25, rnd));
        const samples = photograph(state, light, 8);
        expect(toFacelets(classifyBalanced(samples))).toBe(state);
        const refs = calibratedRefs(samples);
        const perFace = Object.fromEntries(FACES.map((f) => [f, classifyFace(samples[f], f, refs)]));
        expect(toFacelets(perFace as Record<Face, Face[]>)).toBe(state);
      }
    });
  }

  it('keeps manual corrections', () => {
    const state = applyMoves(SOLVED, randomScramble(25, rnd));
    const samples = photograph(state, neutral, 4);
    const fixed = Object.fromEntries(FACES.map((f) => [f, Array(9).fill(null)])) as Record<Face, (Face | null)[]>;
    const wrong: Face = state[0] === 'R' ? 'L' : 'R';
    fixed.U[0] = wrong;
    expect(classifyBalanced(samples, fixed).U[0]).toBe(wrong);
  });

  it('samples the middle of each grid cell', () => {
    const size = 120;
    const inset = 0.1;
    const data = new Uint8ClampedArray(size * size * 4).fill(7);
    const cell = (size * (1 - 2 * inset)) / 3;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = Math.floor((x - size * inset) / cell);
        const r = Math.floor((y - size * inset) / cell);
        if (c < 0 || c > 2 || r < 0 || r > 2) continue;
        data.set([r * 100, c * 100, (r * 3 + c) * 20, 255], (y * size + x) * 4);
      }
    }
    const polys: Poly[] = Array.from({ length: 9 }, (_, k) => {
      const x = (size * inset + (k % 3) * cell) / size;
      const y = (size * inset + Math.floor(k / 3) * cell) / size;
      const w = cell / size;
      return [[x, y], [x + w, y], [x + w, y + w], [x, y + w]];
    });
    const cells = samplePolys(data, size, polys);
    expect(cells).toHaveLength(9);
    cells.forEach((rgb, k) => expect(rgb).toEqual([Math.floor(k / 3) * 100, (k % 3) * 100, k * 20]));
  });
});
