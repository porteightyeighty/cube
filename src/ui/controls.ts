import { FACES, type Face, type Move } from '../model/cube';
import { formatMove, parseMove } from '../model/moves';

/** On-screen buttons for all twelve quarter turns. */
export function buildMovePad(el: HTMLElement, onMove: (m: Move) => void) {
  for (const turns of [1, 3] as const) {
    for (const face of FACES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small';
      b.textContent = formatMove({ face, turns });
      el.appendChild(b);
    }
  }
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'BUTTON') onMove(parseMove(t.textContent!));
  });
}

/** Keys U D L R F B turn that face (Shift = anticlockwise); arrows step the solution. */
export function bindKeys(handlers: { onMove: (m: Move) => void; onStep: (delta: number) => void }) {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') return handlers.onStep(1);
    if (e.key === 'ArrowLeft') return handlers.onStep(-1);
    const face = e.key.toUpperCase();
    if (e.key.length === 1 && (FACES as readonly string[]).includes(face)) {
      handlers.onMove({ face: face as Face, turns: e.shiftKey ? 3 : 1 });
    }
  });
}
