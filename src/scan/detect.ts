import { FACES, type Face } from '../model/cube';

export type RGB = [number, number, number];

/** Typical sticker colours, used until a face's own centre has been seen. */
export const DEFAULT_REFS: Record<Face, RGB> = {
  U: [235, 235, 230], R: [200, 35, 45], F: [20, 160, 80],
  D: [240, 215, 40], L: [250, 120, 25], B: [25, 80, 200],
};

export function rgbToLab([r, g, b]: RGB): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * Colour difference that mostly ignores brightness. Each face is lit
 * differently as the cube is turned, which scales Lab chroma along with
 * lightness, so chroma is normalised by lightness before comparing. In
 * simulated scans this roughly halves-to-eliminates red/orange mix-ups
 * compared with plain Lab distance.
 */
export function colorDist(a: RGB, b: RGB): number {
  const [l1, a1, b1] = rgbToLab(a);
  const [l2, a2, b2] = rgbToLab(b);
  const k1 = 70 / (l1 + 20);
  const k2 = 70 / (l2 + 20);
  return Math.sqrt(0.05 * (l1 - l2) ** 2 + (a1 * k1 - a2 * k2) ** 2 + (b1 * k1 - b2 * k2) ** 2);
}

export function nearest(rgb: RGB, refs: Record<Face, RGB>): Face {
  let best: Face = 'U';
  let bestD = Infinity;
  for (const f of FACES) {
    const d = colorDist(rgb, refs[f]);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

export type Pt = [number, number];
/** A sticker outline in view coordinates (0..1 across the square preview). */
export type Poly = Pt[];

function inPoly([x, y]: Pt, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Median colour of the middle of each polygon (shrunk by `shrink` toward its
 * centroid, to stay clear of sticker borders). `data` is RGBA for a
 * size x size image; polygons are in 0..1 view coordinates.
 */
export function samplePolys(data: Uint8ClampedArray, size: number, polys: Poly[], shrink = 0.45): RGB[] {
  const median = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  return polys.map((poly) => {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const inner = poly.map(([x, y]) => [(cx + (x - cx) * shrink) * size, (cy + (y - cy) * shrink) * size] as Pt);
    const xs = inner.map((p) => p[0]);
    const ys = inner.map((p) => p[1]);
    const ch: number[][] = [[], [], []];
    const push = (x: number, y: number) => {
      const p = (y * size + x) * 4;
      ch[0].push(data[p]); ch[1].push(data[p + 1]); ch[2].push(data[p + 2]);
    };
    const clampI = (v: number) => Math.max(0, Math.min(size - 1, v));
    for (let y = clampI(Math.floor(Math.min(...ys))); y <= clampI(Math.ceil(Math.max(...ys))); y++) {
      for (let x = clampI(Math.floor(Math.min(...xs))); x <= clampI(Math.ceil(Math.max(...xs))); x++) {
        if (inPoly([x + 0.5, y + 0.5], inner)) push(x, y);
      }
    }
    if (!ch[0].length) push(clampI(Math.floor(cx * size)), clampI(Math.floor(cy * size)));
    return [median(ch[0]), median(ch[1]), median(ch[2])] as RGB;
  });
}

export type FaceSamples = Partial<Record<Face, RGB[]>>;
export type FaceLetters = Record<Face, (Face | null)[]>;

/** Reference colours: each scanned face's own centre, defaults for the rest. */
export function calibratedRefs(samples: FaceSamples): Record<Face, RGB> {
  const refs = { ...DEFAULT_REFS };
  for (const f of FACES) if (samples[f]) refs[f] = samples[f]![4];
  return refs;
}

/** Classify one face against the given references; the centre is known. */
export function classifyFace(samples: RGB[], face: Face, refs: Record<Face, RGB>): Face[] {
  return samples.map((rgb, i) => (i === 4 ? face : nearest(rgb, refs)));
}

/**
 * Classify all six faces together, using every centre as calibration and
 * forcing exactly nine stickers per colour. `fixed` holds cells the user set
 * by hand, which are kept.
 */
export function classifyBalanced(samples: Record<Face, RGB[]>, fixed?: FaceLetters): Record<Face, Face[]> {
  const refs = calibratedRefs(samples);
  const out = Object.fromEntries(FACES.map((f) => [f, Array<Face | null>(9).fill(null)])) as FaceLetters;
  const capacity = Object.fromEntries(FACES.map((f) => [f, 8])) as Record<Face, number>;
  const pairs: { face: Face; i: number; color: Face; d: number }[] = [];
  for (const face of FACES) {
    for (let i = 0; i < 9; i++) {
      if (i === 4) { out[face][i] = face; continue; }
      const manual = fixed?.[face][i];
      if (manual) { out[face][i] = manual; capacity[manual]--; continue; }
      for (const color of FACES) pairs.push({ face, i, color, d: colorDist(samples[face][i], refs[color]) });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const p of pairs) {
    if (out[p.face][p.i] || capacity[p.color] <= 0) continue;
    out[p.face][p.i] = p.color;
    capacity[p.color]--;
  }
  for (const face of FACES) {
    out[face] = out[face].map((v, i) => v ?? nearest(samples[face][i], refs));
  }
  return out as Record<Face, Face[]>;
}

export const toFacelets = (letters: Record<Face, (string | null)[]>): string =>
  FACES.map((f) => letters[f].map((l) => l ?? 'X').join('')).join('');
