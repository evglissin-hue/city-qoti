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
// V2.0 stub: `drawLightMap` draws nothing (the target is never rendered into or bound, so it takes
// no GPU memory and reads as black), no shader reads it yet, and the ground's 32-light loop
// (`MAX_GROUND_LIGHTS`, layers/lights.ts) stays in charge. V2A owns this file from here.
import { MAP_SIZE } from '@qoti/sim';
import {
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
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
 * `frame()`. Returns true when it redrew. V2.0 stub: draws nothing (the map stays black and
 * unallocated) and only bumps the revision.
 */
export function drawLightMap(three: WebGLRenderer | null, env: LightMapEnv): boolean {
  if (!env.lightWriter.takeDirty()) return false;
  void three;
  env.lightMapRevision++;
  return true;
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
 * GLSL for readers: the uniforms and `qLightMap(xz)`, the lamplight (linear RGB) at a world point.
 * Readers scale it by the night themselves (the map holds light whether or not it is dark).
 */
export const LIGHT_MAP_GLSL = /* glsl */ `
uniform sampler2D uLightMap;
uniform vec4 uLightMapXf;
vec3 qLightMap(vec2 xz) {
  return texture(uLightMap, xz * uLightMapXf.xy + uLightMapXf.zw).rgb;
}
`;
