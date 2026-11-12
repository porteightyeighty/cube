import { beforeAll, describe, expect, it } from 'vitest';
import Cube from 'cubejs';
import { SOLVED, applyMoves } from '../src/model/cube';
import { parseAlg, randomScramble } from '../src/model/moves';

describe('solver', () => {
  beforeAll(() => { Cube.initSolver(); }, 60_000);
  it('solves 20 random scrambles in at most 22 moves', () => {
    for (let i = 0; i < 20; i++) {
      const state = applyMoves(SOLVED, randomScramble());
      const moves = parseAlg(Cube.fromString(state).solve());
      expect(moves.length).toBeLessThanOrEqual(22);
      expect(applyMoves(state, moves)).toBe(SOLVED);
    }
  }, 60_000);
});
