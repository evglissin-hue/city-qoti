// What the final image looks like (V1.0 split; V1A's file from here on, while the frame graph in
// post.ts and the frame loop in renderer.ts are V1D's). The color code of the last passes lives
// here as GLSL functions and their uniforms: the seasonal grade with the dusk split tone, the
// vignette, the tilt-shift mask, the bloom mix and tone mapping, plus the values they take from
// the season, the hour and the camera distance. Today's PostChain calls them from its passes (the
// bloom mix aside: UnrealBloomPass still composites its own bloom, with the strength and threshold
// from `bloomFor`); V1D's one final pass will call them all.
import { ACESFilmicToneMapping, Vector3, type ToneMapping } from 'three';

export type GradeSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * C3D-1 seasonal grade, applied last on display colors: lift (shadows), gamma (mids) and gain
 * (highlights) per channel, plus saturation. Spring is a fresh, slightly warm grade with cool
 * shadows; the other seasons match it until a season pass tunes them.
 */
const GRADES: Record<GradeSeason, { lift: number[]; gamma: number[]; gain: number[]; saturation: number }> = {
  spring: { lift: [0.0, 0.012, 0.03], gamma: [1.0, 1.02, 1.0], gain: [1.02, 1.0, 0.97], saturation: 1.06 },
  summer: { lift: [0.0, 0.012, 0.03], gamma: [1.0, 1.02, 1.0], gain: [1.02, 1.0, 0.97], saturation: 1.06 },
  autumn: { lift: [0.0, 0.012, 0.03], gamma: [1.0, 1.02, 1.0], gain: [1.02, 1.0, 0.97], saturation: 1.06 },
  winter: { lift: [0.0, 0.012, 0.03], gamma: [1.0, 1.02, 1.0], gain: [1.02, 1.0, 0.97], saturation: 1.06 },
};

/**
 * Tone mapping for frames drawn without post (Low), where three applies it inside every material.
 * Keep it the same operator as `lookToneMap` in LOOK_GLSL.
 */
export const LOOK_TONE_MAPPING: ToneMapping = ACESFilmicToneMapping;

/** UnrealBloomPass's radius (how far the glow spreads), until V1D's blur chain replaces it. */
export const LOOK_BLOOM_RADIUS = 0.5;

/** The uniforms LOOK_GLSL reads. Share one set between every pass that includes it. */
export interface LookUniforms {
  /** Grade: lift, gamma and gain per channel, and saturation. */
  uLookLift: { value: Vector3 };
  uLookGamma: { value: Vector3 };
  uLookGain: { value: Vector3 };
  uLookSaturation: { value: number };
  /** Vignette strength: 0 none; 0.8 darkens the corners softly. */
  uLookVignette: { value: number };
  /** The screen height (0 bottom, 1 top) tilt-shift keeps sharp. */
  uLookTiltCenter: { value: number };
  /** Bloom: how much of the bright part is added, and where bright starts. */
  uLookBloomStrength: { value: number };
  uLookBloomThreshold: { value: number };
  /** Exposure before tone mapping. */
  uLookExposure: { value: number };
}

export function lookUniforms(): LookUniforms {
  return {
    uLookLift: { value: new Vector3(0, 0, 0) },
    uLookGamma: { value: new Vector3(1, 1, 1) },
    uLookGain: { value: new Vector3(1, 1, 1) },
    uLookSaturation: { value: 1 },
    uLookVignette: { value: 0.8 },
    uLookTiltCenter: { value: 0.5 },
    uLookBloomStrength: { value: 0.25 },
    uLookBloomThreshold: { value: 0.92 },
    uLookExposure: { value: 1 },
  };
}

/**
 * The look's GLSL: uniforms and functions, self-contained (it needs none of three's chunks, so it
 * works in a RawShaderMaterial and a ShaderMaterial alike).
 * - `lookGrade(rgb)`: the seasonal grade on display colors (after tone mapping and sRGB).
 * - `lookVignette(uv)`: the vignette factor; it darkens toward black as the old linear-space
 *   vignette did, so it is raised to 1/2.2 for display colors.
 * - `lookTiltMask(uv)`: how far from the sharp band a pixel is (0 in the band), which scales the
 *   tilt-shift blur.
 * - `lookBloomMix(scene, blurred)`: adds the bright part of a blurred image (for V1D's final pass).
 * - `lookToneMap(rgb)`: exposure and ACES filmic, exactly as three's ACESFilmicToneMapping.
 * - `lookSrgb(rgba)`: linear to sRGB, exactly as three's sRGBTransferOETF.
 */
export const LOOK_GLSL = /* glsl */ `
uniform vec3 uLookLift;
uniform vec3 uLookGamma;
uniform vec3 uLookGain;
uniform float uLookSaturation;
uniform float uLookVignette;
uniform float uLookTiltCenter;
uniform float uLookBloomStrength;
uniform float uLookBloomThreshold;
uniform float uLookExposure;

vec3 lookGrade(vec3 c) {
  vec3 x = clamp(c * uLookGain + uLookLift * (1.0 - c), 0.0, 1.0);
  x = pow(x, 1.0 / uLookGamma);
  float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), x, uLookSaturation);
}

float lookVignette(vec2 uv) {
  vec2 d = (uv - 0.5) * uLookVignette;
  return pow(max(1.0 - dot(d, d), 0.0), 0.4545);
}

float lookTiltMask(vec2 uv) {
  return abs(uLookTiltCenter - uv.y);
}

vec3 lookBloomMix(vec3 scene, vec3 blurred) {
  return scene + max(blurred - vec3(uLookBloomThreshold), 0.0) * uLookBloomStrength;
}

vec3 lookAcesFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 lookToneMap(vec3 color) {
  // sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
  const mat3 inputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  // ODT_SAT => XYZ => D60_2_D65 => sRGB
  const mat3 outputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  color *= uLookExposure / 0.6;
  color = inputMat * color;
  color = lookAcesFit(color);
  color = outputMat * color;
  return clamp(color, 0.0, 1.0);
}

vec4 lookSrgb(vec4 value) {
  return vec4(mix(pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), value.rgb * 12.92, vec3(lessThanEqual(value.rgb, vec3(0.0031308)))), value.a);
}
`;

/** The grade for a season, with the dusk and dawn split tone (`warmth` 0 to 1: rose highs, violet lows). */
export function applyGrade(u: LookUniforms, season: GradeSeason, warmth: number): void {
  const g = GRADES[season];
  const w = warmth;
  u.uLookLift.value.set(g.lift[0]! + 0.018 * w, g.lift[1]!, g.lift[2]! + 0.05 * w);
  u.uLookGamma.value.fromArray(g.gamma);
  u.uLookGain.value.set(
    g.gain[0]! * (1 + 0.03 * w),
    g.gain[1]! * (1 - 0.045 * w),
    g.gain[2]! * (1 + 0.02 * w),
  );
  u.uLookSaturation.value = g.saturation * (1 + 0.06 * w);
}

/** Bloom grows a little at night so windows and lanterns glow without washing out the day. */
export function bloomFor(night: number): { strength: number; threshold: number } {
  return { strength: 0.25 + night * 0.45, threshold: 0.92 - night * 0.2 };
}

/**
 * C3D-1: tilt-shift strength from the camera distance (0 to 2.2): close-ups stay crisp, wide views
 * get the miniature look. Playtest round three: close-ups had a little blur everywhere but the
 * middle band ("blurry when I zoom in"), so it starts at zero and only grows once the camera is
 * well back.
 */
export function tiltFor(distance: number): number {
  return Math.min(1, Math.max(0, (distance - 50) / 130)) * 2.2;
}
