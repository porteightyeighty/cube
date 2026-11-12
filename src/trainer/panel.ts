import type { LayerTurn } from '../model/cube';
import { parseToken } from '../model/notation';
import { CASES, STEPS, auf, aufTurn, caseState, checkAlg, makeDrill, type Drill, type LLCase, type Step } from './cases';
import { diagram } from './diagram';
import {
  MAX_BOX, algFor, caseById, grade, loadProgress, noteFor, pickCase, saveProgress, statsFor, type Mode,
} from './progress';

export interface TrainerHost {
  /** Put this position on the 3D cube. */
  show(state: string): void;
  /** Animate these turns from `start`; `onStep(n)` reports n turns finished. */
  play(start: string, turns: LayerTurn[], onStep: (done: number) => void): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const stepName = (s: Step) => STEPS.find((x) => x.id === s)!.name;

/** The algorithm as moves you can follow, keeping your brackets as groups; U turns around it as extra chips. */
function algHtml(text: string, pre: number, post: number): string {
  let i = 0;
  const out: string[] = [];
  const mv = (tok: string, cls = '') => `<span class="mv ${cls}" data-i="${i++}">${esc(tok)}</span>`;
  if (pre) out.push(mv(auf(pre), 'auf'));
  for (const piece of text.match(/[([]|[)\]]|[^\s()[\]]+/g) ?? []) {
    if (piece === '(' || piece === '[') out.push('<span class="grp">');
    else if (piece === ')' || piece === ']') out.push('</span>');
    else out.push(mv(parseToken(piece.replace(/[’`´]/g, "'")).token));
  }
  if (post) out.push(mv(auf(post), 'auf'));
  return `<div class="alg">${out.join(' ')}</div>`;
}

/** Last-layer practice: flash a case, recall (or name) it, mark yourself, repeat. Weak cases come up more. */
export class Trainer {
  private p = loadProgress();
  private drill: Drill | null = null;
  private answered = false;
  private guess: string | null = null;
  private session = { right: 0, total: 0 };
  private els: Record<'steps' | 'modes' | 'pic' | 'body' | 'score' | 'list', HTMLElement>;
  active = false;

  constructor(el: HTMLElement, private host: TrainerHost) {
    el.innerHTML = `
      <div class="tr-steps" data-k="steps"></div>
      <div class="seg" data-k="modes">
        <button type="button" data-mode="recall">Recall the algorithm</button>
        <button type="button" data-mode="recognise">Name the case</button>
      </div>
      <div class="tr-card">
        <div class="tr-pic" data-k="pic"></div>
        <div class="tr-body" data-k="body"></div>
      </div>
      <p class="small-text" data-k="score"></p>
      <details class="tr-algs">
        <summary>Your algorithms &amp; notes</summary>
        <p class="small-text">Change any algorithm to the one you use. It's checked against the case, and the practice pictures follow it. Brackets are kept as groups.</p>
        <div data-k="list"></div>
      </details>`;
    const q = (k: string) => el.querySelector<HTMLElement>(`[data-k=${k}]`)!;
    this.els = { steps: q('steps'), modes: q('modes'), pic: q('pic'), body: q('body'), score: q('score'), list: q('list') };

    this.els.steps.innerHTML = STEPS.map((s) =>
      `<button type="button" class="chip" data-step="${s.id}" title="${s.blurb}">${s.name}</button>`).join('');
    this.els.steps.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-step]');
      if (!b) return;
      const s = b.dataset.step as Step;
      this.p.steps = this.p.steps.includes(s) ? this.p.steps.filter((x) => x !== s) : [...this.p.steps, s];
      saveProgress(this.p);
      this.next();
    };
    this.els.modes.onclick = (e) => {
      const m = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode as Mode | undefined;
      if (!m || m === this.p.mode) return;
      this.p.mode = m;
      saveProgress(this.p);
      this.next();
    };
    this.els.body.onclick = (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-guess]');
      if (!t) return;
      if (t.dataset.guess) return this.answer(t.dataset.guess);
      ({ reveal: () => this.reveal(), right: () => this.mark(true), wrong: () => this.mark(false),
        next: () => this.next(), play: () => this.play() } as Record<string, () => void>)[t.dataset.act!]?.();
    };
    this.bindList();
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  activate() {
    this.active = true;
    if (this.drill) this.host.show(this.drill.state);
    else this.next();
    this.renderList();
  }

  deactivate() { this.active = false; }

  private get current(): LLCase | null { return this.drill ? caseById(this.drill.caseId) : null; }

  private next() {
    const c = pickCase(this.p, this.drill?.caseId ?? null);
    this.answered = false;
    this.guess = null;
    if (!c) {
      this.drill = null;
    } else {
      try {
        this.drill = makeDrill(c, algFor(this.p, c));
      } catch {
        this.drill = makeDrill(c, c.alg); // a saved algorithm that no longer checks out
      }
      this.host.show(this.drill.state);
    }
    this.render();
  }

  private reveal() {
    this.answered = true;
    this.render();
  }

  private mark(right: boolean) {
    const c = this.current;
    if (!c) return;
    grade(this.p, c.id, right);
    this.session.total++;
    if (right) this.session.right++;
    this.renderList();
    this.next();
  }

  private answer(id: string) {
    const c = this.current;
    if (!c || this.answered) return;
    this.guess = id;
    this.answered = true;
    grade(this.p, c.id, id === c.id);
    this.session.total++;
    if (id === c.id) this.session.right++;
    this.renderList();
    this.render();
  }

  private play() {
    const d = this.drill;
    if (!d) return;
    const turns = [aufTurn(d.plan.pre), ...d.alg.map((m) => m.turn), aufTurn(d.plan.post)].filter((t): t is LayerTurn => !!t);
    const chips = [...this.els.body.querySelectorAll<HTMLElement>('.mv')];
    this.host.play(d.state, turns, (done) => chips.forEach((ch, i) => {
      ch.classList.toggle('done', i < done);
      ch.classList.toggle('now', i === done);
    }));
  }

  private onKey(e: KeyboardEvent) {
    if (!this.active || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const recall = this.p.mode === 'recall';
    const c = this.current;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!this.answered && recall) this.reveal();
      else if (this.answered && !recall) this.next();
      else if (!c) this.next();
    } else if (this.answered && recall && (e.key === '1' || e.key === '2')) {
      this.mark(e.key === '2');
    } else if (!this.answered && !recall && c && /^[1-9]$/.test(e.key)) {
      const options = CASES.filter((x) => x.step === c.step);
      const pick = options[Number(e.key) - 1];
      if (pick) this.answer(pick.id);
    } else if (this.answered && (e.key === 'p' || e.key === 'P')) {
      this.play();
    }
  }

  private render() {
    this.els.steps.querySelectorAll<HTMLElement>('[data-step]').forEach((b) =>
      b.classList.toggle('on', this.p.steps.includes(b.dataset.step as Step)));
    this.els.modes.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
      b.classList.toggle('on', b.dataset.mode === this.p.mode));
    const { right, total } = this.session;
    this.els.score.textContent = total ? `This session: ${right} / ${total} right` : 'Yellow on top, green in front, like the 3D cube.';

    const c = this.current;
    const d = this.drill;
    if (!c || !d) {
      this.els.pic.innerHTML = '';
      this.els.body.innerHTML = '<p class="tr-prompt">Pick at least one set above.</p>';
      return;
    }
    this.els.pic.innerHTML = diagram(d.state, c.step);
    const recall = this.p.mode === 'recall';
    const tag = `<span class="tr-step">${stepName(c.step)}</span>`;

    if (!this.answered) {
      this.els.body.innerHTML = recall
        ? `${tag}<p class="tr-prompt">What's the algorithm? Say it or do it on your cube, then check.</p>
           <button type="button" class="btn primary big" data-act="reveal">Show answer <kbd>Space</kbd></button>`
        : `${tag}<p class="tr-prompt">Which case is this?</p>
           <div class="tr-guesses">${CASES.filter((x) => x.step === c.step).map((x, i) =>
             `<button type="button" class="btn" data-guess="${x.id}"><kbd>${i + 1}</kbd> ${esc(x.name)}</button>`).join('')}</div>`;
      return;
    }

    const verdict = recall ? ''
      : this.guess === c.id ? '<p class="tr-verdict ok">✓ Right</p>'
      : `<p class="tr-verdict bad">✗ You said ${esc(caseById(this.guess!).name)}</p>`;
    const preNote = d.plan.pre ? `<p class="small-text">Start with <b>${auf(d.plan.pre)}</b> to line the case up${d.plan.post ? `, and finish with <b>${auf(d.plan.post)}</b>` : ''}.</p>`
      : d.plan.post ? `<p class="small-text">Finish with <b>${auf(d.plan.post)}</b>.</p>` : '';
    const s = statsFor(this.p, c.id);
    this.els.body.innerHTML = `${tag}${verdict}
      <h2 class="tr-name">${esc(c.name)}</h2>
      ${algHtml(algFor(this.p, c), d.plan.pre, d.plan.post)}
      ${preNote}
      <p class="tr-note">${esc(noteFor(this.p, c))}</p>
      <div class="tr-actions">
        <button type="button" class="btn" data-act="play">▶ Show on cube <kbd>P</kbd></button>
        ${recall
          ? `<button type="button" class="btn bad" data-act="wrong">Missed it <kbd>1</kbd></button>
             <button type="button" class="btn good" data-act="right">Got it <kbd>2</kbd></button>`
          : '<button type="button" class="btn primary" data-act="next">Next <kbd>Space</kbd></button>'}
      </div>
      <p class="small-text">Seen ${s.seen}× · right ${s.right}×</p>`;
  }

  // ---- algorithm list ----

  private renderList() {
    this.els.list.innerHTML = STEPS.map((step) => `
      <h3>${step.name}</h3>
      ${CASES.filter((c) => c.step === step.id).map((c) => {
        const alg = algFor(this.p, c);
        const box = statsFor(this.p, c.id).box;
        const dots = Array.from({ length: MAX_BOX }, (_, i) => `<i class="${i < box ? 'on' : ''}"></i>`).join('');
        return `<div class="tr-row" data-id="${c.id}">
          ${diagram(caseState(alg), c.step, 'll mini')}
          <div class="tr-row-main">
            <div class="tr-row-head"><b>${esc(c.name)}</b><span class="boxes" title="How well you know it">${dots}</span></div>
            <input class="tr-alg-input" spellcheck="false" autocomplete="off" value="${esc(alg)}" aria-label="${esc(c.name)} algorithm">
            <p class="tr-err" hidden></p>
            <textarea rows="2" aria-label="${esc(c.name)} note">${esc(noteFor(this.p, c))}</textarea>
            ${this.p.algs[c.id] || this.p.notes[c.id] !== undefined ? '<button type="button" class="btn small" data-reset>Back to default</button>' : ''}
          </div>
        </div>`;
      }).join('')}`).join('');
  }

  private bindList() {
    const list = this.els.list;
    list.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement;
      const row = t.closest<HTMLElement>('[data-id]');
      if (!row) return;
      const c = caseById(row.dataset.id!);
      if (t.tagName === 'TEXTAREA') {
        if (t.value.trim() === c.note) delete this.p.notes[c.id];
        else this.p.notes[c.id] = t.value.trim();
        saveProgress(this.p);
        return;
      }
      const err = row.querySelector<HTMLElement>('.tr-err')!;
      const problem = checkAlg(c, t.value);
      err.hidden = !problem;
      err.textContent = problem ?? '';
      if (problem) return;
      if (t.value.trim() === c.alg) delete this.p.algs[c.id];
      else this.p.algs[c.id] = t.value.trim();
      saveProgress(this.p);
      this.renderList();
      if (this.drill?.caseId === c.id) this.restartDrill(c);
    });
    list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-reset]')?.closest<HTMLElement>('[data-id]');
      if (!row) return;
      const c = caseById(row.dataset.id!);
      delete this.p.algs[c.id];
      delete this.p.notes[c.id];
      saveProgress(this.p);
      this.renderList();
      if (this.drill?.caseId === c.id) this.restartDrill(c);
    });
  }

  private restartDrill(c: LLCase) {
    this.drill = makeDrill(c, algFor(this.p, c));
    this.answered = false;
    this.guess = null;
    if (this.active) this.host.show(this.drill.state);
    this.render();
  }
}
