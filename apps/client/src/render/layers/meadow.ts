import { CHUNK_SIZE, CHUNKS_PER_SIDE, MAP_SIZE, Terrain } from '@qoti/sim';
import {
  BufferAttribute,
  DoubleSide,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from 'three';
import type { Mirror } from '../../state/mirror';
import { ChunkDirt } from '../chunkDirt';
import { hash2 } from '../coords';
import { createWorldEnv, MAX_GROUND_LIGHTS, NOISE_GLSL, type WorldEnv } from '../env';
import { GroundTextures } from '../ground';
import { GROUND_AO_GLSL, groundAoFor } from '../groundAo';
import { groundTexturesFor } from '../groundRead';
import { LIGHT_MAP_GLSL, lightMapUniforms } from '../lightMap';
import { SurfaceTiles, tileSurfaceY, WATER_Y } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * V2B the meadow carpet: soft grass blades over grass and meadow terrain round the view's focus,
 * within the preset's reach (`env.meadowCarpet`, none on Low). One instanced draw: the shared patch
 * is one tile's 50 blades (a triangle each) and each open tile is an instance, so the vertex shader
 * builds every blade from the painted ground's textures (color, lawn and meadow amounts, flags)
 * and the tile's corner heights. The blades take the ground's color and its low-frequency looks,
 * so the carpet and the painted ground read as one mass, and fade into the ground with distance.
 *
 * The CPU keeps one small instance array per chunk (16 x 16 tiles) and concatenates those near the
 * view into the instance buffer (a refill). A static layer: a refill is a static-layer event, and a
 * resting view stays on idle frames. It never casts shadows.
 */

/** Blades in a tile's patch: a jittered 7 x 7 grid and one more. */
export const BLADES_PER_TILE = 50;
/** Floats an instance holds: aTile (x, z, center height, spare) and aHeights (four corners). */
export const FLOATS_PER_TILE = 8;
/** The instance buffer holds the tiles within this many times the reach of the fill center. */
export const FILL_MARGIN = 1.25;
/** Past this camera distance from the focus the carpet is hidden (the zoom fade ends at 150). */
export const HIDE_DISTANCE = 150;
/** Frames the focus must hold still before the view counts as at rest. */
export const REST_FRAMES = 12;
/** Chunk rebuilds a frame. */
const CHUNKS_PER_FRAME = 2;

/** One tile's blades: 50 triangles, three vertices each, roots on a jittered grid over [0, 1)^2. */
export function bladePatchGeometry(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  const n = BLADES_PER_TILE * 3;
  const position = new Float32Array(n * 3);
  const blade = new Float32Array(n * 4);
  const corner = new Float32Array(n);
  for (let b = 0; b < BLADES_PER_TILE; b++) {
    let u: number;
    let v: number;
    if (b < 49) {
      const i = b % 7;
      const j = Math.floor(b / 7);
      u = (i + 0.12 + hash2(i, j, 301) * 0.76) / 7;
      v = (j + 0.12 + hash2(i, j, 302) * 0.76) / 7;
    } else {
      u = 0.1 + hash2(7, 7, 303) * 0.8;
      v = 0.1 + hash2(7, 7, 304) * 0.8;
    }
    const r1 = hash2(b, 3, 305);
    const r2 = hash2(b, 4, 306);
    for (let k = 0; k < 3; k++) {
      const o = b * 3 + k;
      blade.set([u, v, r1, r2], o * 4);
      corner[o] = k;
    }
  }
  g.setAttribute('position', new BufferAttribute(position, 3));
  // A normal attribute, though the vertex shader sets the ground's: without one three compiles the
  // material flat shaded and lights each blade by its own facet, which read as dark stipple.
  const normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) normal[i * 3 + 1] = 1;
  g.setAttribute('normal', new BufferAttribute(normal, 3));
  g.setAttribute('aBlade', new BufferAttribute(blade, 4));
  g.setAttribute('aCorner', new BufferAttribute(corner, 1));
  return g;
}

/** True when a tile carries the carpet: grass or meadow, no road, no water, nothing built on it. */
export function keepsTile(layers: Mirror['layers'], i: number): boolean {
  const t = layers.terrain[i]!;
  return (
    (t === Terrain.grass || t === Terrain.meadow) &&
    !layers.road[i] &&
    !layers.water[i] &&
    !layers.occupant[i]
  );
}

export interface MeadowChunk {
  /** FLOATS_PER_TILE floats a kept tile. */
  data: Float32Array;
  count: number;
}

const MAX_CHUNK_FLOATS = CHUNK_SIZE * CHUNK_SIZE * FLOATS_PER_TILE;

/** The instance data of a chunk's open tiles: tile, center height and the four corner heights. */
export function buildMeadowChunk(tiles: SurfaceTiles, mirror: Mirror, cx: number, cz: number): MeadowChunk {
  const L = mirror.layers;
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const out = new Float32Array(MAX_CHUNK_FLOATS);
  let n = 0;
  tiles.cache(x0 - 2, z0 - 2, x0 + CHUNK_SIZE + 1, z0 + CHUNK_SIZE + 1);
  for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
    for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
      if (!keepsTile(L, z * MAP_SIZE + x)) continue;
      const o = n * FLOATS_PER_TILE;
      out[o] = x;
      out[o + 1] = z;
      // The ground as the tile itself draws it (so a cliff's far side does not lift the blades).
      out[o + 2] = tileSurfaceY(tiles, x, z, x + 0.5, z + 0.5);
      // Which sides border a tile without carpet (a lot, a road, water): blades shrink toward them,
      // so the carpet's edge is soft, never a tile's square.
      let edges = 0;
      if (x === 0 || !keepsTile(L, z * MAP_SIZE + x - 1)) edges |= 1;
      if (x === MAP_SIZE - 1 || !keepsTile(L, z * MAP_SIZE + x + 1)) edges |= 2;
      if (z === 0 || !keepsTile(L, (z - 1) * MAP_SIZE + x)) edges |= 4;
      if (z === MAP_SIZE - 1 || !keepsTile(L, (z + 1) * MAP_SIZE + x)) edges |= 8;
      out[o + 3] = edges;
      out[o + 4] = tileSurfaceY(tiles, x, z, x, z);
      out[o + 5] = tileSurfaceY(tiles, x, z, x + 1, z);
      out[o + 6] = tileSurfaceY(tiles, x, z, x, z + 1);
      out[o + 7] = tileSurfaceY(tiles, x, z, x + 1, z + 1);
      n++;
    }
  }
  tiles.uncache();
  return { data: out.subarray(0, n * FLOATS_PER_TILE), count: n };
}

/** Concatenates the cached chunks' tiles within `radius` of (fx, fz) into `out` (grown by the caller). */
export function selectFill(
  chunks: ReadonlyMap<number, MeadowChunk>,
  fx: number,
  fz: number,
  radius: number,
  out: Float32Array,
): number {
  const r2 = radius * radius;
  const c0 = Math.max(0, Math.floor((fx - radius) / CHUNK_SIZE));
  const c1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((fx + radius) / CHUNK_SIZE));
  const d0 = Math.max(0, Math.floor((fz - radius) / CHUNK_SIZE));
  const d1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((fz + radius) / CHUNK_SIZE));
  let n = 0;
  for (let cz = d0; cz <= d1; cz++) {
    for (let cx = c0; cx <= c1; cx++) {
      const c = chunks.get(cz * CHUNKS_PER_SIDE + cx);
      if (!c) continue;
      const data = c.data;
      for (let t = 0; t < c.count; t++) {
        const o = t * FLOATS_PER_TILE;
        const dx = data[o]! + 0.5 - fx;
        const dz = data[o + 1]! + 0.5 - fz;
        if (dx * dx + dz * dz > r2) continue;
        if (n + FLOATS_PER_TILE > out.length) return -1;
        out.set(data.subarray(o, o + FLOATS_PER_TILE), n);
        n += FLOATS_PER_TILE;
      }
    }
  }
  return n / FLOATS_PER_TILE;
}

/** Whether a chunk's square comes within `radius` of a point (tiles). */
export function chunkNear(chunk: number, fx: number, fz: number, radius: number): boolean {
  const x0 = (chunk % CHUNKS_PER_SIDE) * CHUNK_SIZE;
  const z0 = Math.floor(chunk / CHUNKS_PER_SIDE) * CHUNK_SIZE;
  const dx = Math.max(x0 - fx, 0, fx - (x0 + CHUNK_SIZE));
  const dz = Math.max(z0 - fz, 0, fz - (z0 + CHUNK_SIZE));
  return dx * dx + dz * dz <= radius * radius;
}

/**
 * When the instance buffer is refilled round the focus. Moving (the focus changed within the last
 * REST_FRAMES frames): only when it has drifted more than a quarter of the reach from the fill's
 * center, so the margin (FILL_MARGIN - 1) always covers the drift. At rest: when it differs from
 * the center by more than a tile. Always when nothing is filled yet or the reach changed.
 */
export class FillRule {
  centerX = NaN;
  centerZ = NaN;
  reach = -1;
  private lastX = NaN;
  private lastZ = NaN;
  private idle = 0;

  /** Whether the last fill was a moving one, with the margin round the reach. */
  wide = false;

  /** True once the focus has held still for REST_FRAMES frames. */
  get resting(): boolean {
    return this.idle >= REST_FRAMES;
  }

  /** Call once a frame with the focus; true when a refill is due. */
  due(fx: number, fz: number, reach: number): boolean {
    if (Math.abs(fx - this.lastX) > 0.01 || Math.abs(fz - this.lastZ) > 0.01 || Number.isNaN(this.lastX)) {
      this.idle = 0;
      this.lastX = fx;
      this.lastZ = fz;
    } else this.idle++;
    if (reach <= 0) return false;
    if (reach !== this.reach || Number.isNaN(this.centerX)) return true;
    const d = Math.hypot(fx - this.centerX, fz - this.centerZ);
    // At rest the fill trims to the reach itself (the margin's ring is all faded blades).
    return this.idle < REST_FRAMES ? d > reach / 4 : d > 1 || this.wide;
  }

  filled(fx: number, fz: number, reach: number): void {
    this.centerX = fx;
    this.centerZ = fz;
    this.reach = reach;
    this.wide = !this.resting;
  }

  /** The radius a fill now takes: the reach at rest, with the moving margin otherwise. */
  radius(reach: number): number {
    return this.resting ? reach : reach * FILL_MARGIN;
  }

  /** Forgets the fill (the carpet was hidden): the next visible frame refills. */
  reset(): void {
    this.centerX = NaN;
    this.reach = -1;
  }
}

// ---------------------------------------------------------------------------------------------
// Shaders

const N = MAP_SIZE.toFixed(1);

const VERTEX_PARS = /* glsl */ `
attribute vec4 aBlade;
attribute float aCorner;
attribute vec4 aTile;
attribute vec4 aHeights;
uniform sampler2D uGroundColor;
uniform sampler2D uGroundData;
uniform sampler2D uGroundDetail;
uniform vec3 uFocus;
uniform float uReach;
uniform float uTime;
uniform float uNight;
uniform float uAutumn;
uniform float uBare;
uniform float uSnow;
uniform float uDry;
uniform float uStorm;
uniform vec4 uLights[${MAX_GROUND_LIGHTS}];
uniform int uLightCount;
varying vec3 vQColor;
varying vec3 vQGlow;
varying vec2 vQXZ;
${NOISE_GLSL}
${GROUND_AO_GLSL}
${LIGHT_MAP_GLSL}

// The ground between the tile's four corners: four triangles round its center (the drawn mesh's
// cells), as the height at (u, v) and the slope there.
float qTileHeight(vec2 uv, out vec2 grad) {
  float hc = aTile.z;
  vec2 d = uv - 0.5;
  float ha;
  float hb;
  if (abs(d.x) > abs(d.y)) {
    if (d.x > 0.0) { ha = aHeights.y; hb = aHeights.w; } else { ha = aHeights.x; hb = aHeights.z; }
    float mid = 0.5 * (ha + hb);
    float s = d.x > 0.0 ? 2.0 : -2.0;
    grad = vec2(s * (mid - hc), hb - ha);
    return hc + abs(d.x) * 2.0 * (mid - hc) + d.y * (hb - ha);
  }
  if (d.y > 0.0) { ha = aHeights.z; hb = aHeights.w; } else { ha = aHeights.x; hb = aHeights.y; }
  float mid = 0.5 * (ha + hb);
  float s = d.y > 0.0 ? 2.0 : -2.0;
  grad = vec2(hb - ha, s * (mid - hc));
  return hc + abs(d.y) * 2.0 * (mid - hc) + d.x * (hb - ha);
}

float qGlowSum(vec3 p) {
  float sum = 0.0;
  for (int i = 0; i < ${MAX_GROUND_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 l = uLights[i];
    vec3 d = p - l.xyz;
    float r2 = dot(d.xz, d.xz) + d.y * d.y * 2.0;
    sum += l.w * max(1.0 / (1.0 + r2 * 5.0) - 0.1, 0.0);
  }
  return sum;
}

// One blade (one triangle): its position, the ground's normal, color and night glow. A blade whose
// root is not open grass, or that has faded or been flattened away, collapses to a point.
void qBlade(out vec3 pos, out vec3 nrm, out vec3 col, out vec3 glow, out vec2 xz) {
  vec2 shift = vec2(qHash(aTile.xy * 1.31), qHash(aTile.yx * 0.77 + 3.7));
  vec2 uv = fract(aBlade.xy + shift);
  vec2 root = aTile.xy + uv;
  xz = root;
  vec2 grad;
  float gy = qTileHeight(uv, grad);
  // The foot sinks just enough to hide the four-triangle height's error on a slope (a short lawn
  // blade buried 0.03 deep lost half of itself).
  pos = vec3(root.x, gy - 0.008 - 0.05 * min(1.0, length(grad)), root.y);
  nrm = normalize(vec3(-grad.x, 1.0, -grad.y));
  col = vec3(0.0);
  glow = vec3(0.0);

  ivec2 ti = ivec2(aTile.xy);
  vec4 dat = texelFetch(uGroundData, ti, 0);
  float terr = floor(dat.g * 255.0 + 0.5);
  float road = floor(dat.r * 255.0 + 0.5);
  float flags = floor(dat.a * 255.0 + 0.5);
  bool blocked = terr > 1.5 || road > 0.5 || mod(flags, 2.0) >= 1.0 || mod(floor(flags / 4.0), 2.0) >= 1.0;
  if (blocked) return;

  vec2 mapUv = root / ${N};
  vec4 gd = textureLod(uGroundDetail, mapUv, 0.0);
  float mown = gd.r;
  float meadowK = gd.a;
  float r1 = fract(aBlade.z + qHash(aTile.xy * 2.3 + aBlade.xy * 5.0));
  float r2 = fract(aBlade.w + qHash(aTile.yx * 1.9 + 7.3));
  float h = mix(mix(0.13, 0.30, meadowK), 0.07, mown) * (0.7 + 0.6 * r1);
  // How long the blade grows (before any fade): long grass keeps a deep pile, short grass and
  // lawns a gentle texture with little contrast, so they never read as dark stipple.
  float longK = smoothstep(0.12, 0.26, h);
  // Soft edges toward tiles without carpet (aTile.w: 1 left, 2 right, 4 down, 8 up).
  float e = 1.0;
  float bits = aTile.w;
  if (mod(bits, 2.0) >= 1.0) e = min(e, uv.x);
  if (mod(floor(bits / 2.0), 2.0) >= 1.0) e = min(e, 1.0 - uv.x);
  if (mod(floor(bits / 4.0), 2.0) >= 1.0) e = min(e, uv.y);
  if (mod(floor(bits / 8.0), 2.0) >= 1.0) e = min(e, 1.0 - uv.y);
  h *= smoothstep(0.0, 0.5, e);
  float d = distance(root, uFocus.xz);
  h *= 1.0 - smoothstep(0.55 * uReach, uReach, d);
  h *= 1.0 - smoothstep(110.0, 150.0, distance(cameraPosition, uFocus));

  // Snow: the ground's cover estimate at the root (qGroundSeason), shrinking and whitening blades.
  float snowK = 0.0;
  float ao = qGroundAo(root);
  if (uSnow > 0.001) {
    float shelter = clamp((1.0 - ao) * 4.0, 0.0, 1.0);
    float n = qNoise(root * 0.7) * 0.65 + qNoise(root * 2.9 + 9.0) * 0.35;
    float cover = smoothstep(0.25, 0.65, n * 0.8 + uSnow * 0.75 + shelter * 0.35 * uSnow - 0.2);
    cover *= smoothstep(0.0, 0.08, gy - ${WATER_Y.toFixed(3)});
    cover *= 1.0 - 0.18 * smoothstep(0.58, 0.85, qNoise(root * 0.23 + 31.0)) * (1.0 - shelter);
    snowK = clamp(cover * uSnow, 0.0, 0.94);
    h *= 1.0 - 0.8 * snowK;
  }
  if (h < 0.01) return;

  // Comb: a slowly turning direction field, a little apart per blade.
  float ang = (qNoise(root * 0.11) * 2.0 + (r2 - 0.5) * 0.18) * 3.14159;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 perp = vec2(-dir.y, dir.x);
  float lean = mix(0.35, 0.65, qHash(root * 17.3)) * h;
  float width = mix(mix(0.065, 0.09, qHash(root * 9.1 + 2.0)), mix(0.05, 0.075, qHash(root * 9.1 + 2.0)), longK);
  width *= 1.0 - 0.2 * mown;

  // Sway on the clock that stops at rest: gusts travel across the meadow (as the foliage's grass).
  float wind = 1.0 + uStorm * 1.6;
  float phase = root.x * 0.37 + root.y * 0.61;
  float gust = 0.5 + 0.5 * sin(dot(root, vec2(0.17, 0.13)) - uTime * 1.6);
  float patchy = 0.5 + 0.5 * sin(dot(root, vec2(-0.045, 0.06)) + uTime * 0.31);
  float sa = (0.22 * sin(uTime * 1.7 + phase) + 0.78 * gust * (0.35 + 0.65 * patchy)) * 0.075 * wind;
  float sb = 0.02 * cos(uTime * 2.3 + phase * 1.7) * wind;
  float reach = h / 0.30;
  vec2 tip = dir * (lean + sa * reach) + perp * sb * reach;
  if (aCorner < 0.5) pos.xz -= perp * (0.5 * width);
  else if (aCorner < 1.5) pos.xz += perp * (0.5 * width);
  else pos += vec3(tip.x, h, tip.y);

  // Color: the ground's at the root, with its low-frequency looks repeated (ground.ts qGround).
  vec4 gc = textureLod(uGroundColor, mapUv, 0.0);
  vec3 c = gc.rgb;
  float m1 = qFbm(root * 0.42);
  float m2 = qNoise(root * 1.3 + 3.0);
  c *= 0.9 + 0.17 * m1;
  c = mix(c, c * vec3(1.06, 1.04, 0.86), smoothstep(0.55, 0.9, m2) * 0.3);
  c = mix(c, c * (1.02 - 0.06 * m1) * vec3(0.98, 1.02, 0.96), mown * 0.6);
  float comb = qNoise(vec2(root.x * 3.0 + root.y * 7.5, root.y * 2.0 - root.x * 1.2));
  c = mix(c, c * vec3(1.1, 1.07, 0.82), meadowK * smoothstep(0.45, 0.85, comb) * 0.55);
  c *= 1.0 - meadowK * 0.06 * (1.0 - comb);
  c = mix(c, c * vec3(0.8, 0.9, 0.7), meadowK * (1.0 - smoothstep(0.2, 0.5, comb)) * 0.35);
  float grow = (1.0 - uAutumn) * (1.0 - uBare);
  float v1 = qNoise(root * 0.55 + 17.0);
  float v2 = qNoise(root * 1.7 + 5.0);
  c = mix(c, c * mix(vec3(0.93, 1.05, 0.89), vec3(1.08, 1.03, 0.8), v1), meadowK * grow * 0.55);
  c = mix(c, c * vec3(1.04, 1.0, 1.08), meadowK * grow * smoothstep(0.7, 0.9, v2) * 0.25);
  vec3 gold = mix(vec3(1.22, 0.96, 0.54), vec3(1.06, 0.78, 0.48), v2);
  c = mix(c, c * gold, uAutumn * (0.22 + 0.45 * meadowK) * (0.7 + 0.3 * v1));
  // The soil showing through (ground.ts qGround): thin ground goes straw-pale in patches, rich
  // ground a touch deeper with its clover.
  float soil = gd.b * 2.0 - 1.0;
  float thinSoil = clamp(-soil * 1.6 - 0.35, 0.0, 1.0);
  float richSoil = clamp(soil * 1.6 - 0.35, 0.0, 1.0);
  float soilPatch = smoothstep(0.55, 0.85, qNoise(root * 1.9 + 21.0));
  c = mix(c, c * vec3(1.12, 0.98, 0.78), thinSoil * soilPatch * 0.3);
  c = mix(c, c * vec3(0.8, 0.93, 0.76), richSoil * 0.04);
  if (uDry > 0.001) {
    float dryPatch = 0.6 + 0.4 * qNoise(root * 0.6 + 4.0);
    c = mix(c, c * vec3(1.12, 1.0, 0.68), uDry * 0.55 * dryPatch);
  }
  c *= ao * mix(1.0, 0.97, 1.0 - ao) + (1.0 - ao) * vec3(0.0, 0.004, 0.012);

  // The blade's own gradient: feet deep in the pile, the tip lighter and a touch warmer.
  // Long grass keeps a deep pile; short grass and a mown lawn even out to the painted ground's
  // own value (a blade's area leans to its foot, so foot and tip average a touch under 1).
  float lawn = max(mown, 0.0);
  vec3 foot = c * mix(mix(0.82, 0.74, longK), 0.8, lawn);
  vec3 top = c * mix(mix(1.15 + 0.06 * r2, 1.2 + 0.1 * r2, longK), 1.12 + 0.06 * r2, lawn) * vec3(1.03, 1.01, 0.95);
  // Wildflowers: a share of tips take the ground's flower colors where it has them.
  float bloom = gc.a;
  // A flowering tip colors its whole blade down to the foot, a spike of color above the pile.
  if (bloom > 0.01 && qHash(root * 91.7) < 0.45 * bloom) {
    float pick = qHash(root * 53.1);
    vec3 fc = pick < 0.3 ? qSrgb(vec3(0.95, 0.62, 0.70)) : pick < 0.55 ? qSrgb(vec3(0.97, 0.86, 0.38))
      : pick < 0.8 ? qSrgb(vec3(0.68, 0.60, 0.90)) : qSrgb(vec3(0.98, 0.97, 0.92));
    top = mix(top, fc, 1.0 - 0.65 * uNight);
  }
  if (snowK > 0.0) {
    vec3 white = qSrgb(vec3(0.95, 0.94, 0.91));
    foot = mix(foot, white * 0.9, snowK);
    top = mix(top, white, min(1.0, snowK * 1.1));
  }
  col = aCorner > 1.5 ? top : foot;

  // Night: the ground's lantern pools at the root (V2X drops this loop once V2A moves the ground
  // to the light map) and the light map's lamplight.
  if (uNight > 0.01) {
    float sum = qGlowSum(pos);
    glow = qSrgb(vec3(1.0, 0.7, 0.4)) * min(sum, 1.2) * uNight * uNight + qLightMap(root) * uNight;
  }
}
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uTime;
uniform float uClouds;
varying vec3 vQColor;
varying vec3 vQGlow;
varying vec2 vQXZ;
${NOISE_GLSL}
float qCloudShade(vec2 wp) {
  vec2 p = wp * 0.028 + vec2(uTime * 0.006, uTime * 0.0035);
  float c = smoothstep(0.5, 0.72, qFbm(p));
  return 1.0 - c * 0.2 * uClouds;
}
`;

/** The carpet's material: standard and matte like the ground, the blade built in the vertex shader. */
export function createMeadowMaterial(
  env: WorldEnv,
  tex: GroundTextures,
  reach: { value: number },
): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uGroundColor: { value: tex.color },
      uGroundData: { value: tex.data },
      uGroundDetail: { value: tex.detail },
      uGroundAo: groundAoFor(env),
      uFocus: { value: env.focus },
      uReach: reach,
      uTime: env.staticTime,
      uNight: env.night,
      uAutumn: env.autumn,
      uBare: env.bare,
      uSnow: env.snow,
      uDry: env.dry,
      uClouds: env.clouds,
      uStorm: env.storm,
      uLights: env.lights,
      uLightCount: env.lightCount,
      ...lightMapUniforms(env),
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace(
        '#include <beginnormal_vertex>',
        [
          'vec3 qPos; vec3 qNrm; vec3 qCol; vec3 qGl; vec2 qXz;',
          'qBlade(qPos, qNrm, qCol, qGl, qXz);',
          'vQColor = qCol; vQGlow = qGl; vQXZ = qXz;',
          '#include <beginnormal_vertex>',
          'objectNormal = qNrm;',
        ].join('\n'),
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = qPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace(
        '#include <normal_fragment_begin>',
        // Both faces shade with the ground's normal: undo the double-sided flip.
        '#include <normal_fragment_begin>\nnormal = normalize(vNormal);',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = vQColor * qCloudShade(vQXZ);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vQGlow * 1.3;',
      );
  };
  m.customProgramCacheKey = () => 'qoti-meadow';
  return m;
}

/**
 * A standalone patch of carpet over the flat tiles [x0, x0 + w) x [z0, z0 + d), its blades fading
 * toward the patch's edge, centered in the reach (`env.focus` is set to its middle). For the gallery's
 * seasons view, which has no valley: `tex` comes from a stub map there.
 */
export function meadowPatchMesh(
  env: WorldEnv,
  tex: GroundTextures,
  x0: number,
  z0: number,
  w: number,
  d: number,
): Mesh {
  const g = bladePatchGeometry();
  const data = new Float32Array(w * d * FLOATS_PER_TILE);
  let n = 0;
  for (let z = z0; z < z0 + d; z++)
    for (let x = x0; x < x0 + w; x++) {
      const o = n++ * FLOATS_PER_TILE;
      data[o] = x;
      data[o + 1] = z;
      data[o + 3] =
        (x === x0 ? 1 : 0) | (x === x0 + w - 1 ? 2 : 0) | (z === z0 ? 4 : 0) | (z === z0 + d - 1 ? 8 : 0);
    }
  const buffer = new InstancedInterleavedBuffer(data, FLOATS_PER_TILE, 1);
  g.setAttribute('aTile', new InterleavedBufferAttribute(buffer, 4, 0));
  g.setAttribute('aHeights', new InterleavedBufferAttribute(buffer, 4, 4));
  g.instanceCount = n;
  env.focus.set(x0 + w / 2, 0, z0 + d / 2);
  const mesh = new Mesh(g, createMeadowMaterial(env, tex, { value: Math.max(w, d) * 4 }));
  mesh.frustumCulled = false;
  return mesh;
}

let stub: GroundTextures | null = null;
/**
 * The painted ground's textures for a stub valley with meadow round [x0, x0 + w) x [z0, z0 + d)
 * (six tiles out), plain grass elsewhere and nothing built, so a patch takes the colors and flower
 * drifts a real meadow would. For the gallery; built once.
 */
export function stubMeadowGround(x0: number, z0: number, w: number, d: number): GroundTextures {
  if (stub) return stub;
  const n = MAP_SIZE * MAP_SIZE;
  const terrain = new Uint8Array(n).fill(Terrain.grass);
  for (let z = Math.max(0, z0 - 6); z < Math.min(MAP_SIZE, z0 + d + 6); z++)
    for (let x = Math.max(0, x0 - 6); x < Math.min(MAP_SIZE, x0 + w + 6); x++)
      terrain[z * MAP_SIZE + x] = Terrain.meadow;
  const zeros = (): Uint8Array => new Uint8Array(n);
  const mirror = {
    layers: {
      terrain,
      water: zeros(),
      road: zeros(),
      tree: zeros(),
      height: zeros(),
      occupant: new Int32Array(n),
      fertility: new Uint8Array(n).fill(55),
      crop: zeros(),
      wear: zeros(),
    },
    decor: new Map(),
    buildings: new Map(),
  } as unknown as Mirror;
  stub = new GroundTextures(mirror);
  return stub;
}

// ---------------------------------------------------------------------------------------------

const debugOn = (): boolean => typeof location !== 'undefined' && location.search.includes('debug');

export function meadowLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let env: WorldEnv | null = null;
  let tiles: SurfaceTiles | null = null;
  let mesh: Mesh | null = null;
  let geometry: InstancedBufferGeometry | null = null;
  let material: MeshStandardMaterial | null = null;
  let buffer: InstancedInterleavedBuffer | null = null;
  let capacity = 0;
  let shown = true;
  let refill = false;
  /** A chunk in the filled area was rebuilt; refill when the streaming round the focus is done. */
  let pending = false;
  let worst = 0;
  const chunks = new Map<number, MeadowChunk>();
  const dirt = new ChunkDirt();
  const rule = new FillRule();
  /** The carpet's reach as the shader reads it (`uReach`). */
  const reachU = { value: 0 };

  function build(tex: GroundTextures): void {
    if (!ctx || !env) return;
    geometry = bladePatchGeometry();
    ensureCapacity(256);
    material = createMeadowMaterial(env, tex, reachU);
    mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    // V2A: set `shadowless: true` on this layer once `RenderLayer.shadowless` lands.
    mesh.castShadow = false;
    // The renderer sets every solid static mesh casting when the shadow map renders
    // (`updateShadowFlags`) unless it opts out: blades shadowing the ground under them read as
    // dark stipple, and would put the whole carpet into every shadow pass.
    mesh.userData.qotiShadows = false;
    mesh.receiveShadow = true;
    mesh.name = 'meadow';
    ctx.scene.add(mesh);
  }

  function ensureCapacity(count: number): void {
    if (!geometry || count <= capacity) return;
    let cap = Math.max(256, capacity);
    while (cap < count) cap *= 2;
    buffer = new InstancedInterleavedBuffer(new Float32Array(cap * FLOATS_PER_TILE), FLOATS_PER_TILE, 1);
    buffer.setUsage(35048); // DynamicDrawUsage
    geometry.setAttribute('aTile', new InterleavedBufferAttribute(buffer, 4, 0));
    geometry.setAttribute('aHeights', new InterleavedBufferAttribute(buffer, 4, 4));
    capacity = cap;
    // Three fixes the draw's instance limit from the first instanced attribute it binds and keeps it;
    // clearing it lets the new, larger buffer set it again.
    (geometry as { _maxInstanceCount?: number })._maxInstanceCount = undefined;
  }

  function doFill(fx: number, fz: number, reach: number): void {
    if (!geometry) return;
    const F = rule.radius(reach);
    let n = buffer ? selectFill(chunks, fx, fz, F, buffer.array as Float32Array) : -1;
    if (n < 0) {
      // Count first, then grow to the next power of two.
      const probe = new Float32Array(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE * MAX_CHUNK_FLOATS);
      const total = selectFill(chunks, fx, fz, F, probe);
      ensureCapacity(total);
      n = selectFill(chunks, fx, fz, F, buffer!.array as Float32Array);
    }
    if (buffer) {
      buffer.clearUpdateRanges();
      buffer.addUpdateRange(0, Math.max(1, n * FLOATS_PER_TILE));
      buffer.needsUpdate = true;
    }
    geometry.instanceCount = n;
    rule.filled(fx, fz, reach);
  }

  function rebuild(i: number): void {
    if (!ctx || !tiles) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    chunks.set(i, buildMeadowChunk(tiles, ctx.mirror, i % CHUNKS_PER_SIDE, Math.floor(i / CHUNKS_PER_SIDE)));
    if (typeof performance !== 'undefined') {
      const ms = performance.now() - t0;
      if (ms > worst && debugOn()) console.info(`[v2b] meadow chunk ${ms.toFixed(2)} ms`);
      worst = Math.max(worst, ms);
    }
  }

  return {
    id: 'meadow',
    motion: 'static',
    init(c) {
      ctx = c;
      env = c.env ?? createWorldEnv(new PerspectiveCamera());
      tiles = new SurfaceTiles(c.mirror);
      dirt.markAll();
    },
    update(change) {
      if (change.full) dirt.markAll();
      for (const layer of ['terrain', 'road', 'water', 'occupant', 'height'] as const)
        for (const rect of change.rects.get(layer) ?? []) dirt.markRect(rect, 1);
    },
    frame() {
      if (!ctx || !env || !tiles) return false;
      const reach = env.meadowCarpet;
      const f = env.focus;
      let changed = false;
      const far = env.camera.position.distanceTo(f) > HIDE_DISTANCE;
      const want = reach > 0 && !far;
      if (!want) {
        if (mesh && shown) {
          mesh.visible = false;
          shown = false;
          rule.reset();
          changed = true;
        }
        rule.due(f.x, f.z, 0);
        return changed;
      }
      if (!mesh) {
        const tex = groundTexturesFor(env).value;
        if (!tex) return false;
        build(tex);
        refill = true;
      }
      if (mesh && !shown) {
        mesh.visible = true;
        shown = true;
        refill = true;
        changed = true;
      }
      // Rebuild the dirty chunks round the focus (a chunk comes within the fill's reach).
      const F = reach * FILL_MARGIN;
      const taken = dirt.take(CHUNKS_PER_FRAME, { x: f.x, z: f.z }, F + CHUNK_SIZE * 0.75);
      for (const i of taken) {
        rebuild(i);
        if (chunkNear(i, rule.centerX, rule.centerZ, F) || Number.isNaN(rule.centerX)) pending = true;
      }
      // Refill once the chunks round the focus are all built, not after each one: every refill is a
      // static change (a new still frame and, until V2A's shadowless change, a shadow render).
      if (pending && taken.length < CHUNKS_PER_FRAME) {
        pending = false;
        refill = true;
      }
      if (rule.due(f.x, f.z, reach)) refill = true;
      if (refill) {
        doFill(f.x, f.z, reach);
        reachU.value = reach;
        refill = false;
        changed = true;
      }
      return changed;
    },
    dispose() {
      if (mesh) ctx?.scene.remove(mesh);
      geometry?.dispose();
      material?.dispose();
      mesh = null;
    },
  };
}
