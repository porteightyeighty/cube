import { FACES, type Face } from '../model/cube';
import { COLOR_HEX, COLOR_NAME } from '../colors';

// Where each face sits in the unfolded cross (column, row).
const SLOT: Record<Face, [number, number]> = { U: [2, 1], L: [1, 2], F: [2, 2], R: [3, 2], B: [4, 2], D: [2, 3] };

/** Unfolded 2D view of all six faces; tapping a sticker reports its facelet index. */
export class NetView {
  private cells: HTMLButtonElement[] = [];

  constructor(el: HTMLElement, onTap: (facelet: number) => void) {
    FACES.forEach((face, fi) => {
      const box = document.createElement('div');
      box.className = 'net-face';
      box.style.gridColumn = String(SLOT[face][0]);
      box.style.gridRow = String(SLOT[face][1]);
      for (let k = 0; k < 9; k++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.i = String(fi * 9 + k);
        if (k === 4) {
          b.className = 'centre';
          b.textContent = face;
          b.title = `${COLOR_NAME[face]} centre (${face})`;
        }
        this.cells.push(b);
        box.appendChild(b);
      }
      el.appendChild(box);
    });
    el.addEventListener('click', (e) => {
      const i = (e.target as HTMLElement).dataset?.i;
      if (i !== undefined) onTap(Number(i));
    });
  }

  render(state: string, highlight: Set<number>) {
    this.cells.forEach((b, i) => {
      b.style.setProperty('--c', COLOR_HEX[state[i]] ?? COLOR_HEX.X);
      b.classList.toggle('bad', highlight.has(i));
    });
  }
}
