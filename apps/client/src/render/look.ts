// What the final image looks like (V1.0 split; V1A's file from here on, while the frame graph in
// post.ts and the frame loop in renderer.ts are V1D's). The color code of the last passes lives
// here as GLSL functions and their uniforms: the seasonal grade with the dusk split tone, the
// vignette, the tilt-shift mask, the bloom mix and tone mapping, plus the values they take from
// the season, the hour and the camera distance. Today's PostChain calls them from its passes (the
// bloom mix aside: UnrealBloomPass still composites its own bloom, with the strength and threshold
// from `bloomFor`); V1D's one final pass will call them all.
//
// V1A: matched to the Painted Miniature concept stills: Khronos PBR Neutral tone mapping (it keeps
// the pastel palette's hues where ACES pushed them toward orange and crushed the darks), a gentle
// S-curve and warmth in the grade per season, the concept's soft oval vignette, a gentler
// tilt-shift that only starts once the camera is well back, bloom at golden hour and night only,
// and the dither as a look function (`lookDither`), with the tilt mix (`lookTiltMix`).
import { NeutralToneMapping, Vector3, type ToneMapping } from 'three';

export type GradeSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * The seasonal grade, applied last on display colors: lift (shadows), gamma (mids) and gain
 * (highlights) per channel, saturation and an S-curve (contrast, 0 none). V1A: the concept's warm
 * lamp (gain toward amber, a touch of contrast, a little less saturation than the old grade) as
 * the base; spring fresh with cool shadows, summer the warmest and fullest, autumn golden, winter
 * cool, pale and quieter.
 */
const GRADES: Record<
  GradeSeason,
  { lift: number[]; gamma: number[]; gain: number[]; saturation: number; contrast: number }
> = {
  spring: {
    lift: [0.0, 0.008, 0.024],
    gamma: [1.0, 1.015, 1.0],
    gain: [1.03, 1.01, 0.96],
    saturation: 1.0,
    contrast: 0.16,
  },
  summer: {
    lift: [0.008, 0.006, 0.016],
    gamma: [1.0, 1.0, 0.99],
    gain: [1.045, 1.01, 0.94],
    saturation: 1.03,
    contrast: 0.2,
  },
  autumn: {
    lift: [0.014, 0.006, 0.01],
    gamma: [1.01, 1.0, 0.98],
    gain: [1.06, 1.0, 0.9],
    saturation: 1.05,
    contrast: 0.18,
  },
  winter: {
    lift: [0.0, 0.012, 0.04],
    gamma: [0.99, 1.0, 1.02],
    gain: [0.99, 1.0, 1.03],
    saturation: 0.86,
    contrast: 0.1,
  },
};

/**
 * Tone mapping for frames drawn without post (the classic engine's Low), where three applies it
 * inside every material. Keep it the same operator as `lookToneMap` in LOOK_GLSL.
 */
export const LOOK_TONE_MAPPING: ToneMapping = NeutralToneMapping;

/** UnrealBloomPass's radius (how far the glow spreads), until V1D's blur chain replaces it. */
export const LOOK_BLOOM_RADIUS = 0.5;

/** The uniforms LOOK_GLSL reads. Share one set between every pass that includes it. */
export interface LookUniforms {
  /** Grade: lift, gamma and gain per channel, and saturation. */
  uLookLift: { value: Vector3 };
  uLookGamma: { value: Vector3 };
  uLookGain: { value: Vector3 };
  uLookSaturation: { value: number };
  /** Vignette strength: how much the corners darken (V1A: 0 none, 0.14 the concept's). */
  uLookVignette: { value: number };
  /** V1A: the grade's S-curve, 0 none. */
  uLookContrast: { value: number };
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
    uLookVignette: { value: 0.14 },
    uLookContrast: { value: 0.16 },
    uLookTiltCenter: { value: 0.5 },
    uLookBloomStrength: { value: 0 },
    uLookBloomThreshold: { value: 0.9 },
    uLookExposure: { value: 1 },
  };
}

/**
 * The look's GLSL: uniforms and functions, self-contained (it needs none of three's chunks, so it
 * works in a RawShaderMaterial and a ShaderMaterial alike).
 * - `lookGrade(rgb)`: the seasonal grade on display colors (after tone mapping and sRGB).
 * - `lookVignette(uv)`: the vignette factor, a soft oval as in the concept (V1A).
 * - `lookTiltMask(uv)`: how far from the sharp band a pixel is (0 in the band), which scales the
 *   tilt-shift blur.
 * - `lookBloomMix(scene, blurred)`: adds the bright part of a blurred image (for V1D's final pass).
 * - `lookTiltMix(uv, k)`: V1A, the tilt-shift's mix weight (the mask through a soft band, times k).
 * - `lookToneMap(rgb)`: exposure and Khronos PBR Neutral, exactly as three's NeutralToneMapping.
 * - `lookSrgb(rgba)`: linear to sRGB, exactly as three's sRGBTransferOETF.
 * - `lookDither(rgb, fragCoord)`: V1A, half a level of noise either way, last.
 */
export const LOOK_GLSL = /* glsl */ `
uniform vec3 uLookLift;
uniform vec3 uLookGamma;
uniform vec3 uLookGain;
uniform float uLookSaturation;
uniform float uLookContrast;
uniform float uLookVignette;
uniform float uLookTiltCenter;
uniform float uLookBloomStrength;
uniform float uLookBloomThreshold;
uniform float uLookExposure;

vec3 lookGrade(vec3 c) {
  vec3 x = clamp(c * uLookGain + uLookLift * (1.0 - c), 0.0, 1.0);
  x = pow(x, 1.0 / uLookGamma);
  x = mix(x, x * x * (3.0 - 2.0 * x), uLookContrast);
  float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), x, uLookSaturation);
}

float lookVignette(vec2 uv) {
  float v = smoothstep(0.95, 0.3, length((uv - 0.5) * vec2(1.25, 1.0)));
  return mix(1.0 - uLookVignette, 1.0, v);
}

float lookTiltMask(vec2 uv) {
  return abs(uLookTiltCenter - uv.y);
}

// How much of the blurred image a pixel takes: a sharp band about the tilt center, easing out to
// the full strength k (the final pass's tilt uniform) toward the top and bottom of the screen.
float lookTiltMix(vec2 uv, float k) {
  return smoothstep(0.1, 0.52, lookTiltMask(uv)) * clamp(k, 0.0, 1.0);
}

vec3 lookBloomMix(vec3 scene, vec3 blurred) {
  return scene + max(blurred - vec3(uLookBloomThreshold), 0.0) * uLookBloomStrength;
}

// Khronos PBR Neutral, exactly as three's NeutralToneMapping, after the exposure.
vec3 lookToneMap(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  color *= uLookExposure;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec4 lookSrgb(vec4 value) {
  return vec4(mix(pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), value.rgb * 12.92, vec3(lessThanEqual(value.rgb, vec3(0.0031308)))), value.a);
}

// Half a level of interleaved gradient noise either way, so slow gradients never band in 8 bits.
vec3 lookDither(vec3 c, vec2 fragCoord) {
  float n = fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
  return c + (n - 0.5) / 255.0;
}
`;

/** The night each look's uniforms were last graded for (applyGrade keeps it between calls). */
const nights = new WeakMap<LookUniforms, number>();

/**
 * The grade for a season, with the dusk and dawn split tone (`warmth` 0 to 1: rose highs, violet
 * lows) and, V1A, the night (0 to 1: a little less saturation and bluer lows, so grass under the
 * moon reads blue-green, not lawn green). `night` is remembered per uniform set, so a season or
 * warmth change keeps it.
 */
export function applyGrade(u: LookUniforms, season: GradeSeason, warmth: number, night?: number): void {
  const g = GRADES[season];
  const w = warmth;
  const n = night ?? nights.get(u) ?? 0;
  nights.set(u, n);
  u.uLookLift.value.set(g.lift[0]! + 0.018 * w, g.lift[1]! + 0.004 * n, g.lift[2]! + 0.05 * w + 0.018 * n);
  u.uLookGamma.value.fromArray(g.gamma);
  u.uLookGain.value.set(
    g.gain[0]! * (1 + 0.03 * w),
    g.gain[1]! * (1 - 0.045 * w),
    g.gain[2]! * (1 + 0.02 * w),
  );
  u.uLookSaturation.value = g.saturation * (1 + 0.06 * w) * (1 - 0.22 * n);
  u.uLookContrast.value = g.contrast;
}

/**
 * V1A: bloom at golden hour and night only, as the presets in 17-presentation.md say: none by day
 * (the bloom chain is skipped), a soft halo round sunlit gold at golden hour, and a tight warm one
 * round lit windows and lanterns at night. The final pass adds it at BLOOM_GAIN times the strength.
 */
export function bloomFor(night: number): { strength: number; threshold: number } {
  if (night < 0.02) return { strength: 0, threshold: 0.9 };
  return { strength: 0.08 + 0.17 * night, threshold: 0.9 - 0.2 * night };
}

/**
 * Tilt-shift strength from the camera distance, for the final pass's tilt uniform (V1D's post.ts
 * scales it by TILT_MIX). C3D-1 and playtest round three: close-ups stay crisp. V1A: the concept's
 * gentler blur, starting at 45 tiles and full from about 160, so the village keeps its rooftops.
 */
export function tiltFor(distance: number): number {
  return Math.min(1, Math.max(0, (distance - 45) / 115)) * 0.8;
}
