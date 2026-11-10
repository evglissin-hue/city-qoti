// Specialized buildings' reach and capacity (docs/spec/13-ledger.md, Land and specialized buildings;
// docs/build/r1-wave-notes.md, Cross-track APIs). Signatures fixed by R1.0; R1B owns the insides
// and the system. R1C's ghost ring and Businesses book, and R1A's granary draw, read these.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { hasTag } from '../../state/zones';
import { doorTile } from '../movement/api';

const S = MAP_SIZE;

/** Tiles between two tile indexes, Manhattan. R1 stand-in (R1B): walking distance along roads. */
function gap(a: number, b: number): number {
  return Math.abs((a % S) - (b % S)) + Math.abs(Math.floor(a / S) - Math.floor(b / S));
}

/** True when a tile (index) lies within the specialized building's reach of its door. */
export function withinReach(state: WorldState, specialized: Building, tile: number): boolean {
  const def = content.buildingById.get(specialized.def);
  if (!def?.reach) return false;
  void state;
  return gap(doorTile(specialized, def), tile) <= def.reach;
}

/** Businesses of the trades it enables standing in its reach (for a windmill: its bakers). */
export function served(state: WorldState, specialized: Building): number {
  const def = content.buildingById.get(specialized.def);
  if (!def?.enables?.length) return 0;
  let n = 0;
  for (const b of state.buildings) {
    if (b.id === specialized.id || !def.enables.some((t) => hasTag(b, t))) continue;
    if (withinReach(state, specialized, doorTile(b))) n++;
  }
  return n;
}

/**
 * How many it may serve. R1 stand-in (R1B): the def's capacity; the Windmill's raised capacity
 * (4 when it stands 4+ levels above the ground around it) is R1B's.
 */
export function capacityOf(state: WorldState, specialized: Building): number {
  void state;
  return content.buildingById.get(specialized.def)?.capacity ?? 0;
}
