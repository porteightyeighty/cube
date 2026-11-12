import { samplePolys, type Poly, type RGB } from './detect';

const SAMPLE_SIZE = 360;

export class Camera {
  private stream: MediaStream | null = null;
  private canvas = document.createElement('canvas');

  constructor(private video: HTMLVideoElement) {
    this.canvas.width = this.canvas.height = SAMPLE_SIZE;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(window.isSecureContext ? 'This browser has no camera support.' : 'The camera needs a secure (https) page.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  /**
   * Colours of the given sticker outlines (0..1 view coordinates). The preview shows the centred square crop
   * of the frame (object-fit: cover in a square box), so sample the same crop.
   */
  sample(polys: Poly[]): RGB[] | null {
    const { videoWidth: vw, videoHeight: vh } = this.video;
    if (!vw || !vh) return null;
    const side = Math.min(vw, vh);
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return samplePolys(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, SAMPLE_SIZE, polys);
  }
}
