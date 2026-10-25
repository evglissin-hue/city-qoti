import { MAP_SIZE, TILE_FP, type MapReader } from '@qoti/sim';
import type { Vector3 } from 'three';
import type { TilePick } from './api';
import { levelY } from './coords';

const MAX_Y = levelY(15) + 0.5;
const STEP = 0.08;

/**
 * Picking is math, not mesh raycasting: march the ray across the heightfield until it dips
 * below a tile's top, then refine the crossing by bisection.
 */
export function pickTileFromRay(reader: MapReader, origin: Vector3, dir: Vector3): TilePick | null {
  if (dir.y >= 0 && origin.y > MAX_Y) return null;
  let t = origin.y > MAX_Y ? (origin.y - MAX_Y) / -dir.y : 0;
  const tEnd = t + 1200;
  const below = (tt: number) => {
    const x = origin.x + dir.x * tt;
    const z = origin.z + dir.z * tt;
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    if (tx < 0 || tz < 0 || tx >= MAP_SIZE || tz >= MAP_SIZE) return false;
    return origin.y + dir.y * tt <= levelY(reader.height(tx, tz));
  };
  let prev = t;
  for (; t < tEnd; t += STEP) {
    if (origin.y + dir.y * t < -1) break;
    if (below(t)) {
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid;
        else lo = mid;
      }
      const x = origin.x + dir.x * hi;
      const z = origin.z + dir.z * hi;
      const tx = Math.min(MAP_SIZE - 1, Math.max(0, Math.floor(x)));
      const tz = Math.min(MAP_SIZE - 1, Math.max(0, Math.floor(z)));
      return {
        x: tx,
        z: tz,
        fx: Math.min(MAP_SIZE * TILE_FP - 1, Math.max(0, Math.floor(x * TILE_FP))),
        fz: Math.min(MAP_SIZE * TILE_FP - 1, Math.max(0, Math.floor(z * TILE_FP))),
        h: reader.height(tx, tz),
      };
    }
    prev = t;
  }
  return null;
}
