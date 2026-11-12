import { BLANK, FACES, rotateFaceStickers, type Face } from './cube';
import { COLOR_NAME } from '../colors';

// Facelet indices of each corner / edge position (Kociemba numbering), with
// the reference (U/D or F/B) sticker first.
export const CORNERS = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
export const EDGES = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

export interface CubeError {
  message: string;
  /** Stickers to highlight. */
  facelets: number[];
  /** Informational (e.g. blanks still to fill): list it, but don't flash stickers. */
  quiet?: boolean;
}
export interface FaceFix {
  face: Face;
  quarterTurns: number;
}
export interface Validation {
  ok: boolean;
  errors: CubeError[];
  /** Single-face re-orientations that would make the cube valid. */
  fixes: FaceFix[];
}

const piece = (letters: string) =>
  letters.split('').map((l) => COLOR_NAME[l as Face] ?? '?').join('–');

function permParity(perm: number[]): number {
  const seen = perm.map(() => false);
  let parity = 0;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) { seen[j] = true; len++; }
    parity ^= (len - 1) & 1;
  }
  return parity;
}

function check(s: string): CubeError[] {
  const errors: CubeError[] = [];
  if (s.length !== 54) return [{ message: 'Cube state is malformed.', facelets: [] }];

  const blanks = [...s].flatMap((ch, i) => (ch === BLANK ? [i] : []));
  if (blanks.length) {
    errors.push({
      message: `${blanks.length} sticker${blanks.length === 1 ? ' is' : 's are'} still blank.`,
      facelets: blanks,
      quiet: true,
    });
  }
  FACES.forEach((f, fi) => {
    if (s[fi * 9 + 4] !== f) {
      errors.push({ message: `The ${COLOR_NAME[f]} centre is in the wrong place.`, facelets: [fi * 9 + 4] });
    }
  });
  for (const f of FACES) {
    const idx = [...s].flatMap((ch, i) => (ch === f ? [i] : []));
    if (idx.length > 9) {
      errors.push({ message: `Too many ${COLOR_NAME[f]} stickers (${idx.length}, should be 9).`, facelets: [] });
    } else if (idx.length < 9 && !blanks.length) {
      errors.push({ message: `Too few ${COLOR_NAME[f]} stickers (${idx.length}, should be 9).`, facelets: [] });
    }
  }

  const cornerPerm: number[] = [];
  const edgePerm: number[] = [];
  let twist = 0;
  let flip = 0;
  let piecesOk = true;

  CORNERS.forEach((idx) => {
    const cols = idx.map((i) => s[i]);
    if (cols.includes(BLANK)) { piecesOk = false; return; }
    const ud = cols.flatMap((c, k) => (c === 'U' || c === 'D' ? [k] : []));
    const ori = ud.length === 1 ? ud[0] : -1;
    const rotated = ori < 0 ? '' : cols[ori] + cols[(ori + 1) % 3] + cols[(ori + 2) % 3];
    const j = CORNER_NAMES.indexOf(rotated);
    if (j < 0) {
      piecesOk = false;
      const sorted = [...cols].sort().join('');
      const mirror = CORNER_NAMES.some((n) => [...n].sort().join('') === sorted);
      errors.push({
        message: mirror
          ? `The ${piece(cols.join(''))} corner has its colours in mirror-image order — two of its stickers are swapped.`
          : `A ${piece(cols.join(''))} corner doesn't exist on a cube.`,
        facelets: idx,
      });
      return;
    }
    cornerPerm.push(j);
    twist += ori;
  });

  EDGES.forEach((idx) => {
    const cols = idx.map((i) => s[i]);
    if (cols.includes(BLANK)) { piecesOk = false; return; }
    let j = EDGE_NAMES.indexOf(cols[0] + cols[1]);
    if (j < 0) {
      j = EDGE_NAMES.indexOf(cols[1] + cols[0]);
      if (j >= 0) flip++;
    }
    if (j < 0) {
      piecesOk = false;
      errors.push({ message: `A ${piece(cols.join(''))} edge doesn't exist on a cube.`, facelets: idx });
      return;
    }
    edgePerm.push(j);
  });

  if (!piecesOk) return errors;

  const dupes = (perm: number[], where: number[][], names: string[], kind: string) => {
    let found = false;
    names.forEach((name, j) => {
      const at = perm.flatMap((p, pos) => (p === j ? [pos] : []));
      if (at.length > 1) {
        found = true;
        errors.push({
          message: `The ${piece(name)} ${kind} appears ${at.length} times.`,
          facelets: at.flatMap((pos) => where[pos]),
        });
      }
    });
    return found;
  };
  const dupC = dupes(cornerPerm, CORNERS, CORNER_NAMES, 'corner');
  const dupE = dupes(edgePerm, EDGES, EDGE_NAMES, 'edge');
  if (dupC || dupE || errors.length) return errors;

  if (twist % 3 !== 0) {
    errors.push({
      message: 'One corner is twisted in place. Check the corner stickers against your cube — a face may have been entered rotated.',
      facelets: [],
    });
  }
  if (flip % 2 !== 0) {
    errors.push({
      message: 'One edge is flipped in place. Check the edge stickers against your cube.',
      facelets: [],
    });
  }
  if (permParity(cornerPerm) !== permParity(edgePerm)) {
    errors.push({
      message: 'Two pieces are swapped (this position can\'t be reached by turning). Check for two stickers entered the wrong way round.',
      facelets: [],
    });
  }
  return errors;
}

export function validate(state: string): Validation {
  const errors = check(state);
  const fixes: FaceFix[] = [];
  if (errors.length && !state.includes(BLANK) && state.length === 54) {
    for (const face of FACES) {
      for (let q = 1; q <= 3; q++) {
        if (check(rotateFaceStickers(state, face, q)).length === 0) fixes.push({ face, quarterTurns: q });
      }
    }
  }
  return { ok: errors.length === 0, errors, fixes };
}
