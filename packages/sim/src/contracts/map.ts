// MapReader and placement results (docs/spec/20-architecture.md and 10-world-and-building.md).
// The sim reads its own state through MapReader; the client implements it on its Mirror,
// so ghost previews run the very same rules as the sim.
import type { RejectReason } from './commands';
import type { DecorView } from './views';

export interface MapReader {
  size: number;
  height(x: number, z: number): number;
  terrain(x: number, z: number): number;
  water(x: number, z: number): number;
  road(x: number, z: number): number;
  tree(x: number, z: number): number;
  occupant(x: number, z: number): number;
  deposit(x: number, z: number): number;
  fertility(x: number, z: number): number;
  parcelUnlocked(x: number, z: number): boolean;
  /** Decor whose center lies within `radius` (fixed point) of (fx, fz). */
  decorNear(fx: number, fz: number, radius: number): DecorView[];
}

export interface BuildingPlacement {
  ok: boolean;
  reason?: RejectReason;
  /** Footprint tiles. */
  tiles: [number, number][];
  /** Footprint height spread is 1: the renderer adds a stone plinth. */
  foundation: boolean;
  /** For example 'NO_ROAD' when the tile in front of the entrance is not a road. */
  warnings: string[];
}

export interface RoadPlacement {
  ok: boolean;
  reason?: RejectReason;
  firstBadTile?: [number, number];
}

export interface Placement {
  ok: boolean;
  reason?: RejectReason;
}
