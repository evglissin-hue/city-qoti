import { content } from '@qoti/content';
import { TILE_FP } from '../constants';

/** Largest decor radius in content: how far decorNear must look to find every possible overlap. */
export const MAX_DECOR_RADIUS = content.decor.reduce((max, d) => Math.max(max, d.radius), 0);

export function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function isTile(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && isInt(v[0]) && isInt(v[1]);
}

export function decorRadius(defId: string): number {
  return content.decorById.get(defId)?.radius ?? 0;
}

/** Squared distance from a fixed point position to a fixed point rectangle (0 inside). */
export function distSqToRect(fx: number, fz: number, x0: number, z0: number, x1: number, z1: number): number {
  const dx = fx < x0 ? x0 - fx : fx > x1 ? fx - x1 : 0;
  const dz = fz < z0 ? z0 - fz : fz > z1 ? fz - z1 : 0;
  return dx * dx + dz * dz;
}

/** True when a circle (fixed point) overlaps tile (tx, tz). */
export function circleHitsTile(fx: number, fz: number, r: number, tx: number, tz: number): boolean {
  return distSqToRect(fx, fz, tx * TILE_FP, tz * TILE_FP, (tx + 1) * TILE_FP, (tz + 1) * TILE_FP) < r * r;
}

/** Two decor items may not have centers closer than 0.8 * (r1 + r2). Exact integer test. */
export function decorTooClose(dx: number, dz: number, r1: number, r2: number): boolean {
  const sum = r1 + r2;
  return 25 * (dx * dx + dz * dz) < 16 * sum * sum;
}
