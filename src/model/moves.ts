import { FACES, FACE_AXIS, type Face, type Move } from './cube';

export function parseMove(token: string): Move {
  const m = /^([URFDLB])(2'?|'|3)?$/.exec(token.trim());
  if (!m) throw new Error(`bad move "${token}"`);
  const suffix = m[2] ?? '';
  const turns = suffix.startsWith('2') ? 2 : suffix === '' ? 1 : 3;
  return { face: m[1] as Face, turns };
}

export const parseAlg = (alg: string): Move[] =>
  alg.split(/\s+/).filter(Boolean).map(parseMove);

export const formatMove = (m: Move) => m.face + (m.turns === 1 ? '' : m.turns === 2 ? '2' : "'");
export const formatAlg = (moves: Move[]) => moves.map(formatMove).join(' ');

export const invertMove = (m: Move): Move => ({ face: m.face, turns: (4 - m.turns) as 1 | 2 | 3 });
export const invertAlg = (moves: Move[]): Move[] => moves.map(invertMove).reverse();

export function randomScramble(length = 25, rng: () => number = Math.random): Move[] {
  const out: Move[] = [];
  while (out.length < length) {
    const face = FACES[Math.floor(rng() * 6)];
    const prev = out[out.length - 1];
    const prev2 = out[out.length - 2];
    if (prev && prev.face === face) continue;
    // Avoid e.g. "R L R": three turns in a row on the same axis.
    if (prev && prev2 && [prev, prev2].every((p) => FACE_AXIS[p.face].axis === FACE_AXIS[face].axis)) continue;
    out.push({ face, turns: (1 + Math.floor(rng() * 3)) as 1 | 2 | 3 });
  }
  return out;
}
