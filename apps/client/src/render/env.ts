import { Color, Vector3, Vector4, type PerspectiveCamera } from 'three';

/** Most ground glow pools (lanterns, lit windows) drawn at once, nearest the view first. */
export const MAX_GROUND_LIGHTS = 32;

/**
 * C3D-1: the world's shared look state, owned by the renderer and read by world layers. Values are
 * shader uniform objects, so materials that hold them update without recompiling.
 */
export interface WorldEnv {
  /** Seconds of ambient animation (water, clouds); frozen when ambient motion is off. */
  time: { value: number };
  /** 0 by day, 1 at full night. */
  night: { value: number };
  /** Horizon and fog color, and the top of the sky. */
  sky: { value: Color };
  skyTop: { value: Color };
  /** Towards the sun (normalized) and its color. */
  sunDir: { value: Vector3 };
  sunColor: { value: Color };
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
  /** Bumped whenever the camera moves, so level of detail can skip still frames. */
  viewRevision: number;
}

export function createWorldEnv(camera: PerspectiveCamera): WorldEnv {
  return {
    time: { value: 0 },
    night: { value: 0 },
    sky: { value: new Color(0xcfe6ef) },
    skyTop: { value: new Color(0x7fb6e0) },
    sunDir: { value: new Vector3(0.3, 0.8, 0.4).normalize() },
    sunColor: { value: new Color(0xfff4e0) },
    clouds: { value: 1 },
    lights: { value: Array.from({ length: MAX_GROUND_LIGHTS }, () => new Vector4()) },
    lightCount: { value: 0 },
    focus: new Vector3(),
    camera,
    motion: true,
    detailDistance: 80,
    viewRevision: 0,
  };
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
