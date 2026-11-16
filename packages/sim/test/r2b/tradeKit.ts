// R2B test kit for the evening trade tests: stalls, rounds and owed Treats set by hand (R2A's planner
// is a stand-in). Not a test file; the tests mock `systems/places/api` themselves (see stubPlaces.ts).
import { content } from '@qoti/content';
import { RoundFlags, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, EntityId, Household, Resident, RoundStop, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { basketGroups, ensureBasket } from '../../src/systems/market/baskets';
import { dayIndex } from '../../src/systems/economy/time';
import { doorTile } from '../../src/systems/movement/api';

/** Tick of `hour`:00 (06:00 or later) on day index `day`, plus `extra` ticks. */
export const tickAt = (day: number, hour: number, extra = 0): number =>
  day * TICKS_PER_DAY + (hour - 6) * TICKS_PER_HOUR + extra;

export const goodIx = (id: string): number => content.goodIndex.get(id)!;

/** Builds a market stall (or another def) on open ground. */
export function addOutlet(state: WorldState, def: string, x: number, z: number): Building {
  return insertBuilding(state, null, content.buildingById.get(def)!, x, z, 0, 0, { site: false });
}

/** Sets an outlet's shelf to `n` of each Treat (cider, honey), nothing reserved. */
export function stockTreats(b: Building, n: number): void {
  b.rt!.reservedOut.fill(0);
  for (const id of ['cider', 'honey']) b.rt!.store[goodIx(id)] = n;
}

/** Units of Treats on an outlet's shelf. */
export function treatCount(b: Building): number {
  return goodIx('cider') >= 0 ? (b.rt!.store[goodIx('cider')] ?? 0) + (b.rt!.store[goodIx('honey')] ?? 0) : 0;
}

/** What a household is owed of Treats, in units. */
export function owe(h: Household, units: number): void {
  const b = ensureBasket(h)!;
  const i = basketGroups(b).findIndex((g) => g.id === 'treats');
  h.owed![i] = Math.round(units * 100);
}

export function owedHundredths(h: Household): number {
  const b = ensureBasket(h)!;
  return h.owed![basketGroups(b).findIndex((g) => g.id === 'treats')]!;
}

/** A stop already arrived at (`arrived` tick), or still ahead when `arrived` is -1. */
export function stop(place: string, tile: number, arrived: number): RoundStop {
  return { place, kind: 'sit', tile, draw: 50, flags: arrived >= 0 ? RoundFlags.arrived : 0, arrived };
}

/** Stands a resident at a tile outdoors, still, with a round planned today (R2A's `roundDay`). */
export function standAt(r: Resident, tile: number, round: RoundStop[], state: WorldState): void {
  r.tile = tile;
  r.inside = 0;
  r.move = null;
  r.carry = null;
  r.round = round;
  r.roundDay = dayIndex(state.tick);
}

/** Puts a resident on the move (any non-null path). */
export function walkAt(r: Resident, tile: number, round: RoundStop[], state: WorldState): void {
  standAt(r, tile, round, state);
  r.move = { path: [tile], step: 0, progress: 0, target: tile, reason: 'leisure', version: 0 };
}

export const doorOf = (b: Building): number => doorTile(b);

export function resident(state: WorldState, id: EntityId): Resident {
  return findById(state.residents, id)!;
}
