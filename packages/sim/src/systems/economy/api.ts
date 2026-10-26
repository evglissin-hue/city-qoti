// Budget hooks used by commands (C3.0 contract; C3C owns the implementation).
// Sandbox valleys never charge. Standard valleys charge coins at placement and painting, refund on
// cancel or removal, and refuse new construction during lean times.
import type { BuildingDef } from '@qoti/content';
import { LEDGER_CATEGORIES, type LedgerCategoryId } from '../../constants';
import type { Building, RejectReason, RoadKind, TickCtx, WorldState } from '../../contracts';

/** Validate hook for build.place: CANNOT_AFFORD or LEAN_TIMES, else null. Pure. */
export function placementBlocked(_state: WorldState, _def: BuildingDef): RejectReason | null {
  return null; // C3C
}

/** Apply hook for build.place, after the site exists: deducts coins, records ConstructionState.paid. */
export function chargePlacement(_state: WorldState, _ctx: TickCtx, _b: Building, _def: BuildingDef): void {
  // C3C
}

/**
 * Apply hook for build.remove, before the building leaves state: refunds coins for unfinished sites,
 * returns delivered materials and buffers to the nearest storehouse, cancels porter jobs.
 */
export function refundRemoval(_state: WorldState, _ctx: TickCtx, _b: Building, _def: BuildingDef): void {
  // C3C
}

/** Validate hook for road.paint: CANNOT_AFFORD or LEAN_TIMES, else null. Pure. */
export function roadBlocked(_state: WorldState, _kind: RoadKind, _newTiles: number): RejectReason | null {
  return null; // C3C
}

/** Apply hook for road.paint: charges for tiles that were not road before. */
export function chargeRoad(_state: WorldState, _ctx: TickCtx, _kind: RoadKind, _newTiles: number): void {
  // C3C
}

/** Moves money and books it (pennies; positive amounts, the category says income or expense). */
export function book(state: WorldState, category: LedgerCategoryId, pennies: number): void {
  const i = LEDGER_CATEGORIES.findIndex((c) => c.id === category);
  if (i < 0 || pennies === 0) return;
  const e = state.economy;
  e.treasury += LEDGER_CATEGORIES[i]!.kind === 'income' ? pennies : -pennies;
  e.today.money[i]! += pennies;
  e.season.money[i]! += pennies;
}
