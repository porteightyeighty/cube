// What each camera shot sees: which facelets, and where their stickers sit in
// the square preview. Corner shots are projected from the shared cube
// geometry (GEOM), so the overlay and the facelet order can't drift apart.

import { FACES, GEOM, type Face, type Vec3 } from '../model/cube';
import type { Poly, Pt } from './detect';

export interface Cell {
  /** Index into the 54-char facelet string. */
  facelet: number;
  poly: Poly;
}

export interface Shot {
  cells: Cell[];
  /** Centres in view. */
  faces: Face[];
  /** Which centre must be on top (and, for corner shots, left and right). */
  top: Face;
  left?: Face;
  right?: Face;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (...vs: Vec3[]): Vec3 => vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3) => scale(a, 1 / Math.sqrt(dot(a, a)));

/** Camera distance from the cube's centre, in cubie widths (the cube is 3 wide): ~20 cm for a 57 mm cube. */
const DIST = 10;
/** Fraction of the preview the cube's outline spans. */
const FILL = 0.84;

/**
 * A view of three faces, looking at the cube's corner along `corner` (from
 * cube toward camera) with world direction `up` pointing up on screen.
 */
export function cornerShot(corner: Vec3, up: Vec3): Shot {
  const back = unit(corner);
  const eye = scale(back, DIST);
  const fwd = scale(back, -1);
  const side = unit(cross(fwd, up));
  const upS = cross(side, fwd);
  const project = (p: Vec3): Pt => {
    const d = sub(p, eye);
    const z = dot(d, fwd);
    return [dot(d, side) / z, -dot(d, upS) / z];
  };

  const raw = GEOM.flatMap((g, facelet) => {
    if (dot(g.normal, back) <= 0) return [];
    const axes = [0, 1, 2].filter((a) => g.normal[a] === 0);
    const t1: Vec3 = [0, 0, 0];
    const t2: Vec3 = [0, 0, 0];
    t1[axes[0]] = 0.5;
    t2[axes[1]] = 0.5;
    const c = add(g.pos, scale(g.normal, 0.5));
    const poly = [
      add(c, scale(t1, -1), scale(t2, -1)), add(c, t1, scale(t2, -1)), add(c, t1, t2), add(c, scale(t1, -1), t2),
    ].map(project);
    return [{ facelet, poly, centre: project(c) }];
  });

  // Fit the outline into the preview, centred.
  const pts = raw.flatMap((r) => r.poly);
  const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const k = FILL / Math.max(x1 - x0, y1 - y0);
  const fit = ([x, y]: Pt): Pt => [0.5 + (x - (x0 + x1) / 2) * k, 0.5 + (y - (y0 + y1) / 2) * k];

  const centres = raw.filter((r) => r.facelet % 9 === 4).map((r) => ({ face: FACES[r.facelet / 9 | 0], at: r.centre }));
  const top = centres.reduce((a, b) => (b.at[1] < a.at[1] ? b : a));
  const [left, right] = centres.filter((c) => c !== top).sort((a, b) => a.at[0] - b.at[0]);
  return {
    cells: raw.map((r) => ({ facelet: r.facelet, poly: r.poly.map(fit) })),
    faces: centres.map((c) => c.face),
    top: top.face, left: left.face, right: right.face,
  };
}

/** Two opposite corners: white/green/red, then yellow/orange/blue. Together they see all 54 stickers. */
export const CORNER_SHOTS: Shot[] = [cornerShot([1, 1, 1], [0, 1, 0]), cornerShot([-1, -1, -1], [0, -1, 0])];

/** Fraction of the preview left outside the 3x3 guide on each side, in face-by-face mode. */
const GUIDE_INSET = 0.12;

/** Order faces are scanned in face-by-face mode. */
const FACE_ORDER: Face[] = ['F', 'R', 'B', 'L', 'U', 'D'];
/** Which centre must be on top while each face is shown, so rows land in facelet order. */
const TOP: Record<Face, Face> = { F: 'U', R: 'U', B: 'U', L: 'U', U: 'B', D: 'F' };

function faceShot(face: Face): Shot {
  const cell = (1 - 2 * GUIDE_INSET) / 3;
  return {
    faces: [face],
    top: TOP[face],
    cells: Array.from({ length: 9 }, (_, i) => {
      const x = GUIDE_INSET + (i % 3) * cell;
      const y = GUIDE_INSET + Math.floor(i / 3) * cell;
      return {
        facelet: FACES.indexOf(face) * 9 + i,
        poly: [[x, y], [x + cell, y], [x + cell, y + cell], [x, y + cell]] as Poly,
      };
    }),
  };
}

export const FACE_SHOTS: Shot[] = FACE_ORDER.map(faceShot);
