import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const VIEW_DIR = new THREE.Vector3(0.62, 0.55, 1).normalize(); // shows U, F and R
const FOV = 34;
const FIT_RADIUS = 2.85;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 60);
  readonly controls: OrbitControls;
  private fitDistance = 10;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    // Lights ride with the camera so whichever faces you look at are evenly lit.
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(-3, 5, 6);
    const fill = new THREE.DirectionalLight(0xffffff, 1.3);
    fill.position.set(6, -1, 4);
    this.camera.add(keyLight, fill);
    this.scene.add(this.camera);
    this.scene.add(this.makeShadow());

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.9;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.resetView();
  }

  /** Soft contact shadow under the cube, only visible from above. */
  private makeShadow(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 7.5),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -2.3;
    return mesh;
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Keep the whole cube in frame on narrow (portrait) screens.
    const half = THREE.MathUtils.degToRad(FOV / 2);
    const limiting = Math.min(half, Math.atan(Math.tan(half) * this.camera.aspect));
    this.fitDistance = FIT_RADIUS / Math.sin(limiting);
    this.controls.minDistance = this.fitDistance * 0.6;
    this.controls.maxDistance = this.fitDistance * 2;
    this.camera.position.setLength(this.fitDistance);
  }

  /** White on top, green in front: the orientation solutions are written for. */
  resetView() {
    this.camera.position.copy(VIEW_DIR).multiplyScalar(this.fitDistance);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
