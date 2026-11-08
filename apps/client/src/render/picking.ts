import { MAP_SIZE, TILE_FP, type MapReader } from '@qoti/sim';
import type { Vector3 } from 'three';
import type { TilePick } from './api';
import { levelY } from './coords';
import { surfaceOf, surfaceY, type SurfaceReader } from './surface';

const MAX_Y = levelY(15) + 0.5;
const STEP = 0.06;

/**
 * Picking is math, not mesh raycasting: march the ray over the same smooth surface the terrain
 * draws until it dips below the ground, then refine the crossing by bisection. The picked tile is
 * the one under the hit point, so slopes and cliff faces pick what the cursor is on.
 */
export function pickTileFromRay(
  reader: MapReader | SurfaceReader,
  origin: Vector3,
  dir: Vector3,
): TilePick | null {
  if (dir.y >= 0 && origin.y > MAX_Y) return null;
  const surface = surfaceOf(reader);
  let t = origin.y > MAX_Y ? (origin.y - MAX_Y) / -dir.y : 0;
  const tEnd = t + 1200;
  const below = (tt: number) => {
    const x = origin.x + dir.x * tt;
    const z = origin.z + dir.z * tt;
    if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) return false;
    const y = origin.y + dir.y * tt;
    // Cheap bound first: the surface never rises above the highest of the 3 x 3 tile centers.
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    let top = -1;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = Math.min(MAP_SIZE - 1, Math.max(0, tx + dx));
        const nz = Math.min(MAP_SIZE - 1, Math.max(0, tz + dz));
        top = Math.max(top, levelY(surface.level(nx, nz)));
      }
    }
    if (y > top + 0.01) return false;
    return y <= surfaceY(surface, x, z);
  };
  let prev = t;
  for (; t < tEnd; t += STEP) {
    if (origin.y + dir.y * t < -1.5) break;
    if (below(t)) {
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 12; i++) {
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
