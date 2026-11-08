import { TILE_FP } from '../constants';
import type { MapReader, Placement } from '../contracts';
import { inBounds, Terrain } from '../map/layers';
import { isInt, MAX_DECOR_RADIUS } from './geometry';

const PLANTABLE: ReadonlySet<number> = new Set<number>([Terrain.grass, Terrain.meadow, Terrain.forestFloor]);

/** Can a sapling go on tile (x, z)? Grass, meadow or forest floor, nothing else on the tile. */
export function canPlantTree(reader: MapReader, x: number, z: number): Placement {
  if (!isInt(x) || !isInt(z)) return { ok: false, reason: 'INVALID' };
  if (!inBounds(x, z, reader.size)) return { ok: false, reason: 'OUT_OF_BOUNDS' };
  if (!reader.parcelUnlocked(x, z)) return { ok: false, reason: 'LOCKED_PARCEL' };
  if (reader.water(x, z)) return { ok: false, reason: 'WATER' };
  if (reader.road(x, z) || reader.occupant(x, z) || reader.tree(x, z))
    return { ok: false, reason: 'OCCUPIED' };
  if (!PLANTABLE.has(reader.terrain(x, z))) return { ok: false, reason: 'NOT_ALLOWED' };
  const cx = x * TILE_FP + TILE_FP / 2;
  const cz = z * TILE_FP + TILE_FP / 2;
  for (const d of reader.decorNear(cx, cz, TILE_FP + MAX_DECOR_RADIUS)) {
    if (Math.floor(d.fx / TILE_FP) === x && Math.floor(d.fz / TILE_FP) === z)
      return { ok: false, reason: 'OCCUPIED' };
  }
  return { ok: true };
}
