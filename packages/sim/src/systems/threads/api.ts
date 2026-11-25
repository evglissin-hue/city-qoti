// Follow the thread's counts (R3D; docs/spec/17-presentation.md, Follow the thread): for each pair of
// doors and a good, a decaying count of what went from one to the other (maker to store, store to
// outlet, outlet to home or place), halved at midnight like the flows overlay's. recordThread is
// called at every write point (porters' and carts' deliveries in logistics `deliver`, a household's
// purchase at an outlet in market `purchase`, a Treat at a stop or in a Hamlet in market trade's
// `sellTreat`, a Hamlet shopping trip in residents/shopping.ts).
//
// The table is one array sorted by (from, to, place, good), so a write is a binary search and, for a
// new pair, one splice; the pairs leaving one door sit together, so the bound per door is checked on
// that door's run alone. Never a scan of the town at a write.
import { THREAD_PAIRS_PER_DOOR } from '../../constants';
import type { EntityId, PlaceId, ThreadPair, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** Orders two pairs' keys: from, then to, then place (absent first), then good. */
export function comparePairKey(
  a: ThreadPair,
  from: EntityId,
  to: EntityId,
  place: PlaceId | undefined,
  good: number,
): number {
  if (a.from !== from) return a.from - from;
  if (a.to !== to) return a.to - to;
  if (a.place !== place) {
    if (a.place === undefined) return -1;
    if (place === undefined) return 1;
    return a.place < place ? -1 : 1;
  }
  return a.good - good;
}

/** The first index whose key is not below (from, to, place, good). The compare is inlined: it runs on every write. */
function lowerBound(
  pairs: readonly ThreadPair[],
  from: EntityId,
  to: EntityId,
  place: PlaceId | undefined,
  good: number,
): number {
  let lo = 0;
  let hi = pairs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const p = pairs[mid]!;
    let below: boolean;
    if (p.from !== from) below = p.from < from;
    else if (p.to !== to) below = p.to < to;
    else if (p.place !== place) below = p.place === undefined || (place !== undefined && p.place < place);
    else below = p.good < good;
    if (below) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The run of pairs leaving `from`: [start, end). */
export function pairsFrom(pairs: readonly ThreadPair[], from: EntityId): [number, number] {
  let lo = 0;
  let hi = pairs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pairs[mid]!.from < from) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  hi = pairs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pairs[mid]!.from <= from) lo = mid + 1;
    else hi = mid;
  }
  return [start, lo];
}

/**
 * Keeps at most THREAD_PAIRS_PER_DOOR pairs of one good leaving `from`: the strongest stay, and
 * between equals the one with the lower key (the door's run is in key order, so the later one goes).
 * Bounded by door and good, not by door alone: an outlet sells each good to dozens of homes, and a
 * bound on the door would let its bread crowd out its candles and leave most homes with no thread
 * (measured on the day-70 willow Village: 8 a door kept half the homes, 8 a good nearly all).
 */
function bound(pairs: ThreadPair[], from: EntityId, good: number): void {
  const [start, end] = pairsFrom(pairs, from);
  if (end - start <= THREAD_PAIRS_PER_DOOR) return;
  let count = 0;
  let weakest = -1;
  for (let i = start; i < end; i++) {
    const p = pairs[i]!;
    if (p.good !== good) continue;
    count++;
    // `<=`: of equal units the later key goes.
    if (weakest < 0 || p.units <= pairs[weakest]!.units) weakest = i;
  }
  if (count > THREAD_PAIRS_PER_DOOR) pairs.splice(weakest, 1);
}

/**
 * `qty` units of good index `good` went from building `from` to `to`: a building id (a store, an
 * outlet, a home) or a PlaceId (a Treat bought at a stop and enjoyed there).
 */
export function recordThread(
  state: WorldState,
  from: EntityId,
  to: EntityId | PlaceId,
  good: number,
  qty: number,
): void {
  if (qty <= 0 || from === to || !isStandard(state)) return;
  const pairs = state.threads.pairs;
  const toId = typeof to === 'number' ? to : 0;
  const place = typeof to === 'string' ? to : undefined;
  const i = lowerBound(pairs, from, toId, place, good);
  const at = pairs[i];
  if (at && comparePairKey(at, from, toId, place, good) === 0) {
    at.units += qty;
    return;
  }
  const pair: ThreadPair =
    place === undefined ? { from, to: toId, good, units: qty } : { from, to: 0, place, good, units: qty };
  pairs.splice(i, 0, pair);
  bound(pairs, from, good);
}
