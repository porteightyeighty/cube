import { SOLVED, applyMoves, type Move } from '../model/cube';
import { parseAlg } from '../model/moves';

type Reply =
  | { type: 'ready' }
  | { type: 'solution'; id: number; alg: string }
  | { type: 'error'; id: number; message: string };

export class SolverClient {
  private worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<number, { resolve: (alg: string) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise((resolve, reject) => {
      this.worker.addEventListener('message', (e: MessageEvent<Reply>) => {
        const msg = e.data;
        if (msg.type === 'ready') return resolve();
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.type === 'solution') p.resolve(msg.alg);
        else p.reject(new Error(msg.message));
      });
      this.worker.addEventListener('error', (e) => {
        const err = new Error(e.message || 'Solver failed to load');
        reject(err);
        this.pending.forEach((p) => p.reject(err));
        this.pending.clear();
      });
    });
  }

  /** Moves that solve a valid cube. The result is checked before it is returned. */
  async solve(facelets: string): Promise<Move[]> {
    await this.ready;
    const alg = await new Promise<string>((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, facelets });
    });
    const moves = parseAlg(alg);
    if (applyMoves(facelets, moves) !== SOLVED) throw new Error('Solver returned a wrong solution');
    return moves;
  }
}
