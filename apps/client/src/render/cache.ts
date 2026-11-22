// The still-frame cache (V1D; docs/spec/20-architecture.md, Lean renderer). When the camera has
// rested for REST_MS, the renderer draws the static layers once into the still scene target, and
// this keeps that picture (color and depth) in a target of its own. Each idle frame then restores it
// with one full-screen pass that writes color and depth (the restore mesh, drawn first inside the
// same render as the moving layers, since a multisampled target is resolved and invalidated at the
// end of every render), so only the moving layers, the blur chain and the final pass cost anything
// while the camera rests. On Ultra the kept picture also gets screen-space ambient occlusion (three's
// GTAOPass, once per still). The renderer decides when the cache is stale: any change in the key
// (the view, a static layer, the light, a shadow render, the targets) means drawing it again.
//
// V4A, the developing picture (17-presentation.md, Visual direction, 6): once the plain still
// frame is kept, `refine` draws one jittered sample a frame (the renderer's `drawSample`) and folds
// it into a float accumulation beside the kept picture: a running mean per pixel, with the
// pixel's sample count in alpha. The restore mesh shows the developing picture; its depth stays
// the plain still frame's, so moving layers depth-test as before. Once the goal is reached the
// mean is resolved into a target of the frame's own format, so a settled idle frame reads what it
// read before V4. A light step or a small change to the town (`content`, `light`, `lamps`,
// `shadows`) never restarts it: the new plain still frame's difference from the old one is added
// to the developed picture (a lamp's light, a building, a shadow moved), and each pixel's count
// drops where it changed, so fresh samples take over there while everything else keeps its soft
// shadows, crisp edges and depth of field.
import {
  AlwaysDepth,
  HalfFloatType,
  Mesh,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { MOVING_LAYER } from './layerTags';
import { colorTarget, FULLSCREEN_VERTEX, fullScreenTriangle, type LeanFrame } from './post';
import { refineJitter, type RefineJitter } from './refine';

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

/** V4A: a pixel's sample count stops growing here (half floats hold whole numbers to 2048). */
export const COUNT_CAP = 1024;

/**
 * V4A: folds one sample into the running mean. `tAcc` holds the mean in rgb and the pixel's count
 * in alpha, or (`uFresh`) is the plain still frame itself, one sample. On Ultra the sample takes the
 * still frame's ambient occlusion (`tAo`, at `uAo`, as GTAOPass blends it), which is drawn once a
 * rest and never per sample.
 */
const FOLD_FRAGMENT = /* glsl */ `
  uniform sampler2D tAcc;
  uniform sampler2D tSample;
  uniform sampler2D tAo;
  uniform float uFresh;
  uniform float uAo;
  uniform float uCap;
  varying vec2 vUv;
  void main() {
    vec4 a = texture2D(tAcc, vUv);
    float n = uFresh > 0.5 ? 1.0 : max(a.a, 1.0);
    vec3 s = texture2D(tSample, vUv).rgb;
    if (uAo > 0.0) s *= mix(1.0, texture2D(tAo, vUv).r, uAo);
    gl_FragColor = vec4(a.rgb + (s - a.rgb) / (n + 1.0), min(n + 1.0, uCap));
  }
`;

/**
 * V4A: the fold-in of a light step or a small change. The new plain still frame's difference from
 * the old one is added to the developed picture, so whatever the development had (soft shadows,
 * crisp edges, depth of field) stays and the change shows at once: a lamp's light adds exactly.
 * Where a pixel changed a lot its count drops to `uKeep` of what it was, so fresh samples soon take
 * over there; `uReset` also moves such a pixel toward the new plain still (a building that rose
 * keeps none of the ground's old development). Unchanged pixels keep everything.
 */
const REBASE_FRAGMENT = /* glsl */ `
  uniform sampler2D tAcc;
  uniform sampler2D tOld;
  uniform sampler2D tNew;
  uniform float uKeep;
  uniform float uReset;
  varying vec2 vUv;
  float peak(vec3 c) { return max(c.r, max(c.g, c.b)); }
  void main() {
    vec4 a = texture2D(tAcc, vUv);
    vec3 o = texture2D(tOld, vUv).rgb;
    vec3 c = texture2D(tNew, vUv).rgb;
    vec3 d = c - o;
    float t = smoothstep(0.02, 0.25, peak(abs(d)) / (peak(o) + peak(c) + 0.02));
    vec3 m = mix(max(a.rgb + d, vec3(0.0)), c, t * uReset);
    gl_FragColor = vec4(m, max(1.0, max(a.a, 1.0) * mix(1.0, uKeep, t)));
  }
`;

/** V4A: the developed mean out of the accumulation (into the frame's own format, once settled). */
const SHOW_FRAGMENT = /* glsl */ `
  uniform sampler2D tColor;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0);
  }
`;

function passMaterial(name: string, fragmentShader: string, uniforms: Record<string, { value: unknown }>) {
  return new ShaderMaterial({
    name,
    uniforms,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
}

/**
 * V4A: how a change that folds in treats the pixels it changed (`REBASE_FRAGMENT`): `keep` is the
 * share of a changed pixel's count kept, `reset` how far it moves to the new plain still frame. A
 * lamp or a light step only adds or moves light, so the developed picture stays true under the
 * difference; a content change can put a new thing where the old development no longer applies.
 */
export const FOLD_RULES: Record<'content' | 'light' | 'lamps' | 'shadows', { keep: number; reset: number }> =
  {
    content: { keep: 0.1, reset: 1 },
    light: { keep: 0.25, reset: 0 },
    lamps: { keep: 0.5, reset: 0 },
    shadows: { keep: 0.25, reset: 0.5 },
  };

/** V4A: a float target for the accumulation (rgb the mean, alpha the count). */
function accumTarget(w: number, h: number): WebGLRenderTarget {
  return new WebGLRenderTarget(w, h, {
    format: RGBAFormat,
    type: HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
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
  /** The denoised AO (rgb), which the pass blends over the picture at `blendIntensity`. */
  readonly pdRenderTarget: WebGLRenderTarget;
  blendIntensity: number;
  /** V4A: the depth (and, absent normals, the normals) it reads, instead of a scene pass of its own. */
  setGBuffer(depthTexture?: Texture, normalTexture?: Texture): void;
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
  /** V4A: the accumulation's two targets (read one, write the other) and which holds the mean. */
  private readonly accum: [WebGLRenderTarget | null, WebGLRenderTarget | null] = [null, null];
  private current = 0;
  /** V4A: the accumulation holds the development of the kept picture (else it is the plain still). */
  private developed = false;
  /** V4A: the developed picture in the frame's own format, once settled (idle frames read it). */
  private shown: WebGLRenderTarget | null = null;
  private shownFresh = false;
  /** V4A: bumped whenever the picture on show is a new one (a still frame, a settle): the rest bloom. */
  private stamp = 0;
  /** V4A: the AO's intensity the samples take (0 off this preset or before its code arrives). */
  private aoShare = 0;
  private readonly fold = passMaterial('StillFold', FOLD_FRAGMENT, {
    tAcc: { value: null },
    tSample: { value: null },
    tAo: { value: null },
    uFresh: { value: 0 },
    uAo: { value: 0 },
    uCap: { value: COUNT_CAP },
  });
  private readonly rebase = passMaterial('StillRebase', REBASE_FRAGMENT, {
    tAcc: { value: null },
    tOld: { value: null },
    tNew: { value: null },
    uKeep: { value: 1 },
    uReset: { value: 0 },
  });
  private readonly show = passMaterial('StillShow', SHOW_FRAGMENT, { tColor: { value: null } });

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

  /**
   * V2X: the cached picture (the static layers only, with any ambient occlusion), or null. V4A: the
   * picture on show: the plain still frame, the developing mean, or the developed picture once
   * settled (the rest bloom is built from it once per `pictureKey`, never per sample).
   */
  get picture(): WebGLRenderTarget | null {
    if (!this.target) return null;
    if (this.shownFresh && this.shown) return this.shown;
    if (this.developed) return this.accum[this.current] ?? this.target;
    return this.target;
  }

  /**
   * V4A: what the picture on show was built for: the still frame's `key` and a stamp that moves on
   * each new still frame and each settle, but not on each sample (the rest bloom's key).
   */
  pictureKey(key: string): string {
    return `${key}#${this.stamp}`;
  }

  /** V4A: the plain still frame's depth (moving layers and the lens read it), or null. */
  get depth(): Texture | null {
    return this.target?.depthTexture ?? null;
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
  keep(
    renderer: WebGLRenderer,
    frame: LeanFrame,
    src: WebGLRenderTarget,
    key: string,
    change: StillChange = 'first',
  ): void {
    this.lastChange = change;
    const w = src.width;
    const h = src.height;
    // V4A: a light step or a small change folds into what has developed; the first still frame,
    // a new view or new targets start over (and so does any still frame before a sample folded).
    const fold =
      !restartsDevelopment(change) &&
      this.developed &&
      this.target !== null &&
      this.target.width === w &&
      this.target.height === h &&
      this.accum[this.current]?.width === w &&
      this.accum[this.current]?.height === h;
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      this.target?.dispose();
      this.target = colorTarget(w, h, frame.format, { depth: true, depthTexture: true });
      this.restoreMaterial.uniforms.tDepth!.value = this.target.depthTexture;
    }
    let color = src;
    const ao = this.aoFor(w, h, frame);
    if (ao && this.aoTarget) {
      ao.render(renderer, this.aoTarget, src, 0, false);
      color = this.aoTarget;
    }
    this.aoShare = ao && this.aoTarget ? ao.blendIntensity : 0;
    if (fold) {
      // The old plain still frame is still in the target: the difference is the change.
      const rule = FOLD_RULES[change as keyof typeof FOLD_RULES];
      const u = this.rebase.uniforms;
      u.tAcc!.value = this.accum[this.current]!.texture;
      u.tOld!.value = this.target.texture;
      u.tNew!.value = color.texture;
      u.uKeep!.value = rule.keep;
      u.uReset!.value = rule.reset;
      frame.pass(this.rebase, this.accum[1 - this.current]!);
      this.current = 1 - this.current;
    } else {
      this.samples = 0;
      this.developed = false;
    }
    this.shownFresh = false;
    this.capture.uniforms.tColor!.value = color.texture;
    this.capture.uniforms.tDepth!.value = src.depthTexture;
    frame.pass(this.capture, this.target);
    this.key = key;
    this.renders++;
    this.stamp++;
    this.showPicture();
  }

  /**
   * V4: whether the kept picture for `key` still has samples to develop this rest (one a frame).
   */
  developing(key: string): boolean {
    return this.enabled && this.valid(key) && this.samples < this.goal;
  }

  /**
   * V4: develops the kept picture by up to `n` samples, each drawn by `ctx.draw` with its jitter
   * (`refineJitter(samples + 1)`, the sequence running on through every fold) into the frame's
   * still target and folded into the accumulation; returns how many it added. The restore mesh
   * then shows the developing picture, and its depth stays the plain still frame's. Reaching the
   * goal settles it (`settle`).
   */
  refine(n: number, ctx: RefineContext): number {
    const kept = this.target;
    if (!kept) return 0;
    let added = 0;
    while (added < n && this.samples < this.goal) {
      const sample = ctx.frame.target('still');
      if (sample.width !== kept.width || sample.height !== kept.height) break;
      ctx.draw(refineJitter(this.samples + 1), sample);
      this.foldIn(ctx.frame, sample);
      this.samples++;
      added++;
    }
    this.settle(ctx.frame);
    return added;
  }

  /**
   * V4A: once the goal is reached (or the governor stopped it), the developed mean goes into a
   * target of the frame's own format, so a settled idle frame restores what it restored before V4
   * (and the rest bloom is built from it once). Cheap to call every resting frame.
   */
  settle(frame: LeanFrame): void {
    if (!this.developed || this.shownFresh || this.samples < this.goal || !this.target) return;
    const { width: w, height: h } = this.target;
    if (!this.shown || this.shown.width !== w || this.shown.height !== h) {
      this.shown?.dispose();
      this.shown = colorTarget(w, h, frame.format);
    }
    this.show.uniforms.tColor!.value = this.accum[this.current]!.texture;
    frame.pass(this.show, this.shown);
    this.shownFresh = true;
    this.stamp++;
    this.showPicture();
  }

  /** V4A: one sample into the running mean (from the plain still frame on the first). */
  private foldIn(frame: LeanFrame, sample: WebGLRenderTarget): void {
    const kept = this.target!;
    const { width: w, height: h } = kept;
    for (let i = 0; i < 2; i++) {
      const t = this.accum[i];
      if (t && t.width === w && t.height === h) continue;
      t?.dispose();
      this.accum[i] = accumTarget(w, h);
    }
    const u = this.fold.uniforms;
    u.tAcc!.value = this.developed ? this.accum[this.current]!.texture : kept.texture;
    u.uFresh!.value = this.developed ? 0 : 1;
    u.tSample!.value = sample.texture;
    u.tAo!.value = this.aoShare > 0 && this.aoPass ? this.aoPass.pdRenderTarget.texture : null;
    u.uAo!.value = u.tAo!.value ? this.aoShare : 0;
    frame.pass(this.fold, this.accum[1 - this.current]!);
    this.current = 1 - this.current;
    this.developed = true;
    this.shownFresh = false;
    this.showPicture();
  }

  /** Points the restore mesh at the picture on show. */
  private showPicture(): void {
    this.restoreMaterial.uniforms.tColor!.value = this.picture?.texture ?? null;
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
    this.fold.dispose();
    this.rebase.dispose();
    this.show.dispose();
    this.target?.dispose();
    this.aoTarget?.dispose();
    this.aoPass?.dispose();
    this.shown?.dispose();
    for (const t of this.accum) t?.dispose();
    this.target = this.aoTarget = this.aoPass = this.shown = null;
    this.accum[0] = this.accum[1] = null;
    this.developed = this.shownFresh = false;
  }
}
