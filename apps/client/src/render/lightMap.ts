// V2.0: the light map's interface (docs/spec/17-presentation.md, Night as the signature; the wave's
// handshakes in docs/build/v2-wave-notes.md). One top-down texture of the valley's lamplight, sized
// by preset (2, 4, 6 and 8 texels a tile on Low to Ultra), that every lit lantern, lamp, window's
// spill, oven door, bonfire, festival light and shop front is drawn into as a soft additive disc,
// and that the ground, walls, trees and hedges, folk and carts, smoke and water read.
//
// How it flows:
// - Writers: any layer feeds discs under its own source name (`env.lightWriter.set('lanterns', ...)`).
//   `set` and `clear` return true when the discs changed; a static layer then reports the change as
//   a static-layer event (`ctx.invalidate()`, or `frame()` returning true), so the still-frame cache
//   redraws. A writer that is not a static layer calls `renderer.invalidateStatic()`.
// - The redraw: the renderer calls `drawLightMap` once a frame, after the layers' `frame()`, and it
//   redraws only when a writer changed something (the lamplighter's round, a window's hour step, a
//   festival), bumping `env.lightMapRevision`.
// - Readers bind `lightMapUniforms(env)` and include `LIGHT_MAP_GLSL`, then call `qLightMap(xz)`.
//
// V2.0 stub: `drawLightMap` draws no discs (it clears the target to black on a redraw), no shader
// reads it yet, and the ground's 32-light loop
// (`MAX_GROUND_LIGHTS`, layers/lights.ts) stays in charge. V2A owns this file from here.
import type { KitLampOptions } from '@qoti/art';
import { MAP_SIZE } from '@qoti/sim';
import {
  AddEquation,
  BufferGeometry,
  Color,
  CustomBlending,
  Float32BufferAttribute,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { Quality } from './quality';

/** Texels a tile by preset (`17-presentation.md`, Quality presets: Light map). */
export const LIGHT_MAP_TEXELS: Record<Quality, number> = { low: 2, medium: 4, high: 6, ultra: 8 };

/** The light map's side in texels for a preset: 384 to 1,536 on the 192-tile valley. */
export function lightMapSize(quality: Quality, tiles = MAP_SIZE): number {
  return tiles * LIGHT_MAP_TEXELS[quality];
}

/** One soft additive disc of light on the map. */
export interface LightDisc {
  /** World x and z of its middle (tiles). */
  x: number;
  z: number;
  /** Where it fades to nothing (tiles). */
  radius: number;
  /** Its color (sRGB hex). */
  color: number;
  /** Its strength at the middle (1 is a lit lantern's pool). */
  intensity: number;
}

const sameDiscs = (a: readonly LightDisc[], b: readonly LightDisc[]): boolean =>
  a.length === b.length &&
  a.every((d, i) => {
    const e = b[i]!;
    return (
      d.x === e.x &&
      d.z === e.z &&
      d.radius === e.radius &&
      d.color === e.color &&
      d.intensity === e.intensity
    );
  });

/** The writers' side: discs by source, and whether the map needs a redraw. */
export class LightMapWriter {
  private readonly sources = new Map<string, readonly LightDisc[]>();
  private changed = false;

  /** Replaces one source's discs. True when anything changed (the caller reports a static change). */
  set(source: string, discs: readonly LightDisc[]): boolean {
    const before = this.sources.get(source);
    if (before ? sameDiscs(before, discs) : discs.length === 0) return false;
    if (discs.length === 0) this.sources.delete(source);
    else this.sources.set(source, [...discs]);
    this.changed = true;
    return true;
  }

  /** Removes one source's discs. True when it had any. */
  clear(source: string): boolean {
    return this.set(source, []);
  }

  /** Every disc of every source (sources in the order they first wrote). */
  *discs(): IterableIterator<LightDisc> {
    for (const list of this.sources.values()) yield* list;
  }

  /** Discs of all sources together. */
  get count(): number {
    let n = 0;
    for (const list of this.sources.values()) n += list.length;
    return n;
  }

  /** A writer changed something since the last redraw. */
  get dirty(): boolean {
    return this.changed;
  }

  /** Asks for a redraw with no disc changed (a resized or lost target). */
  requestRedraw(): void {
    this.changed = true;
  }

  /** Clears the redraw request and says whether there was one (the redraw's own call). */
  takeDirty(): boolean {
    const was = this.changed;
    this.changed = false;
    return was;
  }
}

/** The map's render target for a preset: linear half floats, so pools add up past 1 without banding. */
export function createLightMapTarget(quality: Quality = 'medium'): WebGLRenderTarget {
  const size = lightMapSize(quality);
  const target = new WebGLRenderTarget(size, size, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
  target.texture.name = 'qoti.lightMap';
  return target;
}

/** The fields the light map adds to `WorldEnv` (env.ts). */
export interface LightMapEnv {
  lightMap: WebGLRenderTarget;
  lightMapRevision: number;
  lightWriter: LightMapWriter;
}

/**
 * Sizes the map for a preset (the renderer calls it on a quality change). The texture object stays
 * the same, so uniforms that hold it keep working. True when the size changed (the map then needs a
 * redraw, which this asks for).
 */
export function resizeLightMap(env: LightMapEnv, quality: Quality): boolean {
  const size = lightMapSize(quality);
  if (env.lightMap.width === size) return false;
  env.lightMap.setSize(size, size);
  // A resized target holds nothing: the next drawLightMap redraws it.
  env.lightWriter.requestRedraw();
  return true;
}

/**
 * Redraws the map when a writer changed it; the renderer calls this once a frame after the layers'
 * `frame()`. Returns true when it redrew (and bumps `env.lightMapRevision`).
 *
 * V2A: every disc of every source in one instanced draw of soft additive discs into a scratch
 * target, then one blur pass from it into the map (two draws a redraw, none on a frame with no
 * change; with no disc at all, a clear). The scratch target, the disc buffers and the programs are
 * made on the first redraw.
 */
export function drawLightMap(three: WebGLRenderer | null, env: LightMapEnv): boolean {
  if (!env.lightWriter.takeDirty()) return false;
  env.lightMapRevision++;
  if (!three) return true;
  let painter = painters.get(env);
  if (!painter) {
    painter = new LightMapPainter();
    painters.set(env, painter);
  }
  painter.paint(three, env);
  return true;
}

/** V2A: what the last redraw of an env's map did (tests, and the `?debug` log). */
export interface LightMapStats {
  /** Redraws so far. */
  redraws: number;
  /** Discs in the last one. */
  discs: number;
  /** Render calls in the last one: 2 (the discs, the blur), or 0 when it only cleared. */
  draws: number;
  /** CPU time the last one took to submit (ms). */
  ms: number;
}

const painters = new WeakMap<LightMapEnv, LightMapPainter>();

/** The last redraws' numbers for an env (zeros before the first). */
export function lightMapStats(env: LightMapEnv): LightMapStats {
  return painters.get(env)?.stats ?? { redraws: 0, discs: 0, draws: 0, ms: 0 };
}

/**
 * The pool's shape across a disc, t the distance from its middle over its radius: a soft pool,
 * (1 - t^2)^2, with a bright core under the lamp and a faint skirt, so light pools and fades and
 * never ends in a ring. V2X: most of the light within half the radius (the skirt 0.06, was 0.22),
 * so neighboring lamps make pools with darker ground between, not one even wash. 1 in the middle,
 * 0 at the edge.
 */
export function discFalloff(t: number): number {
  const t2 = t * t;
  if (t2 >= 1) return 0;
  const w = (1 - t2) * (1 - t2);
  return w * (0.06 + 0.94 / (1 + 18 * t2));
}

const DISC_VERTEX = /* glsl */ `
attribute vec4 iDisc;
attribute vec3 iColor;
uniform float uMapSize;
varying vec2 vLocal;
varying vec3 vColor;
void main() {
  vLocal = position.xy;
  vColor = iColor;
  vec2 xz = iDisc.xy + position.xy * iDisc.z;
  gl_Position = vec4(xz / uMapSize * 2.0 - 1.0, 0.0, 1.0);
}
`;

// The twin of discFalloff.
const DISC_FRAGMENT = /* glsl */ `
varying vec2 vLocal;
varying vec3 vColor;
void main() {
  float t2 = dot(vLocal, vLocal);
  if (t2 >= 1.0) discard;
  float w = (1.0 - t2) * (1.0 - t2);
  gl_FragColor = vec4(vColor * (w * (0.06 + 0.94 / (1.0 + 18.0 * t2))), 1.0);
}
`;

const BLUR_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// One pass: the middle and four bilinear taps 1.2 texels out on the diagonals (each the average of
// four texels), a soft kernel about five texels across that smooths the texel steps of small pools.
const BLUR_FRAGMENT = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 1.2;
  vec3 c = texture2D(uSrc, vUv).rgb * 0.2;
  c += texture2D(uSrc, vUv + vec2(o.x, o.y)).rgb * 0.2;
  c += texture2D(uSrc, vUv + vec2(-o.x, o.y)).rgb * 0.2;
  c += texture2D(uSrc, vUv + vec2(o.x, -o.y)).rgb * 0.2;
  c += texture2D(uSrc, vUv + vec2(-o.x, -o.y)).rgb * 0.2;
  gl_FragColor = vec4(c, 1.0);
}
`;

const black = new Color(0);
const saved = new Color();
const linear = new Color();
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
let loggedAt = -Infinity;

/** With ?debug, logs a redraw's time (at most every 5 s), for the PR's redraw numbers. */
function logRedraw(s: LightMapStats): void {
  if (!DEBUG || (s.redraws > 1 && performance.now() - loggedAt < 5000)) return;
  loggedAt = performance.now();
  console.info(`[qoti] light map: ${s.discs} discs, ${s.draws} draws, ${s.ms.toFixed(2)} ms`);
}

/** Draws one env's map: the disc buffers, the scratch target and the two programs. */
class LightMapPainter {
  readonly stats: LightMapStats = { redraws: 0, discs: 0, draws: 0, ms: 0 };
  private scratch: WebGLRenderTarget | null = null;
  private geometry: InstancedBufferGeometry | null = null;
  private capacity = 0;
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly discMaterial = new ShaderMaterial({
    vertexShader: DISC_VERTEX,
    fragmentShader: DISC_FRAGMENT,
    uniforms: { uMapSize: { value: MAP_SIZE } },
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    depthTest: false,
    depthWrite: false,
  });
  private readonly discs = new Mesh(new BufferGeometry(), this.discMaterial);
  private readonly discScene = new Scene().add(this.discs);
  private readonly blurMaterial = new ShaderMaterial({
    vertexShader: BLUR_VERTEX,
    fragmentShader: BLUR_FRAGMENT,
    uniforms: { uSrc: { value: null }, uTexel: { value: new Vector2() } },
    depthTest: false,
    depthWrite: false,
  });
  private readonly blurScene = new Scene().add(new Mesh(new PlaneGeometry(2, 2), this.blurMaterial));

  constructor() {
    this.discs.frustumCulled = false;
    for (const s of [this.discScene, this.blurScene]) s.matrixWorldAutoUpdate = false;
  }

  paint(three: WebGLRenderer, env: LightMapEnv): void {
    const t0 = performance.now();
    const map = env.lightMap;
    const count = env.lightWriter.count;
    const before = three.getRenderTarget();
    const autoClear = three.autoClear;
    three.getClearColor(saved);
    const alpha = three.getClearAlpha();
    three.autoClear = false;
    three.setClearColor(black, 0);
    let draws = 0;
    if (count === 0) {
      three.setRenderTarget(map);
      three.clear(true, false, false);
    } else {
      const scratch = this.target(map.width);
      this.fill(env, count);
      three.setRenderTarget(scratch);
      three.clear(true, false, false);
      three.render(this.discScene, this.camera);
      this.blurMaterial.uniforms.uSrc!.value = scratch.texture;
      (this.blurMaterial.uniforms.uTexel!.value as Vector2).set(1 / map.width, 1 / map.height);
      three.setRenderTarget(map);
      three.render(this.blurScene, this.camera);
      draws = 2;
    }
    three.setRenderTarget(before);
    three.setClearColor(saved, alpha);
    three.autoClear = autoClear;
    // With ?debug the time includes the GPU's (it waits for the draws to finish), for the log.
    if (DEBUG) three.getContext().finish();
    const s = this.stats;
    s.redraws++;
    s.discs = count;
    s.draws = draws;
    s.ms = performance.now() - t0;
    logRedraw(s);
  }

  /** The scratch target at the map's size (made on the first redraw with a disc). */
  private target(size: number): WebGLRenderTarget {
    if (!this.scratch) {
      this.scratch = new WebGLRenderTarget(size, size, {
        type: HalfFloatType,
        format: RGBAFormat,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        generateMipmaps: false,
      });
      this.scratch.texture.name = 'qoti.lightMapScratch';
    } else if (this.scratch.width !== size) this.scratch.setSize(size, size);
    return this.scratch;
  }

  /** Writes every disc into the instance buffers, growing them to the next power of two. */
  private fill(env: LightMapEnv, count: number): void {
    if (!this.geometry || count > this.capacity) {
      this.geometry?.dispose();
      this.capacity = Math.max(64, 2 ** Math.ceil(Math.log2(count)));
      const g = new InstancedBufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.setAttribute('iDisc', new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4));
      g.setAttribute('iColor', new InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3));
      this.geometry = g;
      this.discs.geometry = g;
    }
    const g = this.geometry;
    const disc = g.getAttribute('iDisc') as InstancedBufferAttribute;
    const color = g.getAttribute('iColor') as InstancedBufferAttribute;
    const da = disc.array as Float32Array;
    const ca = color.array as Float32Array;
    let i = 0;
    for (const d of env.lightWriter.discs()) {
      da[i * 4] = d.x;
      da[i * 4 + 1] = d.z;
      da[i * 4 + 2] = d.radius;
      // The map holds linear light: the sRGB hex to linear, times the disc's strength.
      linear.setHex(d.color);
      ca[i * 3] = linear.r * d.intensity;
      ca[i * 3 + 1] = linear.g * d.intensity;
      ca[i * 3 + 2] = linear.b * d.intensity;
      i++;
    }
    disc.addUpdateRange(0, i * 4);
    color.addUpdateRange(0, i * 3);
    disc.needsUpdate = true;
    color.needsUpdate = true;
    g.instanceCount = i;
  }

  dispose(): void {
    this.scratch?.dispose();
    this.geometry?.dispose();
    this.discMaterial.dispose();
    this.blurMaterial.dispose();
  }
}

/** Frees what the map's redraws made for an env (the renderer's dispose). */
export function disposeLightMap(env: LightMapEnv): void {
  painters.get(env)?.dispose();
  painters.delete(env);
  env.lightMap.dispose();
}

/**
 * V2A, debug only: `?debug&lights=loop` keeps the ground's 32-light loop (`MAX_GROUND_LIGHTS`) and
 * reads the map nowhere, the night before V2A, so V2X can measure both on one build
 * (`v2-perf.mjs`) before it retires the loop. Read once a page.
 */
export const LIGHT_LOOP: boolean = ((): boolean => {
  if (typeof location === 'undefined') return false;
  const q = new URLSearchParams(location.search);
  return q.has('debug') && q.get('lights') === 'loop';
})();

/**
 * V2A: the light map for a kit or resident material (`patchKitShader`'s and
 * `createResidentMaterial`'s `lamp`), or none with the loop switched on.
 */
export function kitLamp(env: LightMapEnv & { night: { value: number } }): KitLampOptions | undefined {
  if (LIGHT_LOOP) return undefined;
  return { glsl: LIGHT_MAP_GLSL, uniforms: { ...lightMapUniforms(env) }, night: env.night };
}

/**
 * V2A: the preset's night switches for readers, one set per env (`QualityPreset.lampWater` and
 * `QualityPreset.rooms`, set by `Renderer.setQuality`): 1 or 0.
 */
export interface LampQualityUniforms {
  /** Lamplight on the river (none on Low). */
  uLampWater: { value: number };
  /** Rooms behind lit windows (none on Low: the flat glow). */
  uRooms: { value: number };
}

const lampQualityByEnv = new WeakMap<LightMapEnv, LampQualityUniforms>();

/** The env's night switches (both on until the renderer applies a preset). */
export function lampQuality(env: LightMapEnv): LampQualityUniforms {
  let u = lampQualityByEnv.get(env);
  if (!u) {
    u = { uLampWater: { value: 1 }, uRooms: { value: 1 } };
    lampQualityByEnv.set(env, u);
  }
  return u;
}

/** What a reader binds: the map's texture and the world-to-map transform (uv = xz * xy + zw). */
export interface LightMapUniforms {
  uLightMap: { value: Texture };
  uLightMapXf: { value: Vector4 };
}

const uniformsByEnv = new WeakMap<LightMapEnv, LightMapUniforms>();

/** The light map's uniforms for an env (one set per env, shared by every reader). */
export function lightMapUniforms(env: LightMapEnv): LightMapUniforms {
  let u = uniformsByEnv.get(env);
  if (!u) {
    u = {
      uLightMap: { value: env.lightMap.texture },
      uLightMapXf: { value: new Vector4(1 / MAP_SIZE, 1 / MAP_SIZE, 0, 0) },
    };
    uniformsByEnv.set(env, u);
  }
  return u;
}

/**
 * V2X: `qLampAlbedo(albedo)`, the albedo lamplight lands on: pulled toward a warm grey of the same
 * brightness, so amber light on green grass, leaves and paths reads amber rather than olive or
 * yellow-green. Part of `LIGHT_MAP_GLSL`; on its own for a fragment shader that reads the map in
 * its vertex shader (the meadow carpet).
 */
export const LAMP_ALBEDO_GLSL = /* glsl */ `
vec3 qLampAlbedo(vec3 albedo) {
  float lum = dot(albedo, vec3(0.3, 0.55, 0.15));
  return mix(albedo, lum * vec3(1.15, 0.9, 0.7), 0.8);
}
`;

/**
 * GLSL for readers: the uniforms and `qLightMap(xz)`, the lamplight (linear RGB) at a world point.
 * Readers scale it by the night themselves (the map holds light whether or not it is dark).
 */
export const LIGHT_MAP_GLSL = /* glsl */ `
uniform sampler2D uLightMap;
uniform vec4 uLightMapXf;
vec3 qLightMap(vec2 xz) {
  return texture(uLightMap, xz * uLightMapXf.xy + uLightMapXf.zw).rgb;
}
// V2A: the shared strength curve. The lamplight a surface \`up\` tiles above the ground takes at a
// world point, with a smooth ceiling where pools crowd (l / sqrt(1 + 2.5 y^2), y its brightness:
// nearly linear for one lamp's pool, never brighter than about 0.63 however many overlap), so a
// dense street glows rather than floods; fading out between 1.5 and 4 tiles up. Readers still scale
// it by their own night (walls and the ground by night squared, so at dusk the pools are a hint).
vec3 qLamp(vec2 xz, float up) {
  vec3 l = qLightMap(xz);
  float y = dot(l, vec3(0.3, 0.55, 0.15));
  l *= inversesqrt(1.0 + 2.5 * y * y);
  return l * (1.0 - smoothstep(1.5, 4.0, up));
}
${LAMP_ALBEDO_GLSL}`;
