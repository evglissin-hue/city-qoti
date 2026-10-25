import { MAP_SIZE } from '../constants';
import type { Decor, DecorView, MapReader, WorldState } from '../contracts';
import { DecorGrid } from '../map/decorGrid';
import { inBounds } from '../map/layers';

/** Derived lookups rebuilt from state on load. Never serialized, never hashed. */
export interface WorldIndex {
  decorGrid: DecorGrid<Decor>;
  reader: MapReader;
}

const indexes = new WeakMap<WorldState, WorldIndex>();

export function worldIndex(state: WorldState): WorldIndex {
  let index = indexes.get(state);
  if (!index) {
    const decorGrid = new DecorGrid<Decor>(MAP_SIZE);
    for (const d of state.decor) decorGrid.add(d);
    index = { decorGrid, reader: createStateReader(state, decorGrid) };
    indexes.set(state, index);
  }
  return index;
}

/** MapReader over the sim's own state. Out-of-bounds reads return 0. */
function createStateReader(state: WorldState, grid: DecorGrid<Decor>): MapReader {
  const S = MAP_SIZE;
  const m = state.map;
  const read = (layer: Uint8Array | Int32Array, x: number, z: number) =>
    inBounds(x, z, S) ? layer[z * S + x]! : 0;
  return {
    size: S,
    height: (x, z) => read(m.height, x, z),
    terrain: (x, z) => read(m.terrain, x, z),
    water: (x, z) => read(m.water, x, z),
    road: (x, z) => read(m.road, x, z),
    tree: (x, z) => read(m.tree, x, z),
    occupant: (x, z) => read(m.occupant, x, z),
    deposit: (x, z) => read(m.deposit, x, z),
    fertility: (x, z) => read(m.fertility, x, z),
    // Parcels unlock with progression [I4]; every parcel is open until then.
    parcelUnlocked: (x, z) => inBounds(x, z, S),
    decorNear: (fx, fz, radius) => grid.near(fx, fz, radius) as DecorView[],
  };
}
