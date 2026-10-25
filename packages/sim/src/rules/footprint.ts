import type { BuildingDef } from '@qoti/content';
import type { Rot4 } from '../contracts';

// Rotation r turns a building clockwise in quarter steps, seen from above (x east, z south):
// the entrance faces south at 0, west at 1, north at 2 and east at 3.

/** Footprint width and depth in tiles after rotation. */
export function footprintSize(def: BuildingDef, rot: Rot4): [number, number] {
  const [w, d] = def.size;
  return rot % 2 === 0 ? [w, d] : [d, w];
}

/** Maps a tile of the unrotated footprint (lx, lz) to its offset in the rotated footprint. */
export function rotateLocal(def: BuildingDef, rot: Rot4, lx: number, lz: number): [number, number] {
  const [w, d] = def.size;
  switch (rot) {
    case 0:
      return [lx, lz];
    case 1:
      return [d - 1 - lz, lx];
    case 2:
      return [w - 1 - lx, d - 1 - lz];
    case 3:
      return [lz, w - 1 - lx];
  }
}

const FACING: readonly [number, number][] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];

/** The direction the entrance faces after rotation. */
export function facing(rot: Rot4): [number, number] {
  return FACING[rot]!;
}

export function footprintTiles(def: BuildingDef, x: number, z: number, rot: Rot4): [number, number][] {
  const [w, d] = footprintSize(def, rot);
  const tiles: [number, number][] = [];
  for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) tiles.push([x + dx, z + dz]);
  return tiles;
}

/** The entrance tile and the tile in front of it, which must be a road for the building to work [I1]. */
export function entranceTiles(
  def: BuildingDef,
  x: number,
  z: number,
  rot: Rot4,
): { entrance: [number, number]; front: [number, number] } {
  const [ox, oz] = rotateLocal(def, rot, def.entrance[0], def.entrance[1]);
  const [fx, fz] = facing(rot);
  return { entrance: [x + ox, z + oz], front: [x + ox + fx, z + oz + fz] };
}
