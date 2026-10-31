// The frozen river (C5A; docs/spec/14-challenge.md, Seasons). From Winter day 2 to Spring day 1:
// no fishing (the yield hook gives fishers nothing), the water sawmill's wheel stands still and its
// crew saws by hand at sawpit rate (it must never stop planks), and the bank beside the ice is a
// skating outing for the evening (the schedule hook). Boats (C5B) and wolves (C5D) read isFrozen.
import { content, type BuildingDef, type ProductionMethod } from '@qoti/content';
import type { Activity, Building, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { doorOf } from '../residents/places';
import { dayIndex } from '../economy/time';
import { isFrozen } from './api';
import { nearestSpot } from './place';

/** Planks an hour from a method, per its crew. */
function planksPerHour(method: ProductionMethod | undefined): number {
  if (!method || method.hours <= 0) return 0;
  const q = method.outputs.find(([g]) => g === 'planks')?.[1] ?? 0;
  return q / method.hours;
}

let handRate = -1;

/** The hand sawpit's rate as a share of a water-powered method, permille. */
export function handSawPermille(method: ProductionMethod): number {
  if (handRate < 0) handRate = planksPerHour(content.buildingById.get('sawpit')?.methods?.[0]);
  const water = planksPerHour(method);
  if (water <= 0 || handRate <= 0) return 1000;
  return Math.min(1000, Math.round((handRate * 1000) / water));
}

/** A building on the water's edge that works the river: fishing, or a wheel. */
function onTheRiver(def: BuildingDef): boolean {
  return !!def.placement?.some((p) => p.kind === 'waterEdge');
}

/** Yield hook: fishers catch nothing and water wheels fall back to hand sawing while frozen. */
export function frozenRiver(
  state: WorldState,
  _b: Building,
  def: BuildingDef,
  method: ProductionMethod,
): number {
  if (!isFrozen(state) || !onTheRiver(def)) return 1000;
  if (method.outputs.some(([g]) => g === 'fish')) return 0;
  if (method.outputs.some(([g]) => g === 'planks')) return handSawPermille(method);
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
