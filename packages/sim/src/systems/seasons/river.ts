// The frozen river (C5A; docs/spec/14-challenge.md, Seasons). From Winter day 2 to Spring day 1:
// no fishing (the yield hook gives fishers nothing), the water sawmill's wheel stands still, and
// the bank beside the ice is a skating outing for the evening (the schedule hook). Boats (C5B) and wolves (C5D) read isFrozen.
import type { BuildingDef, ProductionMethod } from '@qoti/content';
import type { Activity, Building, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { doorOf } from '../residents/places';
import { dayIndex } from '../economy/time';
import { isFrozen } from './api';
import { nearestSpot } from './place';

/**
 * R1: the Sawmill no longer saws for the town (it lets carpenters set up in its reach), so the
 * frozen wheel costs nothing here. R1 stand-in (R1B): a frozen Sawmill serves one carpenter fewer.
 * Kept for callers: a method sawing timber by water saws at the full rate.
 */
export function handSawPermille(_method: ProductionMethod): number {
  return 1000;
}

/** A building on the water's edge that works the river: fishing, or a wheel. */
function onTheRiver(def: BuildingDef): boolean {
  return !!def.placement?.some((p) => p.kind === 'waterEdge');
}

/** Yield hook: fishers catch nothing while the river is frozen. */
export function frozenRiver(
  state: WorldState,
  _b: Building,
  def: BuildingDef,
  method: ProductionMethod,
): number {
  if (!isFrozen(state) || !onTheRiver(def)) return 1000;
  if (method.outputs.some(([g]) => g === 'fish')) return 0;
  return 1000;
}

/** Skating hours: after work until supper is cleared away. */
export const SKATING_HOURS = [17, 20] as const;
/** One in this many residents goes skating on a given evening (by id and day). */
export const SKATING_SHARE = 3;

/** Schedule hook: on a frozen evening some residents go skating by the bank nearest home. */
export function skating(state: WorldState, r: Resident, hour: number): Activity | null {
  if (!isFrozen(state) || hour < SKATING_HOURS[0] || hour >= SKATING_HOURS[1]) return null;
  if (r.stage === 'elder' || (r.id + dayIndex(state.tick)) % SKATING_SHARE !== 0) return null;
  const h = findById(state.households, r.householdId);
  if (!h) return null;
  const door = doorOf(state, h.homeId);
  if (door < 0) return null;
  const spot = nearestSpot(state, door);
  return spot < 0 ? null : { kind: 'leisure', tile: spot };
}

/** True while a resident is out on the ice (for the agent frame's skating flag). */
export function isSkating(state: WorldState, r: Resident): boolean {
  return isFrozen(state) && atSpot(state, r);
}

function atSpot(state: WorldState, r: Resident): boolean {
  if (r.activity.kind !== 'leisure') return false;
  const h = findById(state.households, r.householdId);
  if (!h) return false;
  const door = doorOf(state, h.homeId);
  return door >= 0 && nearestSpot(state, door) === r.activity.tile;
}
