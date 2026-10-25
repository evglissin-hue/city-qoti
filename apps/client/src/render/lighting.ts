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
}

// Day phases from docs/spec/02-game-overview.md: night 21 to 5, dawn 5 to 7, day 7 to 18, dusk 18 to 21.
// Night is a deep cozy blue, never pitch black; dawn and dusk are warm peach and rose.
const NIGHT: Omit<Key, 'hour'> = {
  sky: 0x2b3a63,
  skyTop: 0x141c38,
  sun: 0x9fb4f0,
  sunI: 0.45,
  hemiSky: 0x5a6fa8,
  hemiGround: 0x2a2f45,
  hemiI: 0.85,
  fill: 0x6f86c8,
  fillI: 0.25,
  exposure: 1.15,
  night: 1,
};
const DAY: Omit<Key, 'hour'> = {
  sky: 0xcfe6ef,
  skyTop: 0x7fb6e0,
  sun: 0xffe7c2,
  sunI: 2.4,
  hemiSky: 0xdcefff,
  hemiGround: 0x8a7a52,
  hemiI: 1.05,
  fill: 0x9cc4ff,
  fillI: 0.45,
  exposure: 1.0,
  night: 0,
};
const KEYS: Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.5, ...NIGHT },
  {
    hour: 6,
    sky: 0xf2c4a0,
    skyTop: 0x8a9ccc,
    sun: 0xffb27a,
    sunI: 1.3,
    hemiSky: 0xe6c8c0,
    hemiGround: 0x6a5444,
    hemiI: 0.9,
    fill: 0x9aa8e0,
    fillI: 0.35,
    exposure: 1.05,
    night: 0.35,
  },
  { hour: 8, ...DAY },
  { hour: 16.5, ...DAY },
  {
    hour: 18.5,
    sky: 0xf6b98e,
    skyTop: 0x9a8fc4,
    sun: 0xffa064,
    sunI: 1.6,
    hemiSky: 0xe8b8a8,
    hemiGround: 0x6a4a3c,
    hemiI: 0.9,
    fill: 0x8f9ee0,
    fillI: 0.35,
    exposure: 1.05,
    night: 0.25,
  },
  {
    hour: 20,
    sky: 0x8a6f98,
    skyTop: 0x3a3f74,
    sun: 0xd88a7a,
    sunI: 0.8,
    hemiSky: 0x8a86b8,
    hemiGround: 0x3a3448,
    hemiI: 0.85,
    fill: 0x7a8ad0,
    fillI: 0.3,
    exposure: 1.1,
    night: 0.75,
  },
  { hour: 21.5, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const a = new Color();
const b = new Color();

function mix(from: number, to: number, t: number): Color {
  return a.setHex(from).lerp(b.setHex(to), t).clone();
}

/** Light colors and sun direction for an hour of the day (fractional hours are fine). */
export function lightingAt(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.hour <= h) i++;
  const k0 = KEYS[i]!;
  const k1 = KEYS[i + 1]!;
  const t = (h - k0.hour) / (k1.hour - k0.hour);
  const lerp = (x: number, y: number): number => x + (y - x) * t;
  // The sun swings from east (6:00) through south (12:00) to west (18:00). At night the "sun" is a
  // soft moon high in the south, so shadows stay gentle and the valley never goes flat.
  const day = h >= 5 && h <= 20.5;
  const angle = day ? ((h - 6) / 12) * Math.PI : Math.PI / 2;
  const elevation = day ? Math.max(0.22, Math.sin(Math.min(Math.PI, Math.max(0, angle)))) : 0.9;
  return {
    sky: mix(k0.sky, k1.sky, t),
    sun: mix(k0.sun, k1.sun, t),
    sunIntensity: lerp(k0.sunI, k1.sunI),
    hemiSky: mix(k0.hemiSky, k1.hemiSky, t),
    hemiGround: mix(k0.hemiGround, k1.hemiGround, t),
    hemiIntensity: lerp(k0.hemiI, k1.hemiI),
    sunDir: [Math.cos(angle) * 0.8, elevation + 0.35, 0.45],
    skyTop: mix(k0.skyTop, k1.skyTop, t),
    fill: mix(k0.fill, k1.fill, t),
    fillIntensity: lerp(k0.fillI, k1.fillI),
    exposure: lerp(k0.exposure, k1.exposure),
    night: lerp(k0.night, k1.night),
  };
}
