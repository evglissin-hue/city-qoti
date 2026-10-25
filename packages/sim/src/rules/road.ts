import { content } from '@qoti/content';
import { MAX_ROAD_TILES, TILE_FP } from '../constants';
import type { MapReader, RejectReason, RoadKind, RoadPlacement } from '../contracts';
import { inBounds } from '../map/layers';
import { isTile, MAX_DECOR_RADIUS } from './geometry';

/**
 * Can a run of tiles be painted as `kind`? Any bad tile rejects the whole run and is reported
 * as firstBadTile. Water tiles form a bridge: at most MAX_BRIDGE_TILES in a straight line, with
 * land at both ends at height 0 or 1.
 */
/** Longest bridge, in water tiles. */
export const MAX_BRIDGE_TILES = 6;

export function canPaintRoad(reader: MapReader, kind: RoadKind, tiles: [number, number][]): RoadPlacement {
  if (kind !== 'path' && kind !== 'lane') return { ok: false, reason: 'INVALID' };
  if (!Array.isArray(tiles) || tiles.length === 0) return { ok: false, reason: 'INVALID' };
  if (tiles.length > MAX_ROAD_TILES) return { ok: false, reason: 'TOO_MANY' };
  let prev: [number, number] | null = null;
  for (let k = 0; k < tiles.length; k++) {
    const tile = tiles[k]!;
    if (!isTile(tile)) return { ok: false, reason: 'INVALID' };
    const [x, z] = tile;
    const bad = (reason: RejectReason): RoadPlacement => ({ ok: false, reason, firstBadTile: [x, z] });
    if (!inBounds(x, z, reader.size)) return bad('OUT_OF_BOUNDS');
    if (!reader.parcelUnlocked(x, z)) return bad('LOCKED_PARCEL');
    if (reader.water(x, z) && !(prev && reader.water(prev[0], prev[1]))) {
      // The first water tile of a span: the whole span must make a sound bridge.
      let end = k;
      while (end < tiles.length && isTile(tiles[end]) && reader.water(tiles[end]![0], tiles[end]![1])) end++;
      const before = prev;
      const after = end < tiles.length && isTile(tiles[end]) ? tiles[end]! : null;
      const lowLand = (t: [number, number] | null) =>
        !!t && !reader.water(t[0], t[1]) && reader.height(t[0], t[1]) <= 1;
      const straight = (t: [number, number] | null) => !!t && (t[0] === x || t[1] === z);
      if (
        end - k > MAX_BRIDGE_TILES ||
        !lowLand(before) ||
        !lowLand(after) ||
        !straight(before) ||
        !straight(after)
      )
        return bad('WATER');
    }
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
