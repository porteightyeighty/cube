// Cube model. The whole cube is a 54-character facelet string in Kociemba
// order (U, R, F, D, L, B; each face row-major). Letters name the face whose
// centre colour the sticker has; 'X' is a blank (not yet entered) sticker.
// Move tables are derived from sticker geometry, which the 3D view shares.

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];
export type Vec3 = [number, number, number];

export const BLANK = 'X';
export const SOLVED = FACES.map((f) => f.repeat(9)).join('');

/** Axis (0=x right, 1=y up, 2=z toward viewer) and side of each face. */
export const FACE_AXIS: Record<Face, { axis: number; sign: number }> = {
  U: { axis: 1, sign: 1 },
  R: { axis: 0, sign: 1 },
  F: { axis: 2, sign: 1 },
  D: { axis: 1, sign: -1 },
  L: { axis: 0, sign: -1 },
  B: { axis: 2, sign: -1 },
};

export interface FaceletGeom {
  face: Face;
  /** Cubie coordinates, each in {-1, 0, 1}. */
  pos: Vec3;
  normal: Vec3;
}

function faceletGeom(i: number): FaceletGeom {
  const face = FACES[Math.floor(i / 9)];
  const r = Math.floor((i % 9) / 3);
  const c = i % 3;
  switch (face) {
    case 'U': return { face, pos: [c - 1, 1, r - 1], normal: [0, 1, 0] };
    case 'R': return { face, pos: [1, 1 - r, 1 - c], normal: [1, 0, 0] };
    case 'F': return { face, pos: [c - 1, 1 - r, 1], normal: [0, 0, 1] };
    case 'D': return { face, pos: [c - 1, -1, 1 - r], normal: [0, -1, 0] };
    case 'L': return { face, pos: [-1, 1 - r, c - 1], normal: [-1, 0, 0] };
    default: return { face, pos: [1 - c, 1 - r, -1], normal: [0, 0, -1] };
  }
}

export const GEOM: FaceletGeom[] = Array.from({ length: 54 }, (_, i) => faceletGeom(i));

const key = (p: Vec3, n: Vec3) => `${p.map((v) => v + 0).join(',')}|${n.map((v) => v + 0).join(',')}`;
const INDEX = new Map(GEOM.map((g, i) => [key(g.pos, g.normal), i]));

export function faceletAt(pos: Vec3, normal: Vec3): number {
  const i = INDEX.get(key(pos, normal));
  if (i === undefined) throw new Error(`no facelet at ${key(pos, normal)}`);
  return i;
}

/** Rotate v by q quarter turns counter-clockwise about +axis (right-hand rule). */
export function rotQ(v: Vec3, axis: number, q: number): Vec3 {
  let [x, y, z] = v;
  for (let k = ((q % 4) + 4) % 4; k > 0; k--) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

export interface Move {
  face: Face;
  /** Clockwise quarter turns: 1 = R, 2 = R2, 3 = R'. */
  turns: 1 | 2 | 3;
}

/**
 * Any layer turn: `layers` (cubie coordinates along `axis`) rotate by `q`
 * quarter turns counter-clockwise about +axis. Face turns, wide turns, slices
 * and whole-cube rotations are all one of these.
 */
export interface LayerTurn {
  axis: number;
  layers: readonly number[];
  q: 1 | 2 | 3;
}

/** The layer turn a face move makes (clockwise seen from outside the face). */
export function faceTurn(m: Move): LayerTurn {
  const { axis, sign } = FACE_AXIS[m.face];
  const cw = sign > 0 ? 3 : 1;
  return { axis, layers: [sign], q: ((cw * m.turns) % 4) as 1 | 2 | 3 };
}

// dest[i] = where the sticker at facelet i ends up after the turn.
const PERMS = new Map<string, number[]>();
function perm(t: LayerTurn): number[] {
  const k = `${t.axis}:${[...t.layers].sort().join(',')}:${t.q}`;
  let dest = PERMS.get(k);
  if (!dest) {
    dest = GEOM.map((g, i) =>
      t.layers.includes(g.pos[t.axis]) ? faceletAt(rotQ(g.pos, t.axis, t.q), rotQ(g.normal, t.axis, t.q)) : i,
    );
    PERMS.set(k, dest);
  }
  return dest;
}

export function applyTurn(state: string, t: LayerTurn): string {
  const dest = perm(t);
  const next = new Array<string>(54);
  for (let i = 0; i < 54; i++) next[dest[i]] = state[i];
  return next.join('');
}

export const applyMove = (state: string, move: Move) => applyTurn(state, faceTurn(move));

export function applyMoves(state: string, moves: Move[]): string {
  return moves.reduce(applyMove, state);
}

export const isSolved = (state: string) => state === SOLVED;

/** Rotate just the nine stickers of one face in place (fixes a mis-oriented scan). */
export function rotateFaceStickers(state: string, face: Face, quarterTurns: number): string {
  const base = FACES.indexOf(face) * 9;
  let cur = state.slice(base, base + 9).split('');
  for (let t = 0; t < quarterTurns; t++) {
    const next = cur.slice();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) next[r * 3 + c] = cur[(2 - c) * 3 + r];
    cur = next;
  }
  return state.slice(0, base) + cur.join('') + state.slice(base + 9);
}
