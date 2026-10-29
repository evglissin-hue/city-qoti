import type { BuildingDef } from '@qoti/content';
import { entranceTiles, footprintSize, MAP_SIZE, type MapReader, type Rot4 } from '@qoti/sim';

/**
 * The level a building stands at, as drawn (the sim never reads it). The whole footprint is one
 * flat pad at its door's level, so the door meets the road in front of it; tiles of the footprint
 * that lie higher are cut down to it and lower ones are banked up, and the ground eases from the
 * pad to the hillside around it. A door over water (a dock) stands on the highest dry tile instead.
 */
export function padLevel(
  reader: Pick<MapReader, 'height' | 'water'>,
  def: BuildingDef | undefined,
  x: number,
  z: number,
  rot: Rot4,
): number {
  if (!def) return reader.height(x, z);
  const { entrance } = entranceTiles(def, x, z, rot);
  const [ex, ez] = entrance;
  if (ex >= 0 && ez >= 0 && ex < MAP_SIZE && ez < MAP_SIZE && !reader.water(ex, ez))
    return reader.height(ex, ez);
  const [w, d] = footprintSize(def, rot);
  let hi = -1;
  for (let tz = z; tz < z + d; tz++) {
    for (let tx = x; tx < x + w; tx++) {
      if (tx < 0 || tz < 0 || tx >= MAP_SIZE || tz >= MAP_SIZE || reader.water(tx, tz)) continue;
      hi = Math.max(hi, reader.height(tx, tz));
    }
  }
  return hi < 0 ? reader.height(x, z) : hi;
}
