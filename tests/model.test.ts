import { describe, expect, it } from 'vitest';
import Cube from 'cubejs';
import { FACES, GEOM, SOLVED, applyMove, applyMoves, rotateFaceStickers, type Move } from '../src/model/cube';
import { formatAlg, invertAlg, invertMove, parseAlg, randomScramble } from '../src/model/moves';
import { CORNERS, CORNER_NAMES, EDGES, EDGE_NAMES, validate } from '../src/model/validate';

const ALL: Move[] = FACES.flatMap((face) => ([1, 2, 3] as const).map((turns) => ({ face, turns })));
const scrambled = (n = 25) => applyMoves(SOLVED, randomScramble(n));
const swap = (s: string, i: number, j: number) => {
  const a = s.split('');
  [a[i], a[j]] = [a[j], a[i]];
  return a.join('');
};

describe('moves', () => {
  it('each quarter turn has order 4 and changes the cube', () => {
    for (const face of FACES) {
      const m: Move = { face, turns: 1 };
      let s = applyMove(SOLVED, m);
      expect(s).not.toBe(SOLVED);
      for (let i = 0; i < 3; i++) s = applyMove(s, m);
      expect(s).toBe(SOLVED);
    }
  });
  it('move then inverse is identity', () => {
    const start = scrambled();
    for (const m of ALL) expect(applyMove(applyMove(start, m), invertMove(m))).toBe(start);
  });
  it('scramble then inverse returns to solved', () => {
    for (let i = 0; i < 20; i++) {
      const alg = randomScramble();
      expect(applyMoves(applyMoves(SOLVED, alg), invertAlg(alg))).toBe(SOLVED);
    }
  });
  it('agrees with cubejs for every move and for random sequences', () => {
    for (const m of ALL) {
      expect(applyMove(SOLVED, m)).toBe(new Cube().move(formatAlg([m])).asString());
    }
    for (let i = 0; i < 20; i++) {
      const alg = randomScramble(30);
      expect(applyMoves(SOLVED, alg)).toBe(new Cube().move(formatAlg(alg)).asString());
    }
  });
  it('parses and formats notation', () => {
    expect(formatAlg(parseAlg("R U' F2  D2' L3"))).toBe("R U' F2 D2 L'");
    expect(() => parseAlg('R X')).toThrow();
  });
});

describe('piece tables', () => {
  it('corner and edge facelets sit on the same cubie and match their names', () => {
    for (const [table, names] of [[CORNERS, CORNER_NAMES], [EDGES, EDGE_NAMES]] as const) {
      table.forEach((idx, k) => {
        const pos = idx.map((i) => GEOM[i].pos.join());
        expect(new Set(pos).size).toBe(1);
        expect(idx.map((i) => SOLVED[i]).join('')).toBe(names[k]);
      });
    }
  });
});

describe('validate', () => {
  it('accepts solved and 100 random scrambles', () => {
    expect(validate(SOLVED).ok).toBe(true);
    for (let i = 0; i < 100; i++) expect(validate(scrambled()).errors).toEqual([]);
  });
  it('rejects a twisted corner', () => {
    const [a, b, c] = CORNERS[0];
    const s = scrambled().split('');
    [s[a], s[b], s[c]] = [s[c], s[a], s[b]];
    const v = validate(s.join(''));
    expect(v.ok).toBe(false);
    expect(v.errors[0].message).toMatch(/twisted/);
  });
  it('rejects a flipped edge', () => {
    const v = validate(swap(scrambled(), EDGES[3][0], EDGES[3][1]));
    expect(v.errors[0].message).toMatch(/flipped/);
  });
  it('rejects two swapped pieces', () => {
    let s = scrambled();
    s = swap(s, EDGES[0][0], EDGES[1][0]);
    s = swap(s, EDGES[0][1], EDGES[1][1]);
    expect(validate(s).errors[0].message).toMatch(/swapped/);
  });
  it('rejects bad colour counts, impossible and duplicate pieces, blanks', () => {
    const a = SOLVED.split('');
    a[0] = 'D';
    a[19] = 'D'; // white-yellow edge
    const bad = validate(a.join(''));
    expect(bad.errors.some((e) => /Too many yellow/.test(e.message))).toBe(true);
    expect(bad.errors.some((e) => /mirror/.test(e.message) && e.facelets.includes(0))).toBe(true);

    expect(bad.errors.some((e) => /white–yellow edge doesn't exist/.test(e.message))).toBe(true);

    // Swap two stickers of one corner: mirror image.
    const m = validate(swap(SOLVED, CORNERS[0][1], CORNERS[0][2]));
    expect(m.errors[0].message).toMatch(/mirror/);

    // Make the UF edge a second UR edge, keeping colour counts right.
    const d = validate(swap(SOLVED, 19, 12));
    expect(d.ok).toBe(false);

    const blank = validate('X' + SOLVED.slice(1));
    expect(blank.errors[0].message).toMatch(/1 sticker is still blank/);
  });
  it('suggests the face rotation that repairs a mis-oriented scan', () => {
    let hits = 0;
    for (let i = 0; i < 20; i++) {
      const good = scrambled();
      const bad = rotateFaceStickers(good, 'R', 1);
      if (bad === good) continue;
      const v = validate(bad);
      if (v.ok) continue; // rare: rotation happens to give another legal cube
      expect(v.fixes).toContainEqual({ face: 'R', quarterTurns: 3 });
      hits++;
    }
    expect(hits).toBeGreaterThan(10);
  });
});
