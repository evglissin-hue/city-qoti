import { createPatternArray, lastPatternMs, SEASON_LOOK, type Season } from '@qoti/art';
import { Color, Vector3, Vector4, type DataArrayTexture, type PerspectiveCamera } from 'three';
import type { Quality } from './quality';
import type { SeasonBlend } from './seasons';

/** Most ground glow pools (lanterns, lit windows) drawn at once, nearest the view first. */
export const MAX_GROUND_LIGHTS = 32;

/**
 * C3D-1: the world's shared look state, owned by the renderer and read by world layers. Values are
 * shader uniform objects, so materials that hold them update without recompiling.
 */
export interface WorldEnv {
  /** Seconds of ambient animation (water, clouds); frozen when ambient motion is off. */
  time: { value: number };
  /**
   * V1.0: the clock animation inside static layers runs on (cloud shade on the ground, foliage
   * sway, the sky's clouds and stars). The same object as `time` until V1D, which stops it while
   * the camera rests, so the still-frame cache stays true (docs/build/v1-wave-notes.md).
   */
  staticTime: { value: number };
  /** 0 by day, 1 at full night. */
  night: { value: number };
  /** Horizon and fog color, and the top of the sky. */
  sky: { value: Color };
  skyTop: { value: Color };
  /** Towards the sun (normalized) and its color. */
  sunDir: { value: Vector3 };
  sunColor: { value: Color };
  /** Share of windows lit at this hour (see lighting.ts windowLit). */
  windowShare: { value: number };
  /** 0 to 1: how much drifting cloud shade shows on the ground (none at night). */
  clouds: { value: number };
  /** Ground glow pools: xyz in world units, w strength. Filled by the lights layer. */
  lights: { value: Vector4[] };
  lightCount: { value: number };
  /** The ground point the camera looks at, and the camera itself, for level of detail. */
  focus: Vector3;
  camera: PerspectiveCamera;
  /** Ambient motion is on (Medium and High): animated layers keep the frame loop drawing. */
  motion: boolean;
  /** Decor detail distance in tiles for the active quality preset (small props fade out beyond). */
  detailDistance: number;
  /**
   * V1.0: buildings within this many tiles of the camera draw at full detail, the low version
   * beyond (the preset's, see quality.ts `buildingDetailNow`).
   */
  buildingDetail: number;
  /** Bumped whenever the camera moves, so level of detail can skip still frames. */
  viewRevision: number;
  /**
   * V1.0: the pattern texture array (packages/art patterns.ts), created once and shared by the kit
   * material (V1A) and the ground shader (V1C). Flat until V1A writes the generators.
   */
  patterns: { value: DataArrayTexture };
  /**
   * V1A: the season's look on the kit material (C5E builds on these): snow cover on upward faces
   * (0 to 1), the tint multiplied into foliage surfaces, and the sway strength of leaf and flower
   * faces. Set by `applySeasonLook`.
   */
  snow: { value: number };
  seasonTint: { value: Color };
  sway: { value: number };
  /**
   * C5E: the trees' season (autumn color, bare branches, blossom, 0 to 1 each; `seasonBlendAt` in
   * render/seasons.ts) and the weather's look (rain wetness, fog, storm wind, overcast, dryness).
   * Static pictures read them, so a step drops the still frame (`renderer.invalidateStatic()`).
   */
  autumn: { value: number };
  bare: { value: number };
  blossom: { value: number };
  wet: { value: number };
  snowfall: { value: number };
  fog: { value: number };
  storm: { value: number };
  overcast: { value: number };
  dry: { value: number };
  /**
   * C5E: the season (0 spring to 3 winter), day and hour the picture shows (the calendar's, or a
   * debug or photo mode pin), for layers that change with them (critters).
   */
  shown: { season: number; day: number; hour: number };
  /** C5E: ambient critters and weather particles by preset (`QualityPreset.critters`). */
  critters: 'none' | 'some' | 'all';
  /** C5E: the river is frozen (0 or 1, eased over a few seconds in the water shader). */
  frozen: { value: number };
}

/** The renderer's season names, in the sim calendar's order (0 spring to 3 winter). */
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

/**
 * V1A: sets the season's look on the env (snow, foliage tint). Returns true when it changed, so
 * the caller can drop the still-frame cache (`renderer.invalidateStatic()`).
 */
export function applySeasonLook(env: WorldEnv, season: Season): boolean {
  const look = SEASON_LOOK[season];
  const tint = new Color(look.tint);
  if (env.snow.value === look.snow && env.seasonTint.value.equals(tint)) return false;
  env.snow.value = look.snow;
  env.seasonTint.value.copy(tint);
  return true;
}

/**
 * C5E: sets the hour's blend of the season (snow, foliage tint, the trees' weights). Returns true
 * when anything changed, so the caller can drop the still frame.
 */
export function applySeasonBlend(env: WorldEnv, b: SeasonBlend): boolean {
  const tint = new Color(b.tint);
  if (
    env.snow.value === b.snow &&
    env.seasonTint.value.equals(tint) &&
    env.autumn.value === b.autumn &&
    env.bare.value === b.bare &&
    env.blossom.value === b.blossom
  )
    return false;
  env.snow.value = b.snow;
  env.seasonTint.value.copy(tint);
  env.autumn.value = b.autumn;
  env.bare.value = b.bare;
  env.blossom.value = b.blossom;
  return true;
}

/** V1A: anisotropic filtering of the pattern array per preset (capped by the GPU's maximum). */
export const PATTERN_ANISOTROPY: Record<Quality, number> = { low: 2, medium: 4, high: 8, ultra: 16 };

/**
 * V1A: applies the preset's anisotropy to the pattern array (a re-upload of the texture on a
 * change, so call it on a quality change only). Returns true when it changed.
 */
export function setPatternAnisotropy(env: WorldEnv, quality: Quality, max: number): boolean {
  const a = Math.max(1, Math.min(PATTERN_ANISOTROPY[quality], max));
  const tex = env.patterns.value;
  if (tex.anisotropy === a) return false;
  tex.anisotropy = a;
  tex.needsUpdate = true;
  return true;
}

/** Where to build first: the view's focus once the renderer has drawn, else the start area. */
export function nearOf(env: WorldEnv | undefined, startArea: readonly number[]): { x: number; z: number } {
  if (env && (env.focus.x !== 0 || env.focus.z !== 0)) return { x: env.focus.x, z: env.focus.z };
  return { x: (startArea[0]! + startArea[2]!) / 2, z: (startArea[1]! + startArea[3]!) / 2 };
}

/** Chunks within this many tiles of the start are built before the first frame; the rest stream in. */
export const FIRST_FRAME_RADIUS = 56;

export function createWorldEnv(camera: PerspectiveCamera): WorldEnv {
  const time = { value: 0 };
  return {
    time,
    staticTime: time,
    night: { value: 0 },
    sky: { value: new Color(0xcfe6ef) },
    skyTop: { value: new Color(0x7fb6e0) },
    sunDir: { value: new Vector3(0.3, 0.8, 0.4).normalize() },
    sunColor: { value: new Color(0xfff4e0) },
    clouds: { value: 1 },
    windowShare: { value: 0.6 },
    lights: { value: Array.from({ length: MAX_GROUND_LIGHTS }, () => new Vector4()) },
    lightCount: { value: 0 },
    focus: new Vector3(),
    camera,
    motion: true,
    detailDistance: 80,
    buildingDetail: 75,
    viewRevision: 0,
    patterns: { value: createPatterns() },
    snow: { value: 0 },
    seasonTint: { value: new Color(SEASON_LOOK.spring.tint) },
    sway: { value: 1 },
    autumn: { value: 0 },
    bare: { value: 0 },
    blossom: { value: 0 },
    wet: { value: 0 },
    snowfall: { value: 0 },
    fog: { value: 0 },
    storm: { value: 0 },
    overcast: { value: 0 },
    dry: { value: 0 },
    frozen: { value: 0 },
    critters: 'some',
    shown: { season: 0, day: 1, hour: 12 },
  };
}

/** The pattern array, generated once per page (both laptops build the same texels) and logged. */
let shared: DataArrayTexture | null = null;
function createPatterns(): DataArrayTexture {
  if (shared) return shared;
  shared = createPatternArray();
  if (typeof location !== 'undefined' && location.search.includes('debug'))
    console.info(`[qoti] pattern array generated in ${lastPatternMs().toFixed(1)} ms`);
  return shared;
}

/** Shared GLSL helpers: a cheap hash, value noise and a small fbm. */
export const NOISE_GLSL = /* glsl */ `
float qHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float qNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(qHash(i), qHash(i + vec2(1.0, 0.0)), u.x),
             mix(qHash(i + vec2(0.0, 1.0)), qHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float qFbm(vec2 p) {
  return qNoise(p) * 0.55 + qNoise(p * 2.07 + 17.3) * 0.3 + qNoise(p * 4.13 + 5.1) * 0.15;
}
vec3 qSrgb(vec3 c) { return pow(c, vec3(2.2)); }
`;
