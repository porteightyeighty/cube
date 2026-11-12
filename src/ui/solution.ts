import type { Move } from '../model/cube';
import { formatAlg, formatMove } from '../model/moves';

export interface Solution {
  /** Cube state the solution starts from. */
  start: string;
  moves: Move[];
  /** How many moves are applied on the 3D cube right now. */
  cursor: number;
}

/** The move list. Tapping a move shows the cube as it should look after it. */
export class SolutionView {
  private list: HTMLElement;
  private count: HTMLElement;
  private copyBtn: HTMLButtonElement;
  private sol: Solution | null = null;

  constructor(private el: HTMLElement, onGoto: (cursor: number) => void) {
    el.innerHTML = `
      <div class="hold">Hold your cube with <b>WHITE on top</b> and <b>GREEN facing you</b>. Keep it that way throughout.</div>
      <div class="sol-head"><strong data-k="count"></strong>
        <span class="sol-nav">
          <button type="button" class="btn small" data-go="start" title="Back to start">⏮</button>
          <button type="button" class="btn small" data-go="prev" title="Previous move (←)">◀</button>
          <button type="button" class="btn small" data-go="next" title="Next move (→)">▶</button>
          <button type="button" class="btn small" data-k="copy">Copy</button>
        </span>
      </div>
      <ol class="moves" data-k="list"></ol>
      <p class="legend">Each letter is a quarter turn clockwise, as if looking straight at that face:
        <b>U</b>p <b>D</b>own <b>L</b>eft <b>R</b>ight <b>F</b>ront <b>B</b>ack.
        <b>'</b> = anticlockwise, <b>2</b> = half turn. Tap a move to see the cube after it.</p>`;
    this.list = el.querySelector('[data-k=list]')!;
    this.count = el.querySelector('[data-k=count]')!;
    this.copyBtn = el.querySelector('[data-k=copy]')!;

    el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-go],[data-n]');
      if (!t || !this.sol) return;
      const { cursor, moves } = this.sol;
      const go = t.dataset.go;
      const to = go === 'start' ? 0 : go === 'prev' ? cursor - 1 : go === 'next' ? cursor + 1 : Number(t.dataset.n);
      if (to >= 0 && to <= moves.length && to !== cursor) onGoto(to);
    });
    this.copyBtn.onclick = async () => {
      if (!this.sol) return;
      try {
        await navigator.clipboard.writeText(formatAlg(this.sol.moves));
        this.copyBtn.textContent = 'Copied';
      } catch {
        this.copyBtn.textContent = 'Copy failed';
      }
      setTimeout(() => (this.copyBtn.textContent = 'Copy'), 1500);
    };
  }

  render(sol: Solution | null) {
    this.sol = sol;
    this.el.hidden = !sol;
    if (!sol) return;
    const n = sol.moves.length;
    this.count.textContent = sol.cursor === n ? `${n} moves · solved` : `${n} moves · ${sol.cursor} done`;
    this.list.innerHTML = sol.moves
      .map((m, i) => {
        const cls = i < sol.cursor ? 'done' : i === sol.cursor ? 'next' : '';
        return `<li><button type="button" class="${cls}" data-n="${i + 1}">${formatMove(m)}</button></li>`;
      })
      .join('');
  }
}
