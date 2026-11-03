// The still-frame cache (V1D; docs/spec/20-architecture.md, Lean renderer). When the camera has
// rested for REST_MS, the renderer draws the static layers once into the still scene target, and
// this keeps that picture (color and depth) in a target of its own. Each idle frame then restores it
// with one full-screen pass that writes color and depth (the restore mesh, drawn first inside the
// same render as the moving layers, since a multisampled target is resolved and invalidated at the
// end of every render), so only the moving layers, the blur chain and the final pass cost anything
// while the camera rests. On Ultra the kept picture also gets screen-space ambient occlusion (three's
// GTAOPass, once per still). The renderer decides when the cache is stale: any change in the key
// (the view, a static layer, the light, a shadow render, the targets) means drawing it again.
import {
  AlwaysDepth,
  Mesh,
  ShaderMaterial,
  type Camera,
  type Scene,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { MOVING_LAYER } from './layerTags';
import { colorTarget, FULLSCREEN_VERTEX, fullScreenTriangle, type LeanFrame } from './post';

/** How long the camera has to rest before frames come from the cache. */
export const REST_MS = 200;

/** Copies a color texture and a depth texture: color out, and the depth into the depth buffer. */
const COPY_FRAGMENT = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0);
    gl_FragDepth = texture2D(tDepth, vUv).r;
  }
`;

function copyMaterial(name: string): ShaderMaterial {
  return new ShaderMaterial({
    name,
    uniforms: { tColor: { value: null }, tDepth: { value: null } },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: COPY_FRAGMENT,
    depthTest: true,
    depthWrite: true,
    depthFunc: AlwaysDepth,
    toneMapped: false,
    fog: false,
  });
}

/** The parts of GTAOPass the cache uses (loaded only on a preset with still AO). */
interface AoPass {
  setSize(width: number, height: number): void;
  render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void;
  dispose(): void;
}

export class StillCache {
  /** The preset keeps a still-frame cache (Medium and up). */
  enabled = false;
  /** The preset adds screen-space AO to still frames (Ultra). */
  ao = false;
  /** Still frames drawn so far (the `?debug` overlay). */
  renders = 0;
  /**
   * The full-screen mesh that restores the cached picture at the start of an idle frame. It lives in
   * the scene on the moving layer, drawn before everything else, and only shows on idle frames.
   */
  readonly restore: Mesh;
  private readonly restoreMaterial = copyMaterial('StillRestore');
  private readonly capture = copyMaterial('StillCapture');
  private target: WebGLRenderTarget | null = null;
  private aoTarget: WebGLRenderTarget | null = null;
  private aoPass: AoPass | null = null;
  private aoLoading = false;
  private key = '';
  private lastMove = -Infinity;

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {
    this.restore = new Mesh(fullScreenTriangle(), this.restoreMaterial);
    this.restore.name = 'still-restore';
    this.restore.frustumCulled = false;
    this.restore.renderOrder = -1e9;
    this.restore.layers.set(MOVING_LAYER);
    this.restore.visible = false;
    this.restore.userData.noCast = true;
    this.restore.matrixAutoUpdate = false;
    scene.add(this.restore);
  }

  /** The camera moved at `now` (ms): the rest starts over. */
  noteMove(now: number): void {
    this.lastMove = now;
  }

  /** Whether the camera has rested long enough for frames to come from the cache. */
  resting(now: number): boolean {
    return this.enabled && now - this.lastMove >= REST_MS;
  }

  /** Whether the kept picture is still true for `key` (see the renderer's `stillKey`). */
  valid(key: string): boolean {
    return this.target !== null && key === this.key;
  }

  /** Forgets the kept picture (a quality or size change, say). */
  invalidate(): void {
    this.key = '';
  }

  /**
   * Keeps what the renderer just drew into `src` (the still scene target, static layers only, with
   * its depth texture resolved) as the cached picture for `key`, with ambient occlusion on top
   * where the preset has it.
   */
  keep(renderer: WebGLRenderer, frame: LeanFrame, src: WebGLRenderTarget, key: string): void {
    const w = src.width;
    const h = src.height;
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      this.target?.dispose();
      this.target = colorTarget(w, h, frame.format, { depth: true, depthTexture: true });
      this.restoreMaterial.uniforms.tColor!.value = this.target.texture;
      this.restoreMaterial.uniforms.tDepth!.value = this.target.depthTexture;
    }
    let color = src;
    const ao = this.aoFor(w, h, frame);
    if (ao && this.aoTarget) {
      ao.render(renderer, this.aoTarget, src, 0, false);
      color = this.aoTarget;
    }
    this.capture.uniforms.tColor!.value = color.texture;
    this.capture.uniforms.tDepth!.value = src.depthTexture;
    frame.pass(this.capture, this.target);
    this.key = key;
    this.renders++;
  }

  /** The AO pass at this size, once it has loaded (stills before that go without). */
  private aoFor(w: number, h: number, frame: LeanFrame): AoPass | null {
    if (!this.ao) return null;
    if (!this.aoPass) {
      if (!this.aoLoading) {
        this.aoLoading = true;
        void import('three/examples/jsm/postprocessing/GTAOPass.js').then(({ GTAOPass }) => {
          const pass = new GTAOPass(this.scene, this.camera, w, h);
          // The concept viewer's values: a soft, short-range occlusion that pools in corners.
          pass.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1, scale: 1.25, samples: 16 });
          pass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
          pass.blendIntensity = 0.8;
          this.aoPass = pass;
          this.invalidate();
        });
      }
      return null;
    }
    if (!this.aoTarget || this.aoTarget.width !== w || this.aoTarget.height !== h) {
      this.aoTarget?.dispose();
      this.aoTarget = colorTarget(w, h, frame.format);
      this.aoPass.setSize(w, h);
    }
    return this.aoPass;
  }

  dispose(): void {
    this.scene.remove(this.restore);
    this.restore.geometry.dispose();
    this.restoreMaterial.dispose();
    this.capture.dispose();
    this.target?.dispose();
    this.aoTarget?.dispose();
    this.aoPass?.dispose();
    this.target = this.aoTarget = this.aoPass = null;
  }
}
