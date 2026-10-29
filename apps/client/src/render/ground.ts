import { palette } from '@qoti/art';
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
import { hash2 } from './coords';
import { MAX_GROUND_LIGHTS, NOISE_GLSL, type WorldEnv } from './env';
import { drawDef } from './defs';
import { DOOR_KIND, ROAD_GLSL } from './layers/roads';
import { WATER_Y } from './surface';

/**
 * C3D-1: the painted ground. Two small textures cover the map, one texel per tile:
 * - color (filtered, so tile colors blend softly across edges): the base tint per tile with seeded
 *   variation, canopy shade under trees and sandy banks; alpha is wildflower density.
 * - data (exact): road kind (or a door, see DOOR_KIND), terrain, crop growth (wear off fields, C4E)
 *   and flags, for roads, doorsteps, field furrows, crops and desire paths.
 * The ground shader adds the detail on top: mottling, flowers, furrows, roads with ruts, wet
 * banks, drifting cloud shade, lantern glow pools at night and mist at the valley's rim.
 */

export const GroundFlag = { water: 1, rowsAlongX: 2, built: 4, tree: 8 } as const;

const N = MAP_SIZE;

type RGB = [number, number, number];
const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const GRASS = rgb(palette.grass);
const GRASS_WARM = rgb(0xa8bf60);
const GRASS_LUSH = rgb(0x6f9d4a);
const MEADOW = rgb(palette.meadow);
const FOREST = rgb(palette.forestFloor);
const CANOPY = rgb(0x4b6a35);
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

/** The two ground textures, kept in step with the Mirror. */
export class GroundTextures {
  readonly color: DataTexture;
  readonly data: DataTexture;
  private readonly colorBytes = new Uint8Array(N * N * 4);
  private readonly dataBytes = new Uint8Array(N * N * 4);

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
    this.refresh([0, 0, N - 1, N - 1]);
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
        c = mix(FOREST, GRASS, 0.18 + warm * 0.2);
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
        c = mix(c, GRASS_LUSH, Math.max(0, lush - 0.55) * 1.4);
        flowers = Math.max(0, bloom - 0.62) * 1.6;
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
    this.colorBytes[o + 3] = Math.round(Math.min(1, flowers) * 255);

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

  // Wildflower speckles, five cells per tile; far away they melt into a soft tint.
  float flowers = gc.a;
  if (flowers > 0.01 && !built) {
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
  if (!water) col = qRoadPaint(wp, col);

  // Banks: a sandy strip that follows the shore, damp sand at the waterline, the bed below it.
  float above = vQWorld.y - ${WATER_Y.toFixed(3)};
  float strip = 1.0 - smoothstep(0.1, 0.22, above + (qNoise(wp * 2.3) - 0.5) * 0.1);
  col = mix(col, qSrgb(vec3(0.89, 0.82, 0.63)) * (0.94 + 0.1 * qNoise(wp * 5.0)), strip * 0.85);
  col *= mix(0.72, 1.0, smoothstep(-0.02, 0.07, above));
  col = mix(col, qSrgb(vec3(0.38, 0.42, 0.30)), smoothstep(0.0, -0.4, above) * 0.6);
  return col;
}

vec3 qGlow() {
  vec3 sum = vec3(0.0);
  if (uNight < 0.01) return sum;
  for (int i = 0; i < ${MAX_GROUND_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 l = uLights[i];
    vec3 d = vQWorld - l.xyz;
    float r2 = dot(d.xz, d.xz) + d.y * d.y * 2.0;
    sum += l.w * max(1.0 / (1.0 + r2 * 5.0) - 0.1, 0.0);
  }
  return qSrgb(vec3(1.0, 0.7, 0.4)) * min(sum, vec3(1.2)) * uNight * uNight;
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
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uGroundColor: { value: tex.color },
      uGroundData: { value: tex.data },
      uTime: env.time,
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
          'uniform float uTime;',
          'uniform float uNight;',
          'uniform float uClouds;',
          `uniform vec4 uLights[${MAX_GROUND_LIGHTS}];`,
          'uniform int uLightCount;',
          'varying float vQSurf;',
          'varying vec3 vQWorld;',
          NOISE_GLSL,
          GROUND_HELPERS,
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
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * qGlow() * 1.3;',
      )
      .replace(
        '#include <fog_fragment>',
        '#include <fog_fragment>\n#ifdef USE_FOG\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, qRimMist(vQWorld.xz) * 0.55);\n#endif',
      );
  };
  m.customProgramCacheKey = () => 'qoti-ground';
  return m;
}
