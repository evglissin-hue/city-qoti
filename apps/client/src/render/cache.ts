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
import type { RefineJitter } from './refine';

/** How long the camera has to rest before frames come from the cache. */
export const REST_MS = 200;

/**
 * V4: what the still frame's key is made of (the renderer's `stillKey`), so a new still frame can
 * say what changed. The joined key is the same string as before V4.0.
 */
export interface StillKeyParts {
  /** The frame's targets (`LeanFrame.revision`) and the preset. */
  targets: number;
  quality: string;
  /** The camera's view (`WorldEnv.viewRevision`). */
  view: number;
  /** Static layers (`StaticRevisions.revision`). */
  content: number;
  /** The light (the renderer's light revision: the hour's quarter step, weather, photo's hour). */
  light: number;
  /** Sun shadow map renders. */
  shadows: number;
  /** The light map (`WorldEnv.lightMapRevision`: lamps lighting, windows stepping). */
  lamps: number;
}

/** The key's string, in V1D's order. */
export function stillKeyOf(p: StillKeyParts): string {
  return [p.targets, p.quality, p.view, p.content, p.light, p.shadows, p.lamps].join('|');
}

/**
 * V4: why the still frame is drawn again. `first`, `targets` and `view` start the development over
 * (a moving camera has dropped to the plain moving frame anyway); the rest are a step of the light
 * or a small change to the town, which V4A folds in without a restart, so the picture never pops
 * (30-roadmap.md, V4 acceptance; the lamplighter's lamps, one light map change a tick).
 */
export type StillChange = 'first' | 'targets' | 'view' | 'content' | 'light' | 'lamps' | 'shadows';

/** What changed between two keys (the biggest change wins), or null when they are the same. */
export function stillChange(prev: StillKeyParts | null, next: StillKeyParts): StillChange | null {
  if (!prev) return 'first';
  if (prev.targets !== next.targets || prev.quality !== next.quality) return 'targets';
  if (prev.view !== next.view) return 'view';
  if (prev.content !== next.content) return 'content';
  if (prev.light !== next.light) return 'light';
  if (prev.lamps !== next.lamps) return 'lamps';
  if (prev.shadows !== next.shadows) return 'shadows';
  return null;
}

/** Whether a change starts the development over (else it folds in fresh samples). */
export function restartsDevelopment(change: StillChange): boolean {
  return change === 'first' || change === 'targets' || change === 'view';
}

/**
 * V4: what `StillCache.refine` needs to draw and fold a sample. The renderer hands it over; the
 * cache never draws the scene itself.
 */
export interface RefineContext {
  renderer: WebGLRenderer;
  frame: LeanFrame;
  /** Draws the static layers into `target` with this sample's jitter (the renderer's scene pass). */
  draw(jitter: RefineJitter, target: WebGLRenderTarget): void;
}

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

/** GTAOPass, once its module has loaded (shared by every cache), and the load in flight. */
let aoMaker: ((scene: Scene, camera: Camera, width: number, height: number) => AoPass) | null = null;
let aoLoading: Promise<void> | null = null;

export class StillCache {
  /** The preset keeps a still-frame cache (Medium and up). */
  enabled = false;
  /** The preset adds screen-space AO to still frames (Ultra). */
  ao = false;
  /** Still frames drawn so far (the `?debug` overlay). */
  renders = 0;
  /**
   * V4: samples folded into the kept picture after its plain still frame (0 is today's still
   * frame). A new still frame for a restart sets it to 0; V4A's fold-in keeps some.
   */
  samples = 0;
  /** V4: the samples this rest develops to (the governor's `refineGoal`; 0 in V4.0). */
  goal = 0;
  /** V4: why the last still frame was drawn (null before the first). */
  lastChange: StillChange | null = null;
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

  /** Whether the camera has rested for REST_MS (with or without a cache to draw from). */
  rested(now: number): boolean {
    return now - this.lastMove >= REST_MS;
  }

  /** Whether the camera has rested long enough for frames to come from the cache. */
  resting(now: number): boolean {
    return this.enabled && this.rested(now);
  }

  /** Whether the kept picture is still true for `key` (see the renderer's `stillKey`). */
  /** V2X: the cached picture (the static layers only, with any ambient occlusion), or null. */
  get picture(): WebGLRenderTarget | null {
    return this.target;
  }

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
  keep(
    renderer: WebGLRenderer,
    frame: LeanFrame,
    src: WebGLRenderTarget,
    key: string,
    change: StillChange = 'first',
  ): void {
    // V4.0: every still frame is a fresh picture; V4A folds a light step or a small change into
    // the samples it has instead of starting over (`restartsDevelopment`).
    this.lastChange = change;
    this.samples = 0;
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

  /**
   * V4: whether the kept picture for `key` still has samples to develop this rest (one a frame).
   * Always false in V4.0, where the goal is 0.
   */
  developing(key: string): boolean {
    return this.enabled && this.valid(key) && this.samples < this.goal;
  }

  /**
   * V4: develops the kept picture by up to `n` samples, each drawn by `ctx.draw` with its jitter
   * (`refineJitter(samples + 1)`) and folded into the picture; returns how many it added. The
   * restore mesh then shows the developed picture, and its depth stays the plain still frame's.
   * V4.0's stub adds nothing and returns 0, so nothing on screen changes. V4A builds it.
   */
  refine(n: number, ctx: RefineContext): number {
    void n;
    void ctx;
    return 0;
  }

  /** The AO pass at this size, once its code has loaded (stills before that go without). */
  private aoFor(w: number, h: number, frame: LeanFrame): AoPass | null {
    if (!this.ao) {
      // Off this preset: free the pass and its targets (made again if Ultra comes back).
      this.aoPass?.dispose();
      this.aoTarget?.dispose();
      this.aoPass = null;
      this.aoTarget = null;
      return null;
    }
    if (!this.aoPass) {
      const make = aoMaker;
      if (!make) {
        // Loaded once, on demand, so presets without AO never download it.
        if (!aoLoading)
          aoLoading = import('three/examples/jsm/postprocessing/GTAOPass.js').then(({ GTAOPass }) => {
            aoMaker = (scene, camera, width, height) => {
              const pass = new GTAOPass(scene, camera, width, height);
              // The concept viewer's values: a soft, short-range occlusion that pools in corners.
              pass.updateGtaoMaterial({
                radius: 0.55,
                distanceExponent: 1.4,
                thickness: 1,
                scale: 1.25,
                samples: 16,
              });
              pass.updatePdMaterial({
                lumaPhi: 10,
                depthPhi: 2,
                normalPhi: 3,
                radius: 6,
                rings: 2,
                samples: 16,
              });
              pass.blendIntensity = 0.8;
              return pass;
            };
          });
        void aoLoading.then(() => this.invalidate());
        return null;
      }
      this.aoPass = make(this.scene, this.camera, w, h);
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
