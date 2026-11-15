// The night's building defs, looked up once. The growth pass walks the buildings a dozen times
// (services, census, stock, makers, signatures); each walk used to look the def up by its id, a
// string-keyed map read a building. `defsOf` does it once, in building order, and the walks read
// the array instead. A list is only used while it is as long as the buildings (`usable`), so a
// walk never reads a def that is not its building's: `syncDefs` brings one up to date when buildings
// are added at the end (growLot), and a caller with a stale one falls back to the lookup.
import { content, type BuildingDef } from '@qoti/content';
import type { WorldState } from '../../contracts';

export type Defs = readonly (BuildingDef | undefined)[];

/** Each building's def, in building order (undefined for a def content does not have). */
export function defsOf(state: WorldState): (BuildingDef | undefined)[] {
  const bs = state.buildings;
  const out = new Array<BuildingDef | undefined>(bs.length);
  for (let i = 0; i < bs.length; i++) out[i] = content.buildingById.get(bs[i]!.def);
  return out;
}

/**
 * Brings the list up to date with the buildings: those added at the end are looked up, and a list
 * that has more than the buildings (some were removed) is made again. Returns the list.
 */
export function syncDefs(state: WorldState, defs: (BuildingDef | undefined)[]): (BuildingDef | undefined)[] {
  const bs = state.buildings;
  if (defs.length > bs.length) return defsOf(state);
  for (let i = defs.length; i < bs.length; i++) defs.push(content.buildingById.get(bs[i]!.def));
  return defs;
}

/** The list when it matches the buildings one for one, else null (the walk looks each def up). */
export function usable(state: WorldState, defs: Defs | undefined): Defs | null {
  return defs && defs.length === state.buildings.length ? defs : null;
}
