import { content } from '@qoti/content';
import { MAX_ROAD_TILES, TILE_FP } from '../constants';
import type { MapReader, RejectReason, RoadKind, RoadPlacement } from '../contracts';
import { inBounds } from '../map/layers';
import { isTile, MAX_DECOR_RADIUS } from './geometry';

/**
 * Can a run of tiles be painted as `kind`? Any bad tile rejects the whole run and is reported
 * as firstBadTile. Bridges (roads over water) arrive with C2A.
 */
export function canPaintRoad(reader: MapReader, kind: RoadKind, tiles: [number, number][]): RoadPlacement {
  if (kind !== 'path' && kind !== 'lane') return { ok: false, reason: 'INVALID' };
  if (!Array.isArray(tiles) || tiles.length === 0) return { ok: false, reason: 'INVALID' };
  if (tiles.length > MAX_ROAD_TILES) return { ok: false, reason: 'TOO_MANY' };
  let prev: [number, number] | null = null;
  for (const tile of tiles) {
    if (!isTile(tile)) return { ok: false, reason: 'INVALID' };
    const [x, z] = tile;
    const bad = (reason: RejectReason): RoadPlacement => ({ ok: false, reason, firstBadTile: [x, z] });
    if (!inBounds(x, z, reader.size)) return bad('OUT_OF_BOUNDS');
    if (!reader.parcelUnlocked(x, z)) return bad('LOCKED_PARCEL');
    if (reader.water(x, z)) return bad('WATER');
    if (reader.occupant(x, z)) return bad('OCCUPIED');
    const cx = x * TILE_FP + TILE_FP / 2;
    const cz = z * TILE_FP + TILE_FP / 2;
    for (const d of reader.decorNear(cx, cz, TILE_FP + MAX_DECOR_RADIUS)) {
      const onTile = Math.floor(d.fx / TILE_FP) === x && Math.floor(d.fz / TILE_FP) === z;
      if (onTile && !content.decorById.get(d.def)?.onRoad) return bad('OCCUPIED');
    }
    if (prev && Math.abs(prev[0] - x) + Math.abs(prev[1] - z) === 1) {
      if (Math.abs(reader.height(x, z) - reader.height(prev[0], prev[1])) >= 2) return bad('TOO_STEEP');
    }
    prev = tile;
  }
  return { ok: true };
}
