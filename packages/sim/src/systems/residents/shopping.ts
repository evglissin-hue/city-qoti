// Shopping (docs/spec/11-residents.md): when the pantry holds less than two days of food, one free
// grown-up walks to the nearest outlet with food (C3C's nearestOutletWithFood), carries back up to
// 4 units of the kind the pantry is lowest on, and goes again until the pantry is full or the
// outlet runs dry.
import { MAP_SIZE, PANTRY_CAPACITY, PORTER_CARRY } from '../../constants';
import type { Household, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { nearestOutletWithFood, outletFood, takeFromOutlet } from '../economy/outlets';
import { isMarketDay, MARKET_CARRY } from '../festivals/levers';
import { marketOpen, outletFree, outletsWith, tillPrice } from '../market/api';
import { shopFood } from '../market/baskets';
import { isTreat } from '../market/round';
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

/** Cheapest food on one outlet's shelf at the till, pennies (Infinity when it holds none). */
function cheapestOn(state: WorldState, outlet: number): number {
  let best = Infinity;
  for (const g of foodIndexes())
    if (outletFree(state, outlet, g) > 0) best = Math.min(best, tillPrice(state, g));
  return best;
}

/** How far (tiles, straight line) a household will walk past its nearest shelf for cheaper food: a stall's reach. */
const CHEAPER_SHELF_REACH = 14;

/**
 * P3A (meals): where a household shops. The nearest outlet with food, except that a household whose
 * purse cannot pay tomorrow's breakfast there walks to the shelf in reach with the cheapest food
 * (a stall that held only dear fish while grain sat on the next street fed nobody).
 */
export function shopOutlet(state: WorldState, h: Household, homeDoor: number): number {
  const near = nearestOutletWithFood(state, homeDoor);
  if (!near || !marketOpen(state)) return near;
  const short = Math.max(1, h.members.length) - pantryFood(h);
  const here = cheapestOn(state, near);
  if (short <= 0 || h.savings >= here * short) return near;
  const hx = homeDoor % MAP_SIZE;
  const hz = Math.floor(homeDoor / MAP_SIZE);
  let best = near;
  let bestPrice = here;
  let bestD = Infinity;
  const seen = new Set<number>();
  for (const g of foodIndexes()) {
    for (const id of outletsWith(state, g)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const door = doorOf(state, id);
      if (door < 0) continue;
      const dx = (door % MAP_SIZE) - hx;
      const dz = Math.floor(door / MAP_SIZE) - hz;
      if (dx * dx + dz * dz > CHEAPER_SHELF_REACH * CHEAPER_SHELF_REACH) continue;
      const price = cheapestOn(state, id);
      const d = dx * dx + dz * dz;
      if (price < bestPrice || (price === bestPrice && id !== near && best !== near && d < bestD)) {
        best = id;
        bestPrice = price;
        bestD = d;
      }
    }
  }
  return best;
}

/** Sends the resident to the nearest outlet with food. False when there is none or no way there. */
export function startShopping(state: WorldState, r: Resident, h: Household): boolean {
  const homeDoor = doorOf(state, h.homeId);
  if (homeDoor < 0) return false;
  const outlet = shopOutlet(state, h, homeDoor);
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
  // I3 (C5B): on market day shoppers bring home more a trip.
  // P3A (meals): a basket for tomorrow's breakfast is as big as the household is (a household of
  // five fetched four a trip, so one trip a day never covered it).
  const carry = Math.max(
    PORTER_CARRY * (isMarketDay(state) ? MARKET_CARRY : 1),
    marketOpen(state) ? h.members.length - pantryFood(h) : 0,
  );
  const want = Math.min(carry, room);
  let took = 0;
  if (want > 0 && marketOpen(state)) {
    // I2 (C4A): with the market open, food is paid for at the till (systems/market/baskets.ts).
    const got = shopFood(state, h, outlet, want);
    if (got) {
      r.carry = got;
      took = got[1];
    }
  } else if (want > 0) {
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
    // R2B: a Treat in hand was bought on the evening round and is eaten, never put by.
    if (isTreat(g)) {
      r.carry = null;
      return false;
    }
    h.pantry[g] = (h.pantry[g] ?? 0) + qty;
    r.carry = null;
    announceHousehold(state, ctx, h.id);
    more = true;
  }
  if (r.activity.kind !== 'shop') return false;
  const outlet = r.activity.outlet;
  return more && pantryFood(h) < PANTRY_CAPACITY && outletFood(state, outlet) > 0;
}
