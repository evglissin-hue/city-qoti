import { MAP_SIZE } from '../constants';
import type { Decor, MapReader, WorldState } from '../contracts';
import { DecorGrid } from '../map/decorGrid';
import { createStateReader } from '../map/reader';

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
