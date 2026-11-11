// A seat faces what is worth looking at (docs/spec/12-hearth.md, Decorating that composes itself).
// Pure functions over a MapReader, so the decor tool's ghost and the tests use the same rule.
import type { DecorDef } from '@qoti/content';
import { DECOR_ROTATIONS, rotationForDirection, TILE_FP, type MapReader } from '@qoti/sim';

/** Water this close (tiles) is worth facing. */
export const SEAT_WATER_RANGE = 4;
/** How far (tiles) the open-side scan looks. */
export const SEAT_OPEN_RANGE = 3;
/** How far (tiles) the last-resort path scan looks. */
export const SEAT_PATH_RANGE = 5;

/**
 * Art: every bench kit (bench, curved-bench, arbor seat) is built with its back to local +z, so its
 * front is local -z. Rotation k turns local +x to the world direction of rotation k, which puts the
 * front a quarter turn (16 steps) behind the direction the rotation names: to face direction d, a
 * seat takes rotationForDirection(d) + 16.
 */
export const SEAT_FRONT_OFFSET = DECOR_ROTATIONS / 4;

/** A bench you sit on (not the ring bench, which has no front, nor walls or tables that seat). */
export function isFacingSeat(def: DecorDef): boolean {
  return def.tags.includes('seat') && def.tags.includes('bench') && !def.tags.includes('ring-bench');
}

/** The rotation that makes a seat's front look along (dx, dz). */
export function rotationFacing(dx: number, dz: number): number {
  return (rotationForDirection(dx, dz) + SEAT_FRONT_OFFSET) % DECOR_ROTATIONS;
}

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function nearest(
  reader: MapReader,
  tx: number,
  tz: number,
  range: number,
  hit: (x: number, z: number) => boolean,
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let z = tz - range; z <= tz + range; z++) {
    for (let x = tx - range; x <= tx + range; x++) {
      if (x < 0 || z < 0 || x >= reader.size || z >= reader.size) continue;
      const d = (x - tx) * (x - tx) + (z - tz) * (z - tz);
      if (d > range * range || d >= bestD || !hit(x, z)) continue;
      best = [x, z];
      bestD = d;
    }
  }
  return best;
}

/** Open, unoccupied, non-road ground at a tile. */
function openGround(reader: MapReader, x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= reader.size || z >= reader.size) return false;
  return !reader.water(x, z) && !reader.occupant(x, z) && !reader.road(x, z) && !reader.tree(x, z);
}

/**
 * The rotation a seat takes at (fx, fz) when the player has not turned it: toward the nearest open
 * water within 4 tiles, else toward the open side (the one of 8 directions with the most open
 * ground within 3 tiles, when some side is more open than another), else toward the nearest path or
 * road. Null when nothing is worth facing (the caller keeps rotation 0).
 */
export function seatRotation(reader: MapReader, fx: number, fz: number): number | null {
  const tx = Math.floor(fx / TILE_FP);
  const tz = Math.floor(fz / TILE_FP);

  const water = nearest(reader, tx, tz, SEAT_WATER_RANGE, (x, z) => !!reader.water(x, z));
  if (water) return rotationFacing(water[0] - tx, water[1] - tz);

  let best = -1;
  let worst = Infinity;
  let bestDir = DIRS[0]!;
  for (const dir of DIRS) {
    let open = 0;
    for (let step = 1; step <= SEAT_OPEN_RANGE; step++) {
      if (openGround(reader, tx + dir[0] * step, tz + dir[1] * step)) open++;
    }
    if (open > best) {
      best = open;
      bestDir = dir;
    }
    worst = Math.min(worst, open);
  }
  if (best > worst) return rotationFacing(bestDir[0], bestDir[1]);

  const path = nearest(reader, tx, tz, SEAT_PATH_RANGE, (x, z) => !!reader.road(x, z));
  if (path) return rotationFacing(path[0] - tx, path[1] - tz);
  return null;
}
