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
   * The centred square crop of the frame, which is what the preview shows
   * (object-fit: cover in a square box), at SAMPLE_SIZE x SAMPLE_SIZE.
   */
  frame(): { data: Uint8ClampedArray; size: number } | null {
    const { videoWidth: vw, videoHeight: vh } = this.video;
    if (!vw || !vh) return null;
    const side = Math.min(vw, vh);
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return { data: ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, size: SAMPLE_SIZE };
  }

  /** Colours of the given sticker outlines (0..1 view coordinates). */
  sample(polys: Poly[]): RGB[] | null {
    const f = this.frame();
    return f && samplePolys(f.data, f.size, polys);
  }
}
