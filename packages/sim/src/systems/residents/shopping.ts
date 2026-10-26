// Shopping (docs/spec/11-residents.md): when the pantry holds less than two days of food, one free
// grown-up walks to the nearest outlet with food (C3C's nearestOutletWithFood), carries back up to
// 4 units of the kind the pantry is lowest on, and goes again until the pantry is full or the
// outlet runs dry.
import { PANTRY_CAPACITY, PORTER_CARRY } from '../../constants';
import type { Household, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { nearestOutletWithFood, outletFood, takeFromOutlet } from '../economy/outlets';
import { moveResident } from '../movement/api';
import { foodIndexes, pantryFood } from './needs';
import { doorOf } from './places';
import { announceHousehold } from './records';

/** Pantry food the household wants on the shelf: two days' worth, capped by the pantry. */
export function pantryWant(h: Household): number {
  return Math.min(PANTRY_CAPACITY, 2 * Math.max(1, h.members.length));
}

export function needsShopping(h: Household): boolean {
  return pantryFood(h) < pantryWant(h);
}

/** True when some member of the household is already out shopping. */
export function someoneShopping(state: WorldState, h: Household): boolean {
  for (const id of h.members) {
    if (findById(state.residents, id)?.activity.kind === 'shop') return true;
  }
  return false;
}

/** Sends the resident to the nearest outlet with food. False when there is none or no way there. */
export function startShopping(state: WorldState, r: Resident, h: Household): boolean {
  const homeDoor = doorOf(state, h.homeId);
  if (homeDoor < 0) return false;
  const outlet = nearestOutletWithFood(state, homeDoor);
  if (!outlet) return false;
  const door = doorOf(state, outlet);
  if (door < 0) return false;
  const res = moveResident(state, r, door, 'shop');
  if (res === 'unreachable') return false;
  r.activity = { kind: 'shop', outlet, carrying: 0 };
  return true;
}

/** At the outlet's door: takes up to 4 units of the food the pantry is lowest on, then heads home. */
export function buyAtOutlet(state: WorldState, r: Resident, h: Household): void {
  if (r.activity.kind !== 'shop') return;
  const outlet = r.activity.outlet;
  const room = PANTRY_CAPACITY - pantryFood(h);
  const want = Math.min(PORTER_CARRY, room);
  let took = 0;
  if (want > 0) {
    // The kind lowest in the pantry first; ties by good index.
    const order = [...foodIndexes()].sort((a, b) => (h.pantry[a] ?? 0) - (h.pantry[b] ?? 0) || a - b);
    for (const g of order) {
      took = takeFromOutlet(state, outlet, g, want);
      if (took > 0) {
        r.carry = [g, took];
        break;
      }
    }
  }
  r.activity = { kind: 'shop', outlet, carrying: took };
  const homeDoor = doorOf(state, h.homeId);
  if (homeDoor >= 0) moveResident(state, r, homeDoor, 'shop');
}

/** Puts carried food in the pantry. Returns true when another trip is worth making. */
export function unpack(state: WorldState, ctx: TickCtx, r: Resident, h: Household): boolean {
  let more = false;
  if (r.carry) {
    const [g, qty] = r.carry;
    h.pantry[g] = (h.pantry[g] ?? 0) + qty;
    r.carry = null;
    announceHousehold(state, ctx, h.id);
    more = true;
  }
  if (r.activity.kind !== 'shop') return false;
  const outlet = r.activity.outlet;
  return more && pantryFood(h) < PANTRY_CAPACITY && outletFood(state, outlet) > 0;
}
