// Follow the thread's counts (R3D; docs/spec/17-presentation.md, Follow the thread): for each pair of
// doors and a good, a decaying count of what went from one to the other (maker to store, store to
// outlet, outlet to home or place), halved at midnight like the flows overlay's. R3.0 calls
// recordThread at every write point (porters' and carts' deliveries in logistics `deliver`, a
// household's purchase at an outlet in market `purchase`, a Treat at a stop or in a Hamlet in market
// trade's `sellTreat`, a Hamlet shopping trip in residents/shopping.ts); R3D writes the body.
import type { EntityId, PlaceId, WorldState } from '../../contracts';

/**
 * `qty` units of good index `good` went from building `from` to `to`: a building id (a store, an
 * outlet, a home) or a PlaceId (a Treat bought at a stop and enjoyed there).
 */
export function recordThread(
  _state: WorldState,
  _from: EntityId,
  _to: EntityId | PlaceId,
  _good: number,
  _qty: number,
): void {
  // R3 stand-in (R3D): nothing is counted.
}
