// The lean frame graph (V1D; docs/spec/20-architecture.md, Lean renderer). The scene is drawn once a
// frame into a float scene target (multisampled from Medium up); a quarter resolution chain blurs a
// copy of it (a 4 x 4 downsample, then a horizontal and a vertical Gaussian of five linear fetches
// each); one final full-screen pass to the canvas mixes the sharp and blurred images for tilt-shift,
// adds bloom from the blurred image, tone maps, converts to sRGB, grades, vignettes and dithers. What
// those steps do to color is look.ts (V1A's); this file only calls its functions, in the order the
// wave notes fix. It replaced the classic chain (RenderPass, UnrealBloomPass, two tilt-shift passes,
// OutputPass and a grade pass), which V1X retired along with `?engine=classic`.
import {
  BufferGeometry,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  RGBAFormat,
  RGBFormat,
  Scene,
  ShaderMaterial,
  UnsignedInt101111Type,
  Vector2,
  WebGLRenderTarget,
  type Material,
  type PixelFormat,
  type TextureDataType,
  type WebGLRenderer,
} from 'three';
import {
  applyGrade,
  bloomFor,
  LOOK_GLSL,
  lookUniforms,
  tiltFor,
  type GradeSeason,
  type LookUniforms,
} from './look';

export type { GradeSeason } from './look';

/** Full-screen passes draw one big triangle with clip-space positions (no camera math). */
export const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** The one triangle that covers the screen: uv 0 to 1 across the visible part. */
export function fullScreenTriangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
}

/**
 * How strongly the tilt-shift mixes in the blurred image, per unit of `tiltFor` (look.ts) and of
 * the look's mask: the final pass uses smoothstep(0, 1, mask * tilt * TILT_MIX). At the far
 * camera (tilt 2.2) the top and bottom edges are fully soft and the middle band stays sharp, close
 * to the classic chain's two passes.
 */
export const TILT_MIX = 0.85;

/**
 * Downsample: four bilinear fetches a quarter of a target texel from its center, which average
 * the 4 x 4 block of source texels under it at full scale (and the 2 x 2 block when the source was
 * drawn at half the ratio), so the blur keeps one size on screen at any moving scale.
 */
const DOWN_FRAGMENT = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    gl_FragColor = 0.25 * (
      texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)) +
      texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)) +
      texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)) +
      texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)));
  }
`;

/**
 * The bloom's bright pass: each of the 4 x 4 source texels under a quarter resolution texel is kept
 * only if it is brighter than the threshold (by luminance, whole colors, as UnrealBloomPass's high
 * pass did), then they are averaged. A lit window keeps its light even when it is a pixel or two
 * across, and the blur spreads it into a halo; thresholding the blurred image (or a bilinear tap,
 * which already averages 2 x 2 texels) would average a small window away into the dark around it.
 * Sixteen fetches a quarter texel is one read a full resolution pixel, and no full resolution write.
 */
const BRIGHT_FRAGMENT = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uSrcSize;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    ivec2 base = ivec2(floor(vUv * uSrcSize - 1.5));
    ivec2 last = ivec2(uSrcSize) - 1;
    vec3 sum = vec3(0.0);
    for (int y = 0; y < 4; y++) {
      for (int x = 0; x < 4; x++) {
        vec3 c = texelFetch(tSrc, clamp(base + ivec2(x, y), ivec2(0), last), 0).rgb;
        sum += c * smoothstep(uThreshold, uThreshold + 0.1, dot(c, vec3(0.2126, 0.7152, 0.0722)));
      }
    }
    gl_FragColor = vec4(sum / 16.0, 1.0);
  }
`;

/**
 * The bloom chain's blurred bright light is this many times the look's bloom strength, so the
 * halo matches UnrealBloomPass's five mip levels (bloom factors 1, 0.8, 0.6, 0.4 and 0.2) with
 * one quarter resolution blur run twice.
 */
export const BLOOM_GAIN = 2.5;

/** A 9-tap Gaussian along one axis in five fetches (linear sampling between texel pairs). */
const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec2 o1 = uDir * uTexel * 1.3846154;
    vec2 o2 = uDir * uTexel * 3.2307692;
    gl_FragColor = texture2D(tSrc, vUv) * 0.2270270
      + (texture2D(tSrc, vUv + o1) + texture2D(tSrc, vUv - o1)) * 0.3162162
      + (texture2D(tSrc, vUv + o2) + texture2D(tSrc, vUv - o2)) * 0.0702703;
  }
`;

/**
 * The final pass, in the wave notes' order: tilt-shift mix, bloom, tone mapping, sRGB, then the
 * grade times the vignette, then dither. Without tilt-shift in view (close up) it skips the
 * blurred fetch, and without bloom (Low, or a strength of 0) the bloom fetch. `lookBloomMix` adds
 * the part of its second argument above the threshold; the bloom chain has taken that part
 * already, so it gets the bright light plus the threshold.
 */
const FINAL_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBlur;
  uniform sampler2D tBloom;
  uniform float uTilt;
  uniform float uBlurOn;
  uniform float uBloomOn;
  uniform float uBloomGain;
  ${LOOK_GLSL}
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    if (uBlurOn > 0.5) {
      vec3 b = texture2D(tBlur, vUv).rgb;
      c = mix(c, b, lookTiltMix(vUv, uTilt));
    }
    if (uBloomOn > 0.5) {
      vec3 glow = texture2D(tBloom, vUv).rgb * uBloomGain;
      c = lookBloomMix(c, glow + vec3(uLookBloomThreshold));
    }
    c = lookToneMap(c);
    vec4 o = lookSrgb(vec4(c, 1.0));
    o.rgb = lookGrade(o.rgb) * lookVignette(vUv);
    gl_FragColor = vec4(lookDither(o.rgb, gl_FragCoord.xy), 1.0);
  }
`;

/** The color format of the frame's float targets. */
export type SceneFormat = 'packed' | 'half';

/**
 * R11F_G11F_B10F where the browser can render to it (half the bytes of RGBA16F, which matters on
 * integrated graphics, where full-screen passes are bound by memory bandwidth), else RGBA16F. The
 * scene targets need no alpha: the final image is opaque. `?debug&scenefmt=half` forces RGBA16F.
 */
export function sceneFormat(renderer: WebGLRenderer, samples: number): SceneFormat {
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  if (q.has('debug') && q.get('scenefmt') === 'half') return 'half';
  if (!renderer.extensions.has('EXT_color_buffer_float')) return 'half';
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const probe = new WebGLRenderTarget(4, 4, { ...formatOptions('packed'), samples, depthBuffer: false });
  const before = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(probe);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE ? 'packed' : 'half';
  } catch {
    return 'half';
  } finally {
    renderer.setRenderTarget(before);
    probe.dispose();
  }
}

function formatOptions(f: SceneFormat): { format: PixelFormat; type: TextureDataType } {
  return f === 'packed'
    ? { format: RGBFormat, type: UnsignedInt101111Type }
    : { format: RGBAFormat, type: HalfFloatType };
}

/** A float color target of the frame (no mipmaps, linear filtering). */
export function colorTarget(
  w: number,
  h: number,
  f: SceneFormat,
  opts: { samples?: number; depth?: boolean; depthTexture?: boolean } = {},
): WebGLRenderTarget {
  const t = new WebGLRenderTarget(w, h, {
    ...formatOptions(f),
    samples: opts.samples ?? 0,
    depthBuffer: opts.depth ?? false,
    stencilBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthTexture: opts.depthTexture ? new DepthTexture(w, h) : null,
  });
  // The depth texture is resolved from the multisampled buffer only when a pass asks for it.
  t.resolveDepthBuffer = false;
  return t;
}

/** Sizes in device pixels for a CSS size at a pixel ratio. */
export function deviceSize(cssW: number, cssH: number, ratio: number): [number, number] {
  return [Math.max(2, Math.round(cssW * ratio)), Math.max(2, Math.round(cssH * ratio))];
}

export interface FrameLayout {
  /** CSS size of the canvas. */
  width: number;
  height: number;
  /** Pixel ratio of moving frames, after dynamic resolution. */
  movingRatio: number;
  /** Pixel ratio of still and idle frames (the canvas is drawn at this ratio). */
  stillRatio: number;
  /** MSAA samples on the scene targets (0 or 4; capped by the GPU). */
  msaa: number;
  /** The still target keeps a depth texture (for the still-frame cache). */
  stillDepth: boolean;
}

/**
 * The lean renderer's targets and passes: the scene targets the renderer draws into (one for
 * moving frames, one for still and idle frames; the same target when both draw at one ratio), the
 * quarter resolution blur chain and the final pass to the canvas.
 */
export class LeanFrame {
  /** The look's uniforms, shared by the final pass (V1A sets the values through look.ts). */
  readonly look: LookUniforms = lookUniforms();
  readonly format: SceneFormat;
  private readonly fsScene = new Scene();
  private readonly fsCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fsMesh: Mesh;
  private readonly down: ShaderMaterial;
  private readonly blur: ShaderMaterial;
  private readonly final: ShaderMaterial;
  private moving: WebGLRenderTarget | null = null;
  private still: WebGLRenderTarget | null = null;
  private qa: WebGLRenderTarget | null = null;
  private qb: WebGLRenderTarget | null = null;
  /** The bloom chain's quarter resolution targets. */
  private qc: WebGLRenderTarget | null = null;
  private qd: WebGLRenderTarget | null = null;
  private readonly brightPass: ShaderMaterial;
  private layout: FrameLayout | null = null;
  private blurPasses = 1;
  private tilt = 0;
  private bloom = true;
  private night = 0;
  private season: GradeSeason = 'spring';
  private warmth = 0;
  /** Bumped whenever the targets are reallocated (the still-frame cache follows the still target). */
  revision = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    msaa: number,
  ) {
    this.format = sceneFormat(renderer, Math.min(msaa, renderer.capabilities.maxSamples));
    this.fsMesh = new Mesh(fullScreenTriangle());
    this.fsMesh.frustumCulled = false;
    this.fsScene.add(this.fsMesh);
    const pass = (name: string, fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
      new ShaderMaterial({
        name,
        uniforms,
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
    this.down = pass('LeanDown', DOWN_FRAGMENT, { tSrc: { value: null }, uTexel: { value: new Vector2() } });
    this.brightPass = pass('LeanBright', BRIGHT_FRAGMENT, {
      tSrc: { value: null },
      uSrcSize: { value: new Vector2() },
      uThreshold: { value: 1 },
    });
    this.blur = pass('LeanBlur', BLUR_FRAGMENT, {
      tSrc: { value: null },
      uTexel: { value: new Vector2() },
      uDir: { value: new Vector2(1, 0) },
    });
    this.final = pass('LeanFinal', FINAL_FRAGMENT, {
      tScene: { value: null },
      tBlur: { value: null },
      tBloom: { value: null },
      uTilt: { value: 0 },
      uBlurOn: { value: 0 },
      uBloomOn: { value: 0 },
      uBloomGain: { value: BLOOM_GAIN },
      ...this.look,
    });
    this.setSeason('spring');
    this.setNight(0);
  }

  /** Draws `material` over the whole of `target` (null: the canvas). It covers it, so no clear. */
  pass(material: Material, target: WebGLRenderTarget | null): void {
    const r = this.renderer;
    const autoClear = r.autoClear;
    this.fsMesh.material = material;
    r.autoClear = false;
    r.setRenderTarget(target);
    r.render(this.fsScene, this.fsCamera);
    r.autoClear = autoClear;
  }

  /** (Re)allocates whatever targets the layout changed. Returns true when anything changed. */
  configure(l: FrameLayout): boolean {
    const p = this.layout;
    const samples = Math.min(l.msaa, this.renderer.capabilities.maxSamples);
    const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    const sizeSame = p !== null && p.width === l.width && p.height === l.height;
    const stillSame =
      sizeSame && same(p.stillRatio, l.stillRatio) && p.msaa === l.msaa && p.stillDepth === l.stillDepth;
    const movingSame = stillSame && same(p.movingRatio, l.movingRatio);
    if (movingSame) return false;
    if (!stillSame) {
      this.disposeMoving();
      this.still?.dispose();
      for (const t of [this.qa, this.qb, this.qc, this.qd]) t?.dispose();
      const [sw, sh] = deviceSize(l.width, l.height, l.stillRatio);
      this.still = colorTarget(sw, sh, this.format, { samples, depth: true, depthTexture: l.stillDepth });
      const qw = Math.max(2, Math.ceil(sw / 4));
      const qh = Math.max(2, Math.ceil(sh / 4));
      this.qa = colorTarget(qw, qh, this.format);
      this.qb = colorTarget(qw, qh, this.format);
      this.qc = colorTarget(qw, qh, this.format);
      this.qd = colorTarget(qw, qh, this.format);
      this.blur.uniforms.uTexel!.value.set(1 / qw, 1 / qh);
      this.down.uniforms.uTexel!.value.set(0.25 / qw, 0.25 / qh);
      // The blur is sized in quarter texels of the still target, so it stays the same size on
      // screen at any moving scale; above a ratio of 1.5 one round is too small, so it runs twice.
      this.blurPasses = l.stillRatio >= 1.5 ? 2 : 1;
      this.revision++;
    }
    this.disposeMoving();
    if (!same(l.movingRatio, l.stillRatio)) {
      const [mw, mh] = deviceSize(l.width, l.height, l.movingRatio);
      this.moving = colorTarget(mw, mh, this.format, { samples, depth: true });
    }
    this.layout = { ...l };
    return true;
  }

  private disposeMoving(): void {
    if (this.moving && this.moving !== this.still) this.moving.dispose();
    this.moving = null;
  }

  /** The scene target for a moving frame, or for a still or idle one. */
  target(kind: 'moving' | 'still'): WebGLRenderTarget {
    const t = kind === 'moving' ? (this.moving ?? this.still) : this.still;
    if (!t) throw new Error('LeanFrame used before configure');
    return t;
  }

  /** The pixel ratio a frame of this kind draws at. */
  ratio(kind: 'moving' | 'still'): number {
    const l = this.layout;
    if (!l) return 1;
    return kind === 'moving' ? l.movingRatio : l.stillRatio;
  }

  /** Bloom on or off by preset (Low has none); its strength by the hour comes from `bloomFor`. */
  setBloom(on: boolean): void {
    this.bloom = on;
    this.setNight(this.night);
  }

  /** Bloom grows at night so windows and lanterns glow without washing out the day (look.ts). */
  setNight(night: number): void {
    this.night = night;
    const b = bloomFor(night);
    this.look.uLookBloomStrength.value = this.bloom ? b.strength : 0;
    this.look.uLookBloomThreshold.value = b.threshold;
    applyGrade(this.look, this.season, this.warmth, night);
  }

  /** The seasonal grade hook (look.ts). */
  setSeason(season: GradeSeason): void {
    this.season = season;
    applyGrade(this.look, this.season, this.warmth);
  }

  /** Dusk and dawn split toning, 0 to 1 (look.ts). */
  setWarmth(w: number): void {
    if (Math.abs(w - this.warmth) < 0.005) return;
    this.warmth = w;
    applyGrade(this.look, this.season, this.warmth);
  }

  /** Exposure before tone mapping, from the light (lighting.ts). */
  setExposure(e: number): void {
    this.look.uLookExposure.value = e;
  }

  /** Tilt-shift strength from the camera distance (look.ts `tiltFor`). */
  setViewDistance(distance: number): void {
    this.tilt = tiltFor(distance);
  }

  /** Whether this frame needs the tilt-shift blur chain. */
  get blurs(): boolean {
    return this.tilt > 0.02;
  }

  /** Whether this frame adds bloom. */
  get blooms(): boolean {
    return this.look.uLookBloomStrength.value > 0;
  }

  /** A horizontal then a vertical blur of `a` (through `b`), `rounds` times; the result is in `a`. */
  private blurInPlace(a: WebGLRenderTarget, b: WebGLRenderTarget, rounds: number): void {
    for (let i = 0; i < rounds; i++) {
      this.blur.uniforms.tSrc!.value = a.texture;
      this.blur.uniforms.uDir!.value.set(1, 0);
      this.pass(this.blur, b);
      this.blur.uniforms.tSrc!.value = b.texture;
      this.blur.uniforms.uDir!.value.set(0, 1);
      this.pass(this.blur, a);
    }
  }

  /**
   * The blur chains (each only when needed) and the final pass from `src`, the scene target this
   * frame drew into, to the canvas.
   */
  finish(src: WebGLRenderTarget): void {
    const f = this.final.uniforms;
    const blurs = this.blurs && this.qa !== null && this.qb !== null;
    const blooms = this.blooms && this.qc !== null && this.qd !== null;
    if (blurs) {
      this.down.uniforms.tSrc!.value = src.texture;
      this.pass(this.down, this.qa);
      this.blurInPlace(this.qa!, this.qb!, this.blurPasses);
      f.tBlur!.value = this.qa!.texture;
    }
    if (blooms) {
      this.brightPass.uniforms.tSrc!.value = src.texture;
      this.brightPass.uniforms.uSrcSize!.value.set(src.width, src.height);
      this.brightPass.uniforms.uThreshold!.value = this.look.uLookBloomThreshold.value;
      this.pass(this.brightPass, this.qc);
      // A halo wider than the tilt-shift's blur: always at least two rounds.
      this.blurInPlace(this.qc!, this.qd!, this.blurPasses + 1);
      f.tBloom!.value = this.qc!.texture;
    }
    f.tScene!.value = src.texture;
    f.uBlurOn!.value = blurs ? 1 : 0;
    f.uBloomOn!.value = blooms ? 1 : 0;
    f.uTilt!.value = this.tilt * TILT_MIX;
    this.pass(this.final, null);
  }

  dispose(): void {
    this.disposeMoving();
    this.still?.dispose();
    for (const t of [this.qa, this.qb, this.qc, this.qd]) t?.dispose();
    this.still = this.qa = this.qb = this.qc = this.qd = null;
    this.layout = null;
    this.down.dispose();
    this.brightPass.dispose();
    this.blur.dispose();
    this.final.dispose();
    this.fsMesh.geometry.dispose();
  }
}
