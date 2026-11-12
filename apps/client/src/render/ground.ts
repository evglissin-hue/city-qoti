import { palette, palette2, SURFACE, SURFACES } from '@qoti/art';
import { content } from '@qoti/content';
import { entranceTiles, MAP_SIZE, Terrain, type Rect } from '@qoti/sim';
import {
  DataTexture,
  LinearFilter,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import type { Mirror } from '../state/mirror';
import { fpToWorld, hash2 } from './coords';
import { MAX_GROUND_LIGHTS, NOISE_GLSL, type WorldEnv } from './env';
import { LIGHT_LOOP, LIGHT_MAP_GLSL, lightMapUniforms } from './lightMap';
import { drawDef } from './defs';
import { flowerDrift } from './drifts';
import { GROUND_AO_GLSL, groundAoFor } from './groundAo';
import { DOOR_KIND, ROAD_GLSL } from './layers/roads';
import { WATER_Y } from './surface';

/**
 * C3D-1: the painted ground. Two small textures cover the map, one texel per tile:
 * - color (filtered, so tile colors blend softly across edges): the base tint per tile with seeded
 *   variation, canopy shade under trees and sandy banks; alpha is wildflower density.
 * - data (exact): road kind (or a door, see DOOR_KIND), terrain, crop growth (wear off fields, C4E)
 *   and flags, for roads, doorsteps, field furrows, crops and desire paths.
 * - detail (filtered, V1C): R mown grass (lawns within a few tiles of buildings), G worn earth (under
 *   benches and seats, in front of doors), B soil fertility (0 thin to 255 rich), A meadow (long
 *   grass in patches away from homes).
 * The ground shader adds the detail on top: mottling, meadow and lawn, flowers, worn earth, the
 * soil showing through, furrows, roads with ruts, wet banks, the ground AO texture (groundAo.ts),
 * drifting cloud shade, lantern glow pools at night and mist at the valley's rim.
 */

export const GroundFlag = { water: 1, rowsAlongX: 2, built: 4, tree: 8 } as const;

const N = MAP_SIZE;
/** Tiles from a building within which lawns are mown. */
export const MOWN = 4;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

type RGB = [number, number, number];
const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// V1C: the Painted Miniature ground (palette2): a softer, less saturated grass.
const GRASS = rgb(0x90b063);
const GRASS_WARM = rgb(0xa9bb66);
const GRASS_LUSH = rgb(0x789d55);
/** Playtest round six: thin soil reads dry and straw-pale, rich soil deep and lush. */
const GRASS_DRY = rgb(0xb5b672);
const GRASS_RICH = rgb(0x5f8a43);
const MEADOW = rgb(palette2.meadow);
const FOREST = rgb(palette2.forestFloor);
const CANOPY = rgb(0x4f6a3c);
const SAND = rgb(palette.sand);
const ROCK = rgb(palette.rock);
const MOUNTAIN = rgb(palette.mountain);
const BED = rgb(0x8f8a62);
const FIELD = rgb(0x8a6a48);

/** Smooth value noise over the tile grid, for patches several tiles wide. */
export function patch(x: number, z: number, scale: number, salt: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const ux = fx - ix;
  const uz = fz - iz;
  const sx = ux * ux * (3 - 2 * ux);
  const sz = uz * uz * (3 - 2 * uz);
  const a = hash2(ix, iz, salt);
  const b = hash2(ix + 1, iz, salt);
  const c = hash2(ix, iz + 1, salt);
  const d = hash2(ix + 1, iz + 1, salt);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** P1: tiles from (x, z) to the nearest building within MOWN tiles (99 when there is none). */
export function homeDistance(occupant: ArrayLike<number>, x: number, z: number): number {
  let home = 99;
  for (let dz = -MOWN; dz <= MOWN; dz++) {
    const nz = z + dz;
    if (nz < 0 || nz >= N) continue;
    for (let dx = -MOWN; dx <= MOWN; dx++) {
      const nx = x + dx;
      if (nx < 0 || nx >= N || !occupant[nz * N + nx]) continue;
      home = Math.min(home, dx * dx + dz * dz);
    }
  }
  return Math.sqrt(home);
}

/** P1: how mown a tile's lawn is (1 beside a building, 0 beyond MOWN tiles), from its distance to one. */
export function mownAmount(homeDist: number): number {
  return homeDist > MOWN ? 0 : 1 - smoothstep(1.5, MOWN, homeDist);
}

/**
 * P1: how much long meadow grass a tile has (0 to 1): all of meadow terrain, patches of plain grass
 * away from homes, none on the mown lawn. The painted ground and the 3D tufts both read it, so the
 * tall grass stands where the ground says it grows.
 */
export function meadowAmount(terrain: number, x: number, z: number, mown: number): number {
  let meadow = terrain === Terrain.meadow ? 1 : 0;
  if (terrain === Terrain.grass) meadow = smoothstep(0.52, 0.72, patch(x, z, 13, 71)) * 0.85;
  return meadow * (1 - mown);
}

/** The two ground textures, kept in step with the Mirror. */
export class GroundTextures {
  readonly color: DataTexture;
  readonly data: DataTexture;
  /** V1C: mown, worn, soil and meadow (see the header). */
  readonly detail: DataTexture;
  private readonly colorBytes = new Uint8Array(N * N * 4);
  private readonly dataBytes = new Uint8Array(N * N * 4);
  private readonly detailBytes = new Uint8Array(N * N * 4);
  /** Tiles worn by seats (decor tagged seat or bench): index to wear, 0 to 1. */
  private seats = new Map<number, number>();

  constructor(private readonly mirror: Mirror) {
    this.color = new DataTexture(this.colorBytes, N, N, RGBAFormat, UnsignedByteType);
    this.color.colorSpace = SRGBColorSpace;
    this.color.magFilter = LinearFilter;
    this.color.minFilter = LinearFilter;
    this.color.generateMipmaps = false;
    this.data = new DataTexture(this.dataBytes, N, N, RGBAFormat, UnsignedByteType);
    this.data.magFilter = NearestFilter;
    this.data.minFilter = NearestFilter;
    this.data.generateMipmaps = false;
    this.detail = new DataTexture(this.detailBytes, N, N, RGBAFormat, UnsignedByteType);
    this.detail.magFilter = LinearFilter;
    this.detail.minFilter = LinearFilter;
    this.detail.generateMipmaps = false;
    this.seats = this.readSeats();
    this.refresh([0, 0, N - 1, N - 1]);
  }

  /** Where seats wear the grass: each seat's tile, a little on its neighbors. */
  private readSeats(): Map<number, number> {
    const out = new Map<number, number>();
    for (const d of this.mirror.decor.values()) {
      const def = content.decorById.get(d.def);
      if (!def || !(def.tags.includes('seat') || def.tags.includes('bench'))) continue;
      const x = Math.floor(fpToWorld(d.fx));
      const z = Math.floor(fpToWorld(d.fz));
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const v = dx === 0 && dz === 0 ? 0.8 : dx === 0 || dz === 0 ? 0.2 : 0;
          if (v === 0) continue;
          const i = nz * N + nx;
          out.set(i, Math.max(out.get(i) ?? 0, v));
        }
    }
    return out;
  }

  /** Decor changed: repaints the tiles around seats that came, went or moved. */
  syncDecor(): void {
    const next = this.readSeats();
    const changed: number[] = [];
    for (const [i, v] of next) if (this.seats.get(i) !== v) changed.push(i);
    for (const [i] of this.seats) if (!next.has(i)) changed.push(i);
    this.seats = next;
    for (const i of changed) this.refresh([i % N, Math.floor(i / N), i % N, Math.floor(i / N)], 0);
  }

  /** Recomputes the tiles of a rect (inclusive) plus the neighbors whose tint depends on them. */
  refresh(rect: Rect, pad = 2): void {
    const x0 = Math.max(0, rect[0] - pad);
    const z0 = Math.max(0, rect[1] - pad);
    const x1 = Math.min(N - 1, rect[2] + pad);
    const z1 = Math.min(N - 1, rect[3] + pad);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.tile(x, z);
    this.color.needsUpdate = true;
    this.data.needsUpdate = true;
    this.detail.needsUpdate = true;
  }

  private tile(x: number, z: number): void {
    const m = this.mirror;
    const L = m.layers;
    const i = z * N + x;
    const terrain = L.terrain[i]!;
    const water = L.water[i]!;
    const road = L.road[i]!;
    let flags = 0;
    if (water) flags |= GroundFlag.water;
    if (L.occupant[i]) flags |= GroundFlag.built;
    if (L.tree[i]) flags |= GroundFlag.tree;

    // Neighborhood: trees for canopy shade, water for banks, fields for row direction, cliffs.
    const level = L.height[i]!;
    let cliff = false;
    let trees = 0;
    let wet = 0;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        const near = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
        if (near && L.tree[j]) trees += dx === 0 && dz === 0 ? 2 : 1;
        if (L.water[j]) wet = Math.max(wet, near ? 2 : 1);
        if (near && !L.water[j] && Math.abs(L.height[j]! - level) >= 2) cliff = true;
      }
    }
    // V1C: lawns are mown within a few tiles of a building; long grass grows farther out.
    const homeDist = homeDistance(L.occupant, x, z);

    const warm = patch(x, z, 9, 3);
    const lush = patch(x, z, 23, 5);
    const bloom = patch(x, z, 7, 9);
    let c: RGB;
    let flowers = 0;
    switch (terrain) {
      case Terrain.meadow:
        c = mix(MEADOW, GRASS_WARM, warm * 0.5);
        flowers = 0.45 + bloom * 0.55;
        break;
      case Terrain.forestFloor:
        // Darker, mossier under the trees.
        c = mix(FOREST, GRASS, 0.08 + warm * 0.16);
        break;
      case Terrain.sand:
        // The shader paints the strip at the waterline; tiles only lend a warm sandy hint.
        c = mix(SAND, GRASS_WARM, 0.55);
        break;
      case Terrain.rock:
        c = mix(ROCK, GRASS, 0.12 + lush * 0.15);
        break;
      case Terrain.mountain:
        c = mix(MOUNTAIN, ROCK, warm * 0.4);
        break;
      case Terrain.water:
        c = BED;
        break;
      case Terrain.field:
        c = FIELD;
        break;
      default:
        c = mix(GRASS, GRASS_WARM, Math.max(0, warm - 0.35) * 0.8);
        c = mix(c, GRASS_LUSH, Math.max(0, lush - 0.55) * 0.5);
        flowers = Math.max(0, bloom - 0.62) * 1.6;
    }
    // V1C: lawns near homes are mown short and even; meadow patches (and meadow terrain) away
    // from them grow long, paler and flowery.
    const mown = mownAmount(homeDist);
    const meadow = meadowAmount(terrain, x, z, mown);
    if (terrain === Terrain.grass && meadow > 0) {
      c = mix(c, MEADOW, meadow * 0.45);
      flowers = Math.max(flowers, meadow * (0.35 + bloom * 0.5));
    }
    if (mown > 0 && (terrain === Terrain.grass || terrain === Terrain.meadow)) {
      c = mix(c, GRASS_LUSH, mown * 0.22);
      flowers *= 1 - mown * 0.8;
    }
    // Playtest round six: the soil shows in the grass, so rich and thin ground look different
    // before a plot or farm is chosen. Rich ground also flowers a little more. V1C makes it
    // plainer (the shader adds clover on rich soil and bare specks on thin).
    const fertility = L.fertility[i] ?? 50;
    if (terrain === Terrain.grass || terrain === Terrain.meadow || terrain === Terrain.forestFloor) {
      const soil = (fertility - 50) / 50;
      if (soil > 0) {
        c = mix(c, GRASS_RICH, soil * 0.7);
        flowers += soil * 0.25;
      } else c = mix(c, GRASS_DRY, -soil * 0.55);
    }
    if (!water && wet && terrain !== Terrain.sand && terrain !== Terrain.rock)
      c = mix(c, GRASS_WARM, wet === 2 ? 0.3 : 0.1);
    if (trees > 0 && !water) c = mix(c, CANOPY, Math.min(1, trees / 8) * 0.6);
    // Stony ground around rocky faces, so a cliff reads as an outcrop, not a crack.
    if (cliff && !water) c = mix(c, ROCK, 0.45);
    // A whisper of per-tile value jitter; the filter turns it into soft blotches, not a grid.
    const k = 0.975 + hash2(x, z, 21) * 0.05;
    if (L.occupant[i] || road) flowers = 0;

    const o = i * 4;
    this.colorBytes[o] = Math.min(255, c[0] * k);
    this.colorBytes[o + 1] = Math.min(255, c[1] * k);
    this.colorBytes[o + 2] = Math.min(255, c[2] * k);
    this.colorBytes[o + 3] = Math.round(Math.min(1, flowers * flowerDrift(x, z)) * 255);
    const built = L.occupant[i] !== 0;
    let worn = water || built ? 0 : (this.seats.get(i) ?? 0);
    if (!water && !built && !road) worn = Math.max(worn, this.doorFront(x, z));
    this.detailBytes[o] = Math.round(mown * 255);
    this.detailBytes[o + 1] = Math.round(worn * 255);
    this.detailBytes[o + 2] = Math.round(Math.max(0, Math.min(100, fertility)) * 2.55);
    this.detailBytes[o + 3] = Math.round(meadow * 255);

    if (terrain === Terrain.field) {
      // Rows run along the field's longer side, measured through this tile, so every tile of a
      // rectangular field agrees.
      const run = (dx: number, dz: number) => {
        let n = 0;
        for (let k = 1; k <= 12; k++) {
          const nx = x + dx * k;
          const nz = z + dz * k;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N || L.terrain[nz * N + nx] !== Terrain.field) break;
          n++;
        }
        return n;
      };
      if (run(1, 0) + run(-1, 0) >= run(0, 1) + run(0, -1)) flags |= GroundFlag.rowsAlongX;
    }
    this.dataBytes[o] = road || this.door(x, z, L.occupant[i]!);
    this.dataBytes[o + 1] = terrain;
    // C4E: the third channel is crop growth on fields and wear (desire paths) everywhere else.
    this.dataBytes[o + 2] = terrain === Terrain.field ? (L.crop?.[i] ?? 0) : (L.wear?.[i] ?? 0);
    this.dataBytes[o + 3] = flags;
  }

  /** Wear in front of a door that opens onto this tile (the doorstep fans out into the grass). */
  private doorFront(x: number, z: number): number {
    const L = this.mirror.layers;
    for (let r = 0; r < 4; r++) {
      // The way a door at rotation r faces (as ROAD_GLSL's door walks).
      const fx = r === 1 ? -1 : r === 3 ? 1 : 0;
      const fz = r === 0 ? 1 : r === 2 ? -1 : 0;
      const nx = x - fx;
      const nz = z - fz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      if (this.door(nx, nz, L.occupant[nz * N + nx]!) === DOOR_KIND + r) return 0.7;
    }
    return 0;
  }

  /** DOOR_KIND plus the building's rotation on the tile its door is in, else 0. */
  private door(x: number, z: number, occupant: number): number {
    if (!occupant) return 0;
    const b = this.mirror.buildings.get(occupant);
    const def = b && drawDef(b.def);
    if (!b || !def) return 0;
    const [ex, ez] = entranceTiles(def, b.x, b.z, b.rot).entrance;
    return ex === x && ez === z ? DOOR_KIND + b.rot : 0;
  }

  dispose(): void {
    this.color.dispose();
    this.data.dispose();
    this.detail.dispose();
  }
}

const GROUND_HELPERS = /* glsl */ `
float qGroundFetch(ivec2 t, int c) {
  vec4 d = texelFetch(uGroundData, clamp(t, ivec2(0), ivec2(${N - 1})), 0);
  return floor((c == 0 ? d.r : c == 1 ? d.g : c == 2 ? d.b : d.a) * 255.0 + 0.5);
}
bool qBit(float flags, float bit) { return mod(floor(flags / bit), 2.0) >= 1.0; }
`;

const GROUND_FRAGMENT = /* glsl */ `
vec3 qGroundSeason(vec3 col, vec2 wp, float road, float above, float ao, float grassy, float fade);
float qPat(float layer, vec2 uv, float strength) {
  return mix(1.0, texture(uPatterns, vec3(uv, layer)).r * 2.0, strength);
}
vec3 qFieldColor(vec2 wp, vec3 ground, float flags, float crop) {
  bool alongX = qBit(flags, 2.0);
  float across = alongX ? wp.y : wp.x;
  float along = alongX ? wp.x : wp.y;
  float row = fract(across * 4.0);
  float ridge = 1.0 - abs(row - 0.5) * 2.0;
  float g = crop / 255.0;
  vec3 soil = mix(qSrgb(vec3(0.33, 0.23, 0.15)), qSrgb(vec3(0.55, 0.40, 0.26)), smoothstep(0.1, 0.8, ridge));
  soil *= 0.92 + 0.12 * qNoise(wp * 6.0);
  // Plants sit on the ridges; shoots are dots that swell into full green rows, then turn gold.
  float plant = fract(along * 7.0 + floor(across * 4.0) * 0.5);
  float dotR = 0.12 + smoothstep(0.05, 0.55, g) * 0.5;
  float dots = 1.0 - smoothstep(dotR - 0.08, dotR, abs(plant - 0.5) * 2.0 * (1.0 - ridge * 0.3));
  float cover = smoothstep(0.05, 0.25, g) * smoothstep(0.15, 0.55, ridge) * mix(dots, 1.0, smoothstep(0.45, 0.7, g));
  vec3 green = qSrgb(vec3(0.42, 0.62, 0.24)) * (0.9 + 0.2 * qNoise(wp * 9.0));
  vec3 gold = qSrgb(vec3(0.88, 0.73, 0.36)) * (0.88 + 0.22 * qNoise(wp * 11.0 + 4.0));
  vec3 crops = mix(green, gold, smoothstep(0.68, 0.9, g));
  return mix(soil, crops, cover);
}

vec3 qGround(vec3 base) {
  vec2 wp = vQWorld.xz;
  if (vQSurf < 0.5) {
    // Cliff faces: rock striations and a mossy top edge from the vertex colors.
    float strata = qNoise(vec2((wp.x + wp.y) * 2.3, vQWorld.y * 7.0));
    return base * (0.82 + 0.3 * strata);
  }
  vec4 gc = texture2D(uGroundColor, wp / ${N.toFixed(1)});
  vec3 col = gc.rgb;
  ivec2 ti = ivec2(floor(wp));
  float terrain = qGroundFetch(ti, 1);
  float flags = qGroundFetch(ti, 3);

  // Painterly mottling: broad soft value changes, sunny warm patches and fine grass strokes.
  float m1 = qFbm(wp * 0.42);
  float m2 = qNoise(wp * 1.3 + 3.0);
  col *= 0.9 + 0.17 * m1;
  col = mix(col, col * vec3(1.06, 1.04, 0.86), smoothstep(0.55, 0.9, m2) * 0.3);
  float strokes = qNoise(vec2(wp.x * 11.0 + wp.y * 4.0, wp.y * 3.0 - wp.x * 1.5));
  col *= 0.95 + 0.08 * strokes;
  if (terrain > 3.5 && terrain < 5.5) {
    float rocky = qNoise(wp * 3.1);
    col *= 0.85 + 0.3 * rocky;
  }

  float fade = clamp(1.0 - length(fwidth(wp)) * 3.0, 0.0, 1.0);
  bool water = qBit(flags, 1.0);
  bool built = qBit(flags, 4.0);

  // V1C: lawn, meadow, soil and wear (the detail texture), and the pattern array's grass grain.
  vec4 gd = texture2D(uGroundDetail, wp / ${N.toFixed(1)});
  float mown = gd.r;
  float worn = gd.g;
  float soil = gd.b * 2.0 - 1.0;
  float meadowK = gd.a;
  bool grassy = terrain < 2.5;
  if (grassy) {
    col *= qPat(${SURFACE.grass.toFixed(1)}, wp / ${SURFACES[SURFACE.grass]!.scale.toFixed(1)}, ${SURFACES[SURFACE.grass]!.strength.toFixed(2)});
    // Mown lawn: even, a touch fresher, the mottling calmed.
    col = mix(col, col * (1.02 - 0.06 * m1) * vec3(0.98, 1.02, 0.96), mown * 0.6);
    // Meadow: long grass in combed, sunlit strokes with seed heads catching the light.
    float comb = qNoise(vec2(wp.x * 3.0 + wp.y * 7.5, wp.y * 2.0 - wp.x * 1.2));
    col = mix(col, col * vec3(1.1, 1.07, 0.82), meadowK * smoothstep(0.45, 0.85, comb) * 0.55);
    col *= 1.0 - meadowK * 0.06 * (1.0 - comb);
    // P1: depth under the strokes (the deep green between the tufts), so long grass reads as a
    // thick pile, and color that follows the year: fresh and varied while it grows, straw and gold
    // in autumn (a gentle wash on lawns too).
    col = mix(col, col * vec3(0.8, 0.9, 0.7), meadowK * (1.0 - smoothstep(0.2, 0.5, comb)) * 0.35);
    float grow = (1.0 - uAutumn) * (1.0 - uBare);
    float v1 = qNoise(wp * 0.55 + 17.0);
    float v2 = qNoise(wp * 1.7 + 5.0);
    col = mix(col, col * mix(vec3(0.93, 1.05, 0.89), vec3(1.08, 1.03, 0.8), v1), meadowK * grow * 0.55);
    col = mix(col, col * vec3(1.04, 1.0, 1.08), meadowK * grow * smoothstep(0.7, 0.9, v2) * 0.25);
    vec3 gold = mix(vec3(1.22, 0.96, 0.54), vec3(1.06, 0.78, 0.48), v2);
    col = mix(col, col * gold, uAutumn * (0.22 + 0.45 * meadowK) * (0.7 + 0.3 * v1));
    // Soil you can see: clover leaves on rich ground, a little bare earth on thin, both sparse and
    // small; the tile tint (above) carries most of it, so it reads from the default camera too.
    vec2 cell = floor(wp * 4.0);
    float speck = qHash(cell + 2.0);
    vec2 sc = fract(wp * 4.0) - 0.25 - 0.5 * vec2(qHash(cell + 5.1), qHash(cell + 8.3));
    float dotK = (1.0 - smoothstep(0.07, 0.16, length(sc))) * fade;
    float rich = clamp(soil * 1.6 - 0.35, 0.0, 1.0);
    float thin = clamp(-soil * 1.6 - 0.35, 0.0, 1.0);
    col = mix(col, col * vec3(0.8, 0.93, 0.76), step(1.0 - rich * 0.45, speck) * dotK * 0.8);
    vec3 bare = col * vec3(1.12, 0.98, 0.78);
    float patchy = smoothstep(0.55, 0.85, qNoise(wp * 1.9 + 21.0));
    col = mix(col, bare, thin * (step(1.0 - thin * 0.35, speck) * dotK * 0.7 + patchy * 0.3));
  }
  // Worn earth under benches and seats and in front of doors, ragged at the edge.
  if (worn > 0.02 && !built && !water) {
    float wv = smoothstep(0.3, 0.62, worn + (qNoise(wp * 4.3) - 0.5) * 0.28 + (qNoise(wp * 13.0) - 0.5) * 0.08);
    vec3 earth = qSrgb(vec3(0.70, 0.59, 0.42)) * (0.9 + 0.14 * qNoise(wp * 9.0));
    col = mix(col, earth, wv * 0.8);
  }

  // Wildflower speckles, five cells per tile; far away they melt into a soft tint.
  float flowers = gc.a;
  if (flowers > 0.01) {
    vec2 cell = floor(wp * 5.0);
    float h = qHash(cell);
    vec2 c = cell + 0.2 + 0.6 * vec2(qHash(cell + 7.1), qHash(cell + 3.7));
    float r = length(wp * 5.0 - c);
    float pick = qHash(cell + 1.3);
    vec3 fc = pick < 0.3 ? qSrgb(vec3(0.95, 0.62, 0.70)) : pick < 0.55 ? qSrgb(vec3(0.97, 0.86, 0.38))
      : pick < 0.8 ? qSrgb(vec3(0.68, 0.60, 0.90)) : qSrgb(vec3(0.98, 0.97, 0.92));
    float clump = smoothstep(0.35, 0.75, qNoise(wp * 0.9 + 11.0));
    float on = step(h, flowers * clump * 0.55) * (1.0 - smoothstep(0.13, 0.2, r)) * (1.0 - 0.65 * uNight);
    col = mix(col, fc, on * fade);
    col = mix(col, col * vec3(1.05, 1.0, 1.04), flowers * clump * 0.25 * (1.0 - fade));
  }
  // Leaf litter and twigs on the forest floor.
  if (terrain > 1.5 && terrain < 2.5) {
    float leaf = step(0.82, qHash(floor(wp * 7.0))) * fade;
    col = mix(col, qSrgb(vec3(0.55, 0.42, 0.24)), leaf * 0.35);
  }

  if (terrain > 6.5 && terrain < 7.5) {
    // Field: furrows and crops, with a grassy margin where the field ends.
    vec3 field = qFieldColor(wp, col, flags, qGroundFetch(ti, 2));
    vec2 f = fract(wp);
    float margin = 1.0;
    if (qGroundFetch(ti + ivec2(1, 0), 1) != 7.0) margin = min(margin, 1.0 - f.x);
    if (qGroundFetch(ti + ivec2(-1, 0), 1) != 7.0) margin = min(margin, f.x);
    if (qGroundFetch(ti + ivec2(0, 1), 1) != 7.0) margin = min(margin, 1.0 - f.y);
    if (qGroundFetch(ti + ivec2(0, -1), 1) != 7.0) margin = min(margin, f.y);
    float inField = smoothstep(0.04, 0.1, margin + (qNoise(wp * 9.0) - 0.5) * 0.06);
    col = mix(col, field, inField);
  }

  if (!water && !built) col = qTrailPaint(wp, col);
  // C5E: where a road or path is painted (the snow on it is trodden, the rain darkens it more).
  vec3 preRoad = col;
  if (!water) col = qRoadPaint(wp, col);
  float road = clamp(length(col - preRoad) * 6.0, 0.0, 1.0);

  // Banks: a sandy strip that follows the shore, damp sand at the waterline, the bed below it.
  float above = vQWorld.y - ${WATER_Y.toFixed(3)};
  float strip = 1.0 - smoothstep(0.1, 0.22, above + (qNoise(wp * 2.3) - 0.5) * 0.1);
  vec3 sandy = qSrgb(vec3(0.89, 0.82, 0.63)) * (0.94 + 0.1 * qNoise(wp * 5.0));
  // V1C: where the town reaches the water (its lawns) the bank is dressed stone, set in courses;
  // out in the country it stays earth and sand.
  float town = smoothstep(0.35, 0.8, mown);
  if (town > 0.01) {
    vec2 bu = wp * vec2(2.6, 2.6);
    float course = floor(bu.y);
    vec2 bc = vec2(floor(bu.x + mod(course, 2.0) * 0.5), course);
    vec2 bf = fract(vec2(bu.x + mod(course, 2.0) * 0.5, bu.y));
    float joint = smoothstep(0.0, 0.08, min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y)));
    vec3 stone = mix(qSrgb(vec3(0.66, 0.63, 0.57)), qSrgb(vec3(0.76, 0.72, 0.64)), qHash(bc));
    stone = mix(qSrgb(vec3(0.36, 0.34, 0.30)), stone, joint);
    sandy = mix(sandy, stone, town);
  }
  col = mix(col, sandy, strip * 0.85);
  col *= mix(0.72, 1.0, smoothstep(-0.02, 0.07, above));
  col = mix(col, qSrgb(vec3(0.38, 0.42, 0.30)), smoothstep(0.0, -0.4, above) * 0.6);

  // V1C: the ground AO texture, soft pools beside walls, in courtyards and narrow streets, under
  // crowns (gentler under a building's own lot, see groundAo.ts LOT_LIFT).
  float ao = qGroundAo(wp);
  col *= ao * mix(1.0, 0.97, 1.0 - ao) + (1.0 - ao) * vec3(0.0, 0.004, 0.012);
  return qGroundSeason(col, wp, road, above, ao, grassy ? 1.0 : 0.0, fade);
}

// C5E: the season and the weather on the ground. Snow (uSnow, the world env's) settles first in
// the hollows and against walls (the ground AO), patchy where it is thin, with a hint of what is
// under it (furrows, kerbs); roads and paths keep trodden snow with darker wheel and boot lines;
// none on the water or the wet margin. Rain darkens the ground a little, roads more; heat and
// drought turn the grass to straw.
vec3 qGroundSeason(vec3 col, vec2 wp, float road, float above, float ao, float grassy, float fade) {
  if (uDry > 0.001 && grassy > 0.5) {
    float patchy = 0.6 + 0.4 * qNoise(wp * 0.6 + 4.0);
    col = mix(col, col * vec3(1.12, 1.0, 0.68), uDry * 0.55 * patchy);
  }
  if (uWet > 0.001) col *= 1.0 - uWet * (0.08 + 0.1 * road);
  if (uSnow < 0.001) return col;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // Drifts: deeper where the AO is (walls, hedges, crowns), thinner on open ground as it starts.
  float shelter = clamp((1.0 - ao) * 4.0, 0.0, 1.0);
  float n = qNoise(wp * 0.7) * 0.65 + qNoise(wp * 2.9 + 9.0) * 0.35;
  float cover = smoothstep(0.25, 0.65, n * 0.8 + uSnow * 0.75 + shelter * 0.35 * uSnow - 0.2);
  cover *= smoothstep(0.0, 0.08, above);
  // Windswept patches on open ground where the old grass shows, and tufts poking through.
  float swept = smoothstep(0.58, 0.85, qNoise(wp * 0.23 + 31.0)) * (1.0 - shelter) * grassy;
  cover *= 1.0 - 0.18 * swept;
  float tuft = smoothstep(0.62, 0.8, qNoise(wp * 4.3 + 3.0) + swept * 0.15) * fade * (1.0 - shelter);
  cover *= 1.0 - 0.22 * tuft * grassy;
  // What lies under it shows a little (furrows, darker kerbs), more where it is thin.
  cover *= mix(1.0, 0.7 + 0.6 * clamp(lum * 2.5, 0.0, 1.0), 0.45 * (1.0 - shelter));
  // Trodden roads: thinner, in lines along the way, so the streets still read.
  float tread = qNoise(vec2(wp.x * 5.0, wp.y * 0.7)) * qNoise(vec2(wp.x * 0.7, wp.y * 5.0));
  cover = mix(cover, cover * (0.3 + 0.28 * smoothstep(0.15, 0.45, tread)), road);
  // Warm in the sun, a soft lavender blue in the sheltered hollows where the drift is deepest.
  vec3 white = qSrgb(vec3(0.95, 0.94, 0.91)) * (0.96 + 0.05 * qNoise(wp * 6.0) * fade);
  white = mix(white, white * vec3(0.88, 0.9, 1.0), shelter * 0.55);
  return mix(col, white, clamp(cover * uSnow, 0.0, 0.94));
}

vec3 qGlow() {
  vec3 sum = vec3(0.0);
  if (uNight < 0.01) return sum;
#ifdef Q_LIGHT_MAP
  // V2A: every lantern, lit window, oven, fire, festival light and shop front in one read.
  // (The caller's 1.3 times this; the map's pools are broader than the loop's, so a little less.)
  return qLamp(vQWorld.xz, 0.0) * (uNight * uNight * 0.65);
#else
  // Before V2A (and with ?debug&lights=loop): the 32 pools nearest the view.
  for (int i = 0; i < ${MAX_GROUND_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 l = uLights[i];
    vec3 d = vQWorld - l.xyz;
    float r2 = dot(d.xz, d.xz) + d.y * d.y * 2.0;
    sum += l.w * max(1.0 / (1.0 + r2 * 5.0) - 0.1, 0.0);
  }
  return qSrgb(vec3(1.0, 0.7, 0.4)) * min(sum, vec3(1.2)) * uNight * uNight;
#endif
}

float qCloudShade(vec2 wp) {
  vec2 p = wp * 0.028 + vec2(uTime * 0.006, uTime * 0.0035);
  float c = smoothstep(0.5, 0.72, qFbm(p));
  return 1.0 - c * 0.2 * uClouds;
}

float qRimMist(vec2 wp) {
  float e = min(min(wp.x, wp.y), min(${N.toFixed(1)} - wp.x, ${N.toFixed(1)} - wp.y));
  return 1.0 - smoothstep(0.0, 16.0, e);
}
`;

/**
 * The ground material: the kit's matte standard material with the ground painting injected.
 * Vertices with `gsurf` 1 are painted from the ground textures; 0 (cliff faces) keep vertex color.
 */
export function createGroundMaterial(tex: GroundTextures, env: WorldEnv): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  // C5E: the ground's snow is the world env's (the same object as the kit material's), so roofs
  // and the ground settle and melt together.
  const snow = env.snow;
  m.userData.snow = snow;
  // V2A: the light map in place of the 32-light loop, unless ?debug&lights=loop keeps the loop.
  const map = !LIGHT_LOOP;
  if (map) m.defines = { ...m.defines, Q_LIGHT_MAP: '' };
  m.onBeforeCompile = (shader) => {
    if (map) Object.assign(shader.uniforms, lightMapUniforms(env));
    Object.assign(shader.uniforms, {
      uGroundColor: { value: tex.color },
      uGroundData: { value: tex.data },
      uGroundDetail: { value: tex.detail },
      uGroundAo: groundAoFor(env),
      uPatterns: env.patterns,
      uSnow: snow,
      uWet: env.wet,
      uDry: env.dry,
      uAutumn: env.autumn,
      uBare: env.bare,
      uTime: env.staticTime,
      uNight: env.night,
      uClouds: env.clouds,
      uLights: env.lights,
      uLightCount: env.lightCount,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float gsurf;\nvarying float vQSurf;\nvarying vec3 vQWorld;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvQWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvQSurf = gsurf;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform sampler2D uGroundColor;',
          'uniform sampler2D uGroundData;',
          'uniform sampler2D uGroundDetail;',
          'precision highp sampler2DArray;',
          'uniform sampler2DArray uPatterns;',
          'uniform float uSnow;',
          'uniform float uWet;',
          'uniform float uDry;',
          'uniform float uAutumn;',
          'uniform float uBare;',
          'uniform float uTime;',
          'uniform float uNight;',
          'uniform float uClouds;',
          `uniform vec4 uLights[${MAX_GROUND_LIGHTS}];`,
          'uniform int uLightCount;',
          'varying float vQSurf;',
          'varying vec3 vQWorld;',
          map ? LIGHT_MAP_GLSL : '',
          NOISE_GLSL,
          GROUND_HELPERS,
          GROUND_AO_GLSL,
          ROAD_GLSL,
          GROUND_FRAGMENT,
        ].join('\n'),
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = qGround(diffuseColor.rgb) * qCloudShade(vQWorld.xz);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        map
          ? // V2A: on the albedo half greyed (a painter's warm pool on green grass, not an olive
            // one), and a breath of warm air over the pool.
            '#include <emissivemap_fragment>\n{ vec3 qG = qGlow(); vec3 qA = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))), 0.45); totalEmissiveRadiance += qA * qG * 1.3 + qG * 0.035; }'
          : '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * qGlow() * 1.3;',
      )
      .replace(
        '#include <fog_fragment>',
        '#include <fog_fragment>\n#ifdef USE_FOG\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, qRimMist(vQWorld.xz) * 0.55);\n#endif',
      );
  };
  m.customProgramCacheKey = () => (map ? 'qoti-ground-lightmap' : 'qoti-ground');
  return m;
}
