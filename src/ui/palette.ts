import { FACES, type Face } from '../model/cube';
import { COLOR_HEX, COLOR_NAME } from '../colors';

/** Colour picker for painting, with a running count of each colour (9 needed). */
export class Palette {
  selected: Face = 'U';
  private buttons: HTMLButtonElement[];

  constructor(el: HTMLElement) {
    this.buttons = FACES.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.setProperty('--c', COLOR_HEX[f]);
      b.title = COLOR_NAME[f];
      b.onclick = () => { this.selected = f; this.mark(); };
      el.appendChild(b);
      return b;
    });
    this.mark();
  }

  private mark() {
    this.buttons.forEach((b, i) => b.classList.toggle('on', FACES[i] === this.selected));
  }

  render(state: string) {
    this.buttons.forEach((b, i) => {
      const n = state.split(FACES[i]).length - 1;
      b.textContent = `${n}/9`;
      b.classList.toggle('over', n > 9);
    });
  }
}
