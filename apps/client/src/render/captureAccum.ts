// V4X: the running mean of a developed capture (`capture`'s `samples`), kept on the GPU. Each sample
// drawn from the capture camera is folded into the mean by one full-screen pass (a running mean, so
// two float targets take turns and no blending is needed: float blending is an extension some
// machines lack). The picture is read back once, at the end.
import {
  Camera,
  Color,
  FloatType,
  HalfFloatType,
  Mesh,
  NearestFilter,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type BufferGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FULLSCREEN_VERTEX, fullScreenTriangle } from './post';
import { PHOTO_SAMPLES } from './refine';

/** A print (1600 x 1200) is drawn with at most this many extra samples: see `captureSampleCount`. */
export const PRINT_SAMPLES = 16;

/**
 * How many extra samples a capture of `w` x `h` draws for a request of `samples`: none for 0, a
 * negative or a non-number, whole numbers, at most `PHOTO_SAMPLES`, and at most `PRINT_SAMPLES`
 * for a print-size picture (more than a million pixels, `inkScale`'s k of 1), whose every sample
 * costs seconds in software and a lot of GPU on a laptop.
 */
export function captureSampleCount(samples: number | undefined, w: number, h: number): number {
  if (samples === undefined || !(samples > 0)) return 0;
  const cap = w * h > 1_000_000 ? PRINT_SAMPLES : PHOTO_SAMPLES;
  return Math.min(cap, Math.floor(samples));
}

/** The sample indices a developed capture draws (`refineJitter`'s): 0 is the plain one, then 1 to n. */
export function captureJitterIndices(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(i);
  return out;
}

const FOLD = /* glsl */ `
  uniform sampler2D tAcc;
  uniform sampler2D tSample;
  uniform float uWeight;
  uniform float uSkyOn;
  uniform vec3 uSky;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tSample, vUv);
    // Where nothing drew (beyond the valley), the sky's haze, so an edge pixel averages right.
    vec3 c = (uSkyOn > 0.5 && s.a <= 0.0) ? uSky : s.rgb;
    float a = uSkyOn > 0.5 ? 1.0 : s.a;
    vec4 prev = texture2D(tAcc, vUv);
    gl_FragColor = mix(prev, vec4(c, a), uWeight);
  }
`;

export class CaptureAccum {
  private targets: [WebGLRenderTarget, WebGLRenderTarget] | null = null;
  private current = 0;
  private count = 0;
  private readonly material = new ShaderMaterial({
    name: 'CaptureFold',
    uniforms: {
      tAcc: { value: null },
      tSample: { value: null },
      uWeight: { value: 1 },
      uSkyOn: { value: 0 },
      uSky: { value: new Color() },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: FOLD,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  private readonly geometry: BufferGeometry = fullScreenTriangle();
  private readonly mesh = new Mesh(this.geometry, this.material);
  private readonly scene = new Scene();
  private readonly camera = new Camera();

  constructor() {
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** Starts a mean `w` x `h` in this type (`float` to read back on the CPU, else half float). */
  begin(w: number, h: number, float: boolean): void {
    const type = float ? FloatType : HalfFloatType;
    const t = this.targets;
    if (!t || t[0].width !== w || t[0].height !== h || t[0].texture.type !== type) {
      this.dispose();
      const make = () =>
        new WebGLRenderTarget(w, h, {
          type,
          format: RGBAFormat,
          depthBuffer: false,
          minFilter: NearestFilter,
          magFilter: NearestFilter,
        });
      this.targets = [make(), make()];
    }
    this.current = 0;
    this.count = 0;
  }

  /** Folds one sample (a color texture the size of the mean) in; `sky` fills what drew nothing. */
  add(renderer: WebGLRenderer, sample: Texture, sky: Color | null): void {
    const t = this.targets;
    if (!t) return;
    const u = this.material.uniforms;
    u.tAcc!.value = t[this.current]!.texture;
    u.tSample!.value = sample;
    u.uWeight!.value = 1 / (this.count + 1);
    u.uSkyOn!.value = sky ? 1 : 0;
    if (sky) (u.uSky!.value as Color).copy(sky);
    const out = t[1 - this.current]!;
    const target = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(out);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(target);
    renderer.autoClear = autoClear;
    this.current = 1 - this.current;
    this.count++;
  }

  /** The mean so far. */
  get target(): WebGLRenderTarget {
    return this.targets![this.current]!;
  }

  /** Samples folded into the mean. */
  get samples(): number {
    return this.count;
  }

  dispose(): void {
    this.targets?.[0].dispose();
    this.targets?.[1].dispose();
    this.targets = null;
  }

  /** Lets everything go (the renderer's `dispose`). */
  destroy(): void {
    this.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
