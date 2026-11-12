import { FACE_AXIS, applyTurn, type Face, type LayerTurn } from './cube';

// Full algorithm notation, beyond the solver's face turns:
//   R U' F2        face turns
//   r  Rw          wide turns (face + middle layer)
//   M E S          slices (M follows L, E follows D, S follows F)
//   x y z          whole-cube rotations (follow R, U, F)
// Brackets are ignored, so "(R U R' U')" is fine.

export interface AlgMove {
  /** Normalised notation, e.g. "r'" or "M2". */
  token: string;
  turn: LayerTurn;
}

const SLICE: Record<string, Face> = { M: 'L', E: 'D', S: 'F' };
const ROTATION: Record<string, Face> = { x: 'R', y: 'U', z: 'F' };

function base(letter: string): { axis: number; layers: number[]; cw: 1 | 3 } {
  const cwOf = (f: Face) => (FACE_AXIS[f].sign > 0 ? 3 : 1) as 1 | 3;
  if (letter in SLICE) {
    const f = SLICE[letter];
    return { axis: FACE_AXIS[f].axis, layers: [0], cw: cwOf(f) };
  }
  if (letter in ROTATION) {
    const f = ROTATION[letter];
    return { axis: FACE_AXIS[f].axis, layers: [-1, 0, 1], cw: cwOf(f) };
  }
  const wide = letter.length === 2 || letter === letter.toLowerCase();
  const f = letter[0].toUpperCase() as Face;
  const { axis, sign } = FACE_AXIS[f];
  return { axis, layers: wide ? [sign, 0] : [sign], cw: cwOf(f) };
}

export function parseToken(raw: string): AlgMove {
  const m = /^([URFDLB]w|[URFDLBurfdlbMESxyz])(2|3)?('?)$/.exec(raw);
  if (!m) throw new Error(`"${raw}" isn't a move`);
  const n = (m[2] === '2' ? 2 : m[2] === '3' ? 3 : 1) * (m[3] ? 3 : 1);
  const turns = n % 4;
  if (turns === 0) throw new Error(`"${raw}" does nothing`);
  const b = base(m[1]);
  const letter = m[1].length === 2 ? m[1][0].toLowerCase() : m[1];
  return {
    token: letter + (turns === 2 ? '2' : turns === 3 ? "'" : ''),
    turn: { axis: b.axis, layers: b.layers, q: ((b.cw * turns) % 4) as 1 | 2 | 3 },
  };
}

/** Parse a full algorithm. Throws with a readable message on a bad token. */
export function parseNotation(alg: string): AlgMove[] {
  return alg.replace(/[()[\]]/g, ' ').replace(/[’`´]/g, "'").split(/\s+/).filter(Boolean).map(parseToken);
}

export const formatNotation = (moves: AlgMove[]) => moves.map((m) => m.token).join(' ');

export function invertNotation(moves: AlgMove[]): AlgMove[] {
  return moves
    .slice()
    .reverse()
    .map(({ token, turn }) => {
      const letter = token.replace(/['2]/g, '');
      const t = token.endsWith('2') ? '2' : token.endsWith("'") ? '' : "'";
      return { token: letter + t, turn: { ...turn, q: (4 - turn.q) as 1 | 2 | 3 } };
    });
}

export const applyNotation = (state: string, moves: AlgMove[]) =>
  moves.reduce((s, m) => applyTurn(s, m.turn), state);
