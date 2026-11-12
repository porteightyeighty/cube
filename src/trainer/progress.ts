import { CASES, CASE_BY_ID, type LLCase, type Step } from './cases';

// What the trainer remembers between visits: chosen sets, your own algorithms
// and notes, and a Leitner box per case (0 = needs work … 5 = solid).

export type Mode = 'recall' | 'recognise';

export interface CaseStats { box: number; seen: number; right: number }

export interface Progress {
  steps: Step[];
  mode: Mode;
  algs: Record<string, string>;
  notes: Record<string, string>;
  stats: Record<string, CaseStats>;
}

const KEY = 'cube-trainer';
export const MAX_BOX = 5;
// How likely each box is to come up: weak cases far more often.
const WEIGHT = [10, 6, 4, 2, 1, 0.5];

export function loadProgress(): Progress {
  const fresh: Progress = { steps: ['oll1', 'oll2'], mode: 'recall', algs: {}, notes: {}, stats: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') return { ...fresh, ...raw };
  } catch { /* storage unavailable or corrupt */ }
  return fresh;
}

export function saveProgress(p: Progress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export const algFor = (p: Progress, c: LLCase) => p.algs[c.id] ?? c.alg;
export const noteFor = (p: Progress, c: LLCase) => p.notes[c.id] ?? c.note;
export const statsFor = (p: Progress, id: string): CaseStats => p.stats[id] ?? { box: 0, seen: 0, right: 0 };

export function grade(p: Progress, id: string, right: boolean) {
  const s = statsFor(p, id);
  p.stats[id] = {
    box: right ? Math.min(MAX_BOX, s.box + 1) : 0,
    seen: s.seen + 1,
    right: s.right + (right ? 1 : 0),
  };
  saveProgress(p);
}

/** Weighted pick from the chosen sets, avoiding an immediate repeat. */
export function pickCase(p: Progress, lastId: string | null, rng: () => number = Math.random): LLCase | null {
  let pool = CASES.filter((c) => p.steps.includes(c.step));
  if (pool.length > 1) pool = pool.filter((c) => c.id !== lastId);
  if (!pool.length) return null;
  const w = pool.map((c) => WEIGHT[statsFor(p, c.id).box]);
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= w[i]) < 0) return pool[i];
  return pool[pool.length - 1];
}

export const caseById = (id: string) => CASE_BY_ID.get(id)!;
