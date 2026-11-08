import { TILE_FP } from '@qoti/sim';

/** World units per height level (1 level = 2 m, 1 tile = 4 m = 1 world unit). */
export const HEIGHT_SCALE = 0.5;

export function levelY(h: number): number {
  return h * HEIGHT_SCALE;
}

export function fpToWorld(f: number): number {
  return f / TILE_FP;
}

/** Stable pseudo-random value in [0, 1) per tile, for visual variety only (never sim state). */
export function hash2(x: number, z: number, salt = 0): number {
  let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(z + 0x7f4a + salt, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Scales an RGB hex color's brightness. */
export function shade(hex: number, factor: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((hex & 255) * factor));
  return (r << 16) | (g << 8) | b;
}
