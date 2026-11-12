import { describe, expect, it } from 'vitest';
import { FACES, SOLVED, applyMoves, type Face } from '../src/model/cube';
import { randomScramble } from '../src/model/moves';
import { DEFAULT_REFS, classifyBalanced, samplePolys, toFacelets, type Poly, type Pt, type RGB } from '../src/scan/detect';
import { CORNER_SHOTS, FACE_SHOTS, type Shot } from '../src/scan/shots';
import { applyFit, snapFit, type Fit } from '../src/scan/snap';

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

describe('shot geometry', () => {
  for (const [name, shots] of [['corner', CORNER_SHOTS], ['face', FACE_SHOTS]] as const) {
    it(`${name} shots see every sticker exactly once`, () => {
      const seen = shots.flatMap((s) => s.cells.map((c) => c.facelet)).sort((a, b) => a - b);
      expect(seen).toEqual(Array.from({ length: 54 }, (_, i) => i));
      for (const s of shots) for (const c of s.cells) for (const [x, y] of c.poly) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
      }
    });
  }

  it('corner shots are white/green/red then yellow/orange/blue', () => {
    expect(CORNER_SHOTS.map((s) => [s.top, s.left, s.right])).toEqual([['U', 'F', 'R'], ['D', 'L', 'B']]);
  });
});

/** Rasterise a shot of `state`: black plastic, inset stickers, per-face lighting, misalignment, noise. */
function photograph(state: string, shot: Shot, size: number, warp: (p: Pt) => Pt): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let p = 0; p < data.length; p += 4) data.set([70, 60, 55, 255], p);
  const gain: Record<string, number> = Object.fromEntries(FACES.map((f) => [f, 0.65 + 0.45 * rnd()]));
  const inside = (x: number, y: number, poly: Poly) => {
    let k = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k;
    }
    return k;
  };
  for (const c of shot.cells) {
    const outer = c.poly.map(warp);
    const cx = outer.reduce((s, p) => s + p[0], 0) / 4;
    const cy = outer.reduce((s, p) => s + p[1], 0) / 4;
    const inner = outer.map(([x, y]) => [cx + (x - cx) * 0.82, cy + (y - cy) * 0.82] as Pt);
    const colour = DEFAULT_REFS[state[c.facelet] as Face];
    const g = gain[FACES[Math.floor(c.facelet / 9)]];
    const xs = outer.map((p) => p[0] * size); const ys = outer.map((p) => p[1] * size);
    const lo = (v: number[]) => Math.max(0, Math.floor(Math.min(...v)));
    const hi = (v: number[]) => Math.min(size - 1, Math.ceil(Math.max(...v)));
    for (let y = lo(ys); y <= hi(ys); y++) for (let x = lo(xs); x <= hi(xs); x++) {
      const u = (x + 0.5) / size; const v = (y + 0.5) / size;
      if (!inside(u, v, outer)) continue;
      const px = inside(u, v, inner)
        ? colour.map((ch) => clamp(ch * g + (rnd() - 0.5) * 20))
        : [15, 15, 15];
      data.set([...px, 255], (y * size + x) * 4);
    }
  }
  return data;
}

describe('2-photo corner scan', () => {
  it('recovers scrambles from two simulated photos, slightly misaligned', () => {
    const size = 240;
    for (let n = 0; n < 6; n++) {
      const state = applyMoves(SOLVED, randomScramble(25, rnd));
      const samples: RGB[] = Array(54);
      for (const shot of CORNER_SHOTS) {
        // The user never lines the cube up perfectly: a little bigger/smaller, a little off-centre.
        const k = 0.95 + 0.1 * rnd();
        const dx = (rnd() - 0.5) * 0.03;
        const dy = (rnd() - 0.5) * 0.03;
        const img = photograph(state, shot, size, ([x, y]) => [0.5 + (x - 0.5) * k + dx, 0.5 + (y - 0.5) * k + dy]);
        samplePolys(img, size, shot.cells.map((c) => c.poly)).forEach((rgb, i) => { samples[shot.cells[i].facelet] = rgb; });
      }
      const byFace = Object.fromEntries(FACES.map((f, fi) => [f, samples.slice(fi * 9, fi * 9 + 9)])) as Record<Face, RGB[]>;
      expect(toFacelets(classifyBalanced(byFace))).toBe(state);
    }
  });
});

describe('outline snapping', () => {
  for (const [name, shots] of [['corner', CORNER_SHOTS], ['face', FACE_SHOTS]] as const) {
    it(`recovers ${name} scans held well off the guide`, () => {
      const size = 240;
      let worst = 0;
      for (let n = 0; n < 4; n++) {
        const state = applyMoves(SOLVED, randomScramble(25, rnd));
        const samples: RGB[] = Array(54);
        for (const shot of shots) {
          const truth: Fit = {
            k: 0.85 + 0.3 * rnd(), rot: (rnd() - 0.5) * 14 * Math.PI / 180,
            dx: (rnd() - 0.5) * 0.1, dy: (rnd() - 0.5) * 0.1,
          };
          const img = photograph(state, shot, size, (p) => applyFit(truth, p));
          const polys = shot.cells.map((c) => c.poly);
          const fit = snapFit(img, size, polys);
          for (const c of shot.cells) for (const p of c.poly) {
            const [ax, ay] = applyFit(fit, p); const [bx, by] = applyFit(truth, p);
            worst = Math.max(worst, Math.hypot(ax - bx, ay - by));
          }
          samplePolys(img, size, polys.map((q) => q.map((p) => applyFit(fit, p))))
            .forEach((rgb, i) => { samples[shot.cells[i].facelet] = rgb; });
        }
        const byFace = Object.fromEntries(FACES.map((f, fi) => [f, samples.slice(fi * 9, fi * 9 + 9)])) as Record<Face, RGB[]>;
        expect(toFacelets(classifyBalanced(byFace))).toBe(state);
      }
      // Every outline corner lands within ~2% of the preview of where the cube really is.
      expect(worst).toBeLessThan(0.02);
    }, 30000);
  }
});
