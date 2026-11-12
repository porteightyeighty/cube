import * as THREE from 'three';
import { applyTurn, faceTurn, type LayerTurn, type Move } from '../model/cube';
import type { CubeView } from './cubies';

interface Turn {
  move: LayerTurn;
  start: number;
  duration: number;
  angle: number;
  axis: THREE.Vector3;
  pivot: THREE.Group;
  cubies: THREE.Mesh[];
}

/** Plays queued layer turns. `shown` is the state currently painted on the cubies. */
export class Animator {
  private queue: LayerTurn[] = [];
  private turn: Turn | null = null;
  shown: string;
  /** Play every turn at a readable pace instead of speeding up when moves queue. */
  steady = false;
  /** Called after each queued turn finishes. */
  onTurnDone: (() => void) | null = null;

  constructor(private view: CubeView, state: string) {
    this.shown = state;
    view.setColors(state);
  }

  get busy() { return this.turn !== null || this.queue.length > 0; }

  enqueue(move: Move | LayerTurn) { this.queue.push('face' in move ? faceTurn(move) : move); }

  /** Jump straight to a state, dropping any animation in flight. */
  setState(state: string) {
    this.queue = [];
    if (this.turn) this.release(this.turn);
    this.turn = null;
    this.shown = state;
    this.view.setColors(state);
  }

  update(now: number) {
    if (!this.turn && this.queue.length) this.begin(this.queue.shift()!, now);
    const t = this.turn;
    if (!t) return;
    const p = Math.min(1, (now - t.start) / t.duration);
    const eased = 1 - (1 - p) ** 3;
    t.pivot.setRotationFromAxisAngle(t.axis, t.angle * eased);
    if (p >= 1) {
      this.release(t);
      this.turn = null;
      this.shown = applyTurn(this.shown, t.move);
      this.view.setColors(this.shown);
      this.onTurnDone?.();
      if (this.queue.length) this.begin(this.queue.shift()!, now);
    }
  }

  private begin(move: LayerTurn, now: number) {
    const { axis, layers, q } = move;
    const pivot = new THREE.Group();
    this.view.root.add(pivot);
    const cubies = this.view.cubies.filter((c) => layers.includes(c.userData.home[axis]));
    cubies.forEach((c) => pivot.add(c));
    const backlog = this.queue.length;
    const base = this.steady ? 420 : backlog > 4 ? 60 : backlog > 1 ? 120 : 210;
    this.turn = {
      move, pivot, cubies, start: now,
      duration: base * (q === 2 ? 1.35 : 1),
      // q counter-clockwise quarter turns about +axis; take the short way round.
      angle: (q === 3 ? -1 : q) * (Math.PI / 2),
      axis: new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0),
    };
  }

  /** Put the turning cubies back in their home slots (colours carry the change). */
  private release(t: Turn) {
    for (const c of t.cubies) {
      this.view.root.add(c);
      c.position.set(c.userData.home[0], c.userData.home[1], c.userData.home[2]);
      c.quaternion.identity();
    }
    this.view.root.remove(t.pivot);
  }
}
