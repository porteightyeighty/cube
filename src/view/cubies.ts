import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GEOM } from '../model/cube';
import { COLOR_HEX } from '../colors';

const CUBIE = 0.97;
const STICKER = 0.82;

function stickerGeometry(): THREE.ShapeGeometry {
  const h = STICKER / 2;
  const r = 0.13;
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ShapeGeometry(s, 6);
}

/** 26 cubies with a sticker mesh per facelet. Cubies rest at their home slots; colours come from the model. */
export class CubeView {
  readonly root = new THREE.Group();
  readonly cubies: THREE.Mesh[] = [];
  private mats: THREE.MeshPhysicalMaterial[] = [];
  private stickers: THREE.Mesh[] = [];
  private highlight = new Set<number>();

  constructor() {
    const body = new RoundedBoxGeometry(CUBIE, CUBIE, CUBIE, 5, 0.1);
    const plastic = new THREE.MeshPhysicalMaterial({ color: 0x0c0d10, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 });
    const byPos = new Map<string, THREE.Mesh>();
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const m = new THREE.Mesh(body, plastic);
      m.position.set(x, y, z);
      m.userData.home = [x, y, z];
      byPos.set([x, y, z].join(), m);
      this.cubies.push(m);
      this.root.add(m);
    }
    const geo = stickerGeometry();
    const forward = new THREE.Vector3(0, 0, 1);
    GEOM.forEach((g) => {
      const mat = new THREE.MeshPhysicalMaterial({
        roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const n = new THREE.Vector3(...g.normal);
      mesh.position.copy(n).multiplyScalar(CUBIE / 2 + 0.004);
      mesh.quaternion.setFromUnitVectors(forward, n);
      byPos.get(g.pos.join())!.add(mesh);
      this.mats.push(mat);
      this.stickers.push(mesh);
    });
  }

  setColors(state: string) {
    this.mats.forEach((m, i) => m.color.set(COLOR_HEX[state[i]] ?? COLOR_HEX.X));
  }

  setHighlight(ids: Iterable<number>) {
    this.highlight = new Set(ids);
    this.stickers.forEach((m, i) => { if (!this.highlight.has(i)) m.scale.setScalar(1); });
  }

  /** Pulse the size of highlighted stickers (keeps their colour readable). */
  tick(timeMs: number) {
    if (!this.highlight.size) return;
    const v = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(timeMs / 170));
    for (const i of this.highlight) this.stickers[i].scale.setScalar(v);
  }
}
