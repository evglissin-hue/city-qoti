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
}

interface Key {
  hour: number;
  sky: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
}

// Day phases from docs/spec/02-game-overview.md: night 21 to 5, dawn 5 to 7, day 7 to 18, dusk 18 to 21.
const KEYS: Key[] = [
  { hour: 0, sky: 0x1d2a45, sun: 0x8aa0d8, sunI: 0.25, hemiSky: 0x40527a, hemiGround: 0x1c2230, hemiI: 0.55 },
  { hour: 5, sky: 0x2a3758, sun: 0x9aa8d8, sunI: 0.3, hemiSky: 0x4a5a80, hemiGround: 0x22283a, hemiI: 0.6 },
  { hour: 6, sky: 0xe9b38a, sun: 0xffb37a, sunI: 0.9, hemiSky: 0xd8c0b0, hemiGround: 0x5a4a3a, hemiI: 0.8 },
  { hour: 8, sky: 0xa9d3ec, sun: 0xfff1d6, sunI: 1.6, hemiSky: 0xd9ecff, hemiGround: 0x6b6040, hemiI: 1.0 },
  { hour: 17, sky: 0xa9d3ec, sun: 0xfff1d6, sunI: 1.6, hemiSky: 0xd9ecff, hemiGround: 0x6b6040, hemiI: 1.0 },
  { hour: 19, sky: 0xeaa27a, sun: 0xff9d5c, sunI: 0.9, hemiSky: 0xd7a99a, hemiGround: 0x4f3d34, hemiI: 0.8 },
  { hour: 21, sky: 0x2a3758, sun: 0x9aa8d8, sunI: 0.3, hemiSky: 0x4a5a80, hemiGround: 0x22283a, hemiI: 0.6 },
  {
    hour: 24,
    sky: 0x1d2a45,
    sun: 0x8aa0d8,
    sunI: 0.25,
    hemiSky: 0x40527a,
    hemiGround: 0x1c2230,
    hemiI: 0.55,
  },
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
  // The sun swings from east (6:00) through south (12:00) to west (18:00).
  const angle = ((h - 6) / 12) * Math.PI;
  const elevation = Math.max(0.15, Math.sin(Math.min(Math.PI, Math.max(0, angle))));
  return {
    sky: mix(k0.sky, k1.sky, t),
    sun: mix(k0.sun, k1.sun, t),
    sunIntensity: k0.sunI + (k1.sunI - k0.sunI) * t,
    hemiSky: mix(k0.hemiSky, k1.hemiSky, t),
    hemiGround: mix(k0.hemiGround, k1.hemiGround, t),
    hemiIntensity: k0.hemiI + (k1.hemiI - k0.hemiI) * t,
    sunDir: [Math.cos(angle) * 0.8, elevation + 0.35, 0.45],
  };
}
