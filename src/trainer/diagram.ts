import { GEOM } from '../model/cube';
import { COLOR_HEX } from '../colors';
import { TOP_COLOUR, TOP_LAYER, isOll, relevant, type Step } from './cases';

const NOT_YELLOW = '#3a4150';
const IGNORED = '#262b36';

// Top face 3×3 with the side stickers as thin strips around it, as on an OLL/PLL chart.
const CELL = 10, GAP = 0.9, STRIP = 3.4;
const O = STRIP + GAP;
const at = (k: number) => O + (k + 1) * (CELL + GAP);
const FAR = at(1) + CELL + GAP;
const SIZE = FAR + STRIP;

/** SVG markup for the top layer of `state`. OLL steps show only yellow / not yellow. */
export function diagram(state: string, step: Step, cls = 'll'): string {
  const keep = relevant(step);
  const rects = TOP_LAYER.map((i) => {
    const { pos: [x, , z], normal: [nx, , nz] } = GEOM[i];
    const fill = !keep.has(i) ? IGNORED
      : isOll(step) ? (state[i] === TOP_COLOUR ? COLOR_HEX[TOP_COLOUR] : NOT_YELLOW)
      : COLOR_HEX[state[i]];
    let r: [number, number, number, number];
    if (nz === -1) r = [at(x), 0, CELL, STRIP];
    else if (nz === 1) r = [at(x), FAR, CELL, STRIP];
    else if (nx === -1) r = [0, at(z), STRIP, CELL];
    else if (nx === 1) r = [FAR, at(z), STRIP, CELL];
    else r = [at(x), at(z), CELL, CELL];
    return `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="1.3" fill="${fill}"/>`;
  });
  return `<svg class="${cls}" viewBox="-1 -1 ${SIZE + 2} ${SIZE + 2}" role="img" aria-label="Top layer, seen from above, front at the bottom">${rects.join('')}</svg>`;
}
