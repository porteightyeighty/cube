import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FACES, FACE_AXIS, GEOM, faceletAt, type Move, type Vec3 } from '../model/cube';

interface Hit { facelet: number; point: THREE.Vector3 }

export interface InteractionOptions {
  dom: HTMLElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mode: () => 'turn' | 'paint';
  onTurn: (move: Move) => void;
  onPaint: (facelet: number) => void;
}

const BOX = new THREE.Box3(new THREE.Vector3(-1.5, -1.5, -1.5), new THREE.Vector3(1.5, 1.5, 1.5));
const DRAG_PX = 12;
const TAP_PX = 8;

/** Which turn a drag of (dx, dy) screen pixels starting on a sticker means. */
export function turnFromDrag(hit: Hit, dx: number, dy: number, camera: THREE.Camera, w: number, h: number): Move | null {
  const { pos, normal } = GEOM[hit.facelet];
  const nAxis = normal.findIndex((v) => v !== 0);
  const a = hit.point.clone().project(camera);
  let best: { axis: number; score: number } | null = null;
  for (let k = 0; k < 3; k++) {
    if (k === nAxis) continue;
    const t = new THREE.Vector3().setComponent(k, 0.5).add(hit.point).project(camera);
    const sx = ((t.x - a.x) * w) / 2;
    const sy = (-(t.y - a.y) * h) / 2;
    const score = (dx * sx + dy * sy) / (Math.hypot(sx, sy) || 1);
    if (!best || Math.abs(score) > Math.abs(best.score)) best = { axis: k, score };
  }
  if (!best) return null;
  // Dragging the surface point along d spins the layer about normal x d.
  const d: Vec3 = [0, 0, 0];
  d[best.axis] = Math.sign(best.score) || 1;
  const n = normal;
  const spin: Vec3 = [n[1] * d[2] - n[2] * d[1], n[2] * d[0] - n[0] * d[2], n[0] * d[1] - n[1] * d[0]];
  const axis = spin.findIndex((v) => v !== 0);
  const layer = pos[axis];
  if (layer === 0) return null; // middle slices aren't face turns
  const face = FACES.find((f) => FACE_AXIS[f].axis === axis && FACE_AXIS[f].sign === layer)!;
  return { face, turns: spin[axis] === -layer ? 1 : 3 };
}

export function attachInteraction(o: InteractionOptions) {
  const ray = new THREE.Raycaster();
  let drag: { hit: Hit; x: number; y: number; id: number; done: boolean } | null = null;
  let tap: { hit: Hit; x: number; y: number; id: number } | null = null;

  const pick = (e: PointerEvent): Hit | null => {
    const r = o.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, o.camera);
    const point = ray.ray.intersectBox(BOX, new THREE.Vector3());
    if (!point) return null;
    const c = point.toArray();
    const axis = c.reduce((bi, v, i) => (Math.abs(v) > Math.abs(c[bi]) ? i : bi), 0);
    const normal: Vec3 = [0, 0, 0];
    normal[axis] = Math.sign(c[axis]);
    const pos = c.map((v) => Math.max(-1, Math.min(1, Math.round(v)))) as Vec3;
    pos[axis] = normal[axis];
    return { facelet: faceletAt(pos, normal), point };
  };

  // Capture phase so we can switch orbiting off before OrbitControls sees the event.
  o.dom.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    const hit = pick(e);
    if (!hit) return;
    if (o.mode() === 'paint') {
      tap = { hit, x: e.clientX, y: e.clientY, id: e.pointerId };
    } else {
      drag = { hit, x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
      o.controls.enabled = false;
    }
  }, { capture: true });

  window.addEventListener('pointermove', (e) => {
    if (!drag || drag.done || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) < DRAG_PX) return;
    drag.done = true;
    const move = turnFromDrag(drag.hit, dx, dy, o.camera, o.dom.clientWidth, o.dom.clientHeight);
    if (move) o.onTurn(move);
  });

  const end = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) {
      drag = null;
      o.controls.enabled = true;
    }
    if (tap && e.pointerId === tap.id) {
      const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
      if (e.type === 'pointerup' && moved < TAP_PX) o.onPaint(tap.hit.facelet);
      tap = null;
    }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
