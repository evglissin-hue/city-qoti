import { Color } from 'three';

export interface Lighting {
  sky: Color;
  sun: Color;
  sunIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  /** Sun direction (towards the sun), roughly east at dawn and west at dusk. */
  sunDir: [number, number, number];
  /** C2B: top of the sky gradient (sky is the horizon color, shared with the fog). */
  skyTop: Color;
  /** C2B: cool fill light from the side opposite the sun. */
  fill: Color;
  fillIntensity: number;
  /** C2B: tone mapping exposure. */
  exposure: number;
  /** C2B: 0 by day, 1 at full night; drives window glow and lantern strength. */
  night: number;
  /** C3D-1: share of windows lit in occupied homes at this hour (busy evenings, a few night owls). */
  windowShare: number;
  /** C3D-1: 0 to 1, the dusk and dawn color grade (rose highlights, violet shadows). */
  warmth: number;
}

interface Key {
  hour: number;
  sky: number;
  skyTop: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  fill: number;
  fillI: number;
  exposure: number;
  night: number;
  /** Rose highlights and violet shadows in the grade, strongest at dusk. */
  warmth: number;
}

// The dawn, day, dusk and night table from docs/spec/17-presentation.md (sun, ambient sky and
// ground), with a golden hour and a violet twilight in between. Shadows stay cool and blue-violet
// at dusk so greens never turn to mud; night is a deep cozy blue, never pitch black.
const NIGHT: Omit<Key, 'hour'> = {
  sky: 0x2d3b62,
  skyTop: 0x101935,
  sun: 0x9db4d8,
  sunI: 0.55,
  hemiSky: 0x2b3a55,
  hemiGround: 0x1e2433,
  hemiI: 2.6,
  fill: 0x6f86c8,
  fillI: 0.35,
  exposure: 1.35,
  night: 1,
  warmth: 0,
};
const DAWN: Omit<Key, 'hour'> = {
  sky: 0xf3c9a4,
  skyTop: 0x8ea2d0,
  sun: 0xf6c28b,
  sunI: 1.6,
  hemiSky: 0xe9c9b0,
  hemiGround: 0x6b5e50,
  hemiI: 1.0,
  fill: 0x9aa8e0,
  fillI: 0.4,
  exposure: 1.05,
  night: 0.15,
  warmth: 0.6,
};
const DAY: Omit<Key, 'hour'> = {
  sky: 0xd6eaf0,
  skyTop: 0x7fb3df,
  sun: 0xfff4e0,
  sunI: 2.5,
  hemiSky: 0xdde8f0,
  hemiGround: 0x7a8f5a,
  hemiI: 1.0,
  fill: 0x9cc4ff,
  fillI: 0.4,
  exposure: 1.0,
  night: 0,
  warmth: 0,
};
const GOLDEN: Omit<Key, 'hour'> = {
  sky: 0xf5d6ae,
  skyTop: 0x86a6d8,
  sun: 0xffcf98,
  sunI: 2.2,
  hemiSky: 0xe0dcd8,
  hemiGround: 0x66705a,
  hemiI: 1.0,
  fill: 0x9aa4e8,
  fillI: 0.45,
  exposure: 1.03,
  night: 0.05,
  warmth: 0.25,
};
const DUSK: Omit<Key, 'hour'> = {
  sky: 0xf2ab86,
  skyTop: 0x7d7cbc,
  sun: 0xf4a261,
  sunI: 1.5,
  hemiSky: 0xd9a8b4,
  hemiGround: 0x4e4660,
  hemiI: 1.1,
  fill: 0x8a8ef0,
  fillI: 0.75,
  exposure: 1.15,
  night: 0.35,
  warmth: 1,
};
const TWILIGHT: Omit<Key, 'hour'> = {
  sky: 0x806c9e,
  skyTop: 0x2f3466,
  sun: 0xd0909c,
  sunI: 0.75,
  hemiSky: 0x6f6aa0,
  hemiGround: 0x2e2a40,
  hemiI: 1.5,
  fill: 0x6f7ad0,
  fillI: 0.45,
  exposure: 1.28,
  night: 0.8,
  warmth: 0.45,
};
const KEYS: Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.6, ...NIGHT },
  { hour: 5.6, ...TWILIGHT },
  { hour: 6.4, ...DAWN },
  { hour: 8, ...DAY },
  { hour: 16.6, ...DAY },
  { hour: 18.2, ...GOLDEN },
  { hour: 19.2, ...DUSK },
  { hour: 20.4, ...TWILIGHT },
  { hour: 21.5, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const a = new Color();
const b = new Color();

function mix(from: number, to: number, t: number): Color {
  return a.setHex(from).lerp(b.setHex(to), t).clone();
}

/** Lit windows by hour: busy evenings, a few night owls, early risers before dawn. */
const WINDOW_KEYS: [number, number][] = [
  [0, 0.42],
  [1.5, 0.28],
  [4.5, 0.2],
  [6, 0.5],
  [8, 0.3],
  [17, 0.35],
  [19, 0.72],
  [22.5, 0.72],
  [24, 0.42],
];

export function windowShareAt(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < WINDOW_KEYS.length - 2 && WINDOW_KEYS[i + 1]![0] <= h) i++;
  const [h0, v0] = WINDOW_KEYS[i]!;
  const [h1, v1] = WINDOW_KEYS[i + 1]!;
  return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
}

/**
 * Whether the window pane at a world point is lit, for a share of lit windows. The kit material's
 * night glow uses the same integer hash on the GPU (WINDOW_HASH_GLSL), so ground spill under a
 * window always matches the pane above it.
 */
export function windowLit(x: number, y: number, z: number, share: number): boolean {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const iy = Math.floor(y * 1.2);
  const n = (((ix * 73 + iz * 151 + iy * 37 + ix * iz * 7) % 101) + 101) % 101;
  return n < share * 101;
}

/** GLSL twin of windowLit: 1 when the pane at world point `p` is lit for share `s`. */
export const WINDOW_HASH_GLSL = /* glsl */ `
float qWindowLit(vec3 p, float s) {
  vec3 c = floor(vec3(p.x, p.y * 1.2, p.z));
  float v = c.x * 73.0 + c.z * 151.0 + c.y * 37.0 + c.x * c.z * 7.0;
  // Exact in float (integers well under 2^24); the half offset keeps floor() off the boundary.
  float n = v - 101.0 * floor((v + 0.5) / 101.0);
  return step(n, s * 101.0 - 0.5);
}
`;

/** Light colors and sun direction for an hour of the day (fractional hours are fine). */
export function lightingAt(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.hour <= h) i++;
  const k0 = KEYS[i]!;
  const k1 = KEYS[i + 1]!;
  const t = (h - k0.hour) / (k1.hour - k0.hour);
  const lerp = (x: number, y: number): number => x + (y - x) * t;
  // The sun swings from east (6:00) through south (12:00) to west (18:00), low and long at the
  // ends of the day. At night the "sun" is a soft moon high in the south, so shadows stay gentle.
  const day = h >= 5 && h <= 20.5;
  const angle = day ? ((h - 6) / 12) * Math.PI : Math.PI / 2;
  const elevation = day ? Math.max(0.16, Math.sin(Math.min(Math.PI, Math.max(0, angle)))) : 0.9;
  return {
    sky: mix(k0.sky, k1.sky, t),
    sun: mix(k0.sun, k1.sun, t),
    sunIntensity: lerp(k0.sunI, k1.sunI),
    hemiSky: mix(k0.hemiSky, k1.hemiSky, t),
    hemiGround: mix(k0.hemiGround, k1.hemiGround, t),
    hemiIntensity: lerp(k0.hemiI, k1.hemiI),
    sunDir: [Math.cos(angle) * 0.8, elevation + 0.3, 0.45],
    skyTop: mix(k0.skyTop, k1.skyTop, t),
    fill: mix(k0.fill, k1.fill, t),
    fillIntensity: lerp(k0.fillI, k1.fillI),
    exposure: lerp(k0.exposure, k1.exposure),
    night: lerp(k0.night, k1.night),
    windowShare: windowShareAt(h),
    warmth: lerp(k0.warmth, k1.warmth),
  };
}
