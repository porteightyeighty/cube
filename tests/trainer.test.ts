import { describe, expect, it } from 'vitest';
import { GEOM, SOLVED, applyMoves } from '../src/model/cube';
import { parseAlg, randomScramble, formatAlg } from '../src/model/moves';
import { applyNotation, invertNotation, parseNotation } from '../src/model/notation';
import {
  CASES, HOME, TOP_COLOUR, aufTurn, caseState, checkAlg, makeDrill, orientHome, stepDone, type LLCase,
} from '../src/trainer/cases';
import { applyTurn, type LayerTurn } from '../src/model/cube';
import { grade, pickCase, type Progress } from '../src/trainer/progress';

const run = (s: string, alg: string) => applyNotation(s, parseNotation(alg));
const at = (x: number, z: number) => GEOM.findIndex((g) => g.normal[1] === 1 && g.pos[0] === x && g.pos[2] === z);
const yellow = (s: string, x: number, z: number) => s[at(x, z)] === TOP_COLOUR;
const byName = (step: string, name: string) => CASES.find((c) => c.step === step && c.name === name)!;
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('notation', () => {
  it('face turns match the solver move tables', () => {
    for (let i = 0; i < 20; i++) {
      const alg = formatAlg(randomScramble(20));
      expect(run(SOLVED, alg)).toBe(applyMoves(SOLVED, parseAlg(alg)));
    }
  });
  it('wide, slice and rotation moves match their face-turn equivalents', () => {
    const same = (a: string, b: string) => expect(run(SOLVED, a)).toBe(run(SOLVED, b));
    same('f', 'B z');
    same('r', 'L x');
    same('Rw', 'r');
    same('u', 'D y');
    same('M', "R L' x'");
    same('E', "U D' y'");
    same('S', "F' B z");
    same("x2", "x' x'");
  });
  it('inverting undoes an algorithm, brackets and all', () => {
    const alg = parseNotation("(r U R' U') M2 [x y'] S E' f2");
    expect(applyNotation(applyNotation(SOLVED, alg), invertNotation(alg))).toBe(SOLVED);
  });
  it('rejects nonsense', () => {
    expect(() => parseNotation('R Q')).toThrow(/Q/);
    expect(() => parseNotation('R4')).toThrow();
  });
});

describe('last-layer cases', () => {
  it('HOME is yellow up, green front', () => {
    expect(HOME[4]).toBe('D');
    expect(HOME[22]).toBe('F');
  });

  it.each(CASES.map((c) => [c.name, c] as [string, LLCase]))('%s: default algorithm checks out', (_, c) => {
    expect(checkAlg(c, c.alg)).toBeNull();
    const s = caseState(c.alg);
    expect(stepDone(s, c.step)).toBe(false);
    const edgesUp = [[0, -1], [-1, 0], [1, 0], [0, 1]].filter(([x, z]) => yellow(s, x, z)).length;
    const cornersUp = [[-1, -1], [1, -1], [-1, 1], [1, 1]].filter(([x, z]) => yellow(s, x, z)).length;
    if (c.step === 'oll1') expect(edgesUp).toBeLessThan(4);
    else expect(edgesUp).toBe(4);
    if (c.step === 'oll2') expect(cornersUp).toBeLessThan(4);
    if (c.step.startsWith('pll')) expect(cornersUp).toBe(4);
  });

  it('cases sit the way the notes say', () => {
    const line = caseState(byName('oll1', 'Line').alg);
    expect([yellow(line, -1, 0), yellow(line, 1, 0), yellow(line, 0, -1), yellow(line, 0, 1)]).toEqual([true, true, false, false]);
    const l = caseState(byName('oll1', 'L shape').alg);
    expect([yellow(l, 1, 0), yellow(l, 0, 1), yellow(l, -1, 0), yellow(l, 0, -1)]).toEqual([true, true, false, false]);
    expect(yellow(caseState(byName('oll2', 'Sune').alg), -1, 1)).toBe(true);
    expect(yellow(caseState(byName('oll2', 'Antisune').alg), 1, -1)).toBe(true);
  });

  it('every drill is solved by its own plan, from any angle', () => {
    const rng = seeded(7);
    for (const c of CASES) {
      for (let k = 0; k < 12; k++) {
        const d = makeDrill(c, c.alg, rng);
        const turns = [aufTurn(d.plan.pre), ...d.alg.map((m) => m.turn), aufTurn(d.plan.post)].filter(Boolean) as LayerTurn[];
        expect(stepDone(orientHome(turns.reduce(applyTurn, d.state)), c.step)).toBe(true);
      }
    }
  });

  it('accepts a different algorithm for the same case', () => {
    const adj = byName('pll1', 'Adjacent swap');
    expect(checkAlg(adj, "R U R' F' R U R' U' R' F R2 U' R'")).toBeNull(); // Jb perm
    expect(checkAlg(byName('oll2', 'Sune'), "L U L' U L U2 L'")).toBeNull(); // Sune done from the back
    expect(checkAlg(byName('oll2', 'Sune'), "y R U R' U R U2 R'")).toBeNull(); // with a rotation first
    expect(checkAlg(byName('oll2', 'Sune'), "L' U' L U' L' U2 L")).toMatch(/doesn't solve/); // mirror = Antisune
  });

  it('rejects algorithms that solve something else', () => {
    expect(checkAlg(byName('oll2', 'Sune'), "R U2 R' U' R U' R'")).toMatch(/doesn't solve/);
    expect(checkAlg(byName('pll2', 'Ua'), "R2 U R U R' U' R' U' R' U R'")).toMatch(/doesn't solve/);
    expect(checkAlg(byName('oll1', 'Line'), "R U R'")).toMatch(/first two layers/);
    expect(checkAlg(byName('oll1', 'Line'), 'F Q')).toMatch(/Q/);
  });
});

describe('practice picking', () => {
  const fresh = (): Progress => ({ steps: ['oll2'], mode: 'recall', algs: {}, notes: {}, stats: {} });
  it('only picks from the chosen sets and never repeats straight away', () => {
    const p = fresh();
    const rng = seeded(3);
    let last: string | null = null;
    for (let i = 0; i < 200; i++) {
      const c: LLCase = pickCase(p, last, rng)!;
      expect(c.step).toBe('oll2');
      expect(c.id).not.toBe(last);
      last = c.id;
    }
  });
  it('brings up weak cases more often', () => {
    const p = fresh();
    for (const c of CASES.filter((x) => x.step === 'oll2' && x.id !== 'oll-pi')) for (let i = 0; i < 5; i++) grade(p, c.id, true);
    const rng = seeded(11);
    const n = Array.from({ length: 2000 }, () => pickCase(p, null, rng)!.id).filter((id) => id === 'oll-pi').length;
    expect(n / 2000).toBeGreaterThan(0.5);
  });
});
