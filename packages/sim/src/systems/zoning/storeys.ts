// Floors by tier and row (docs/build/i4-visual-planning-notes.md, V2 item 4; V3B draws them as the
// kit's `params.storeys`). The sim chooses them, deterministically, and saves them on the building
// (Building.storeys), so both seats see one skyline.
import { content, type BuildingDef } from '@qoti/content';
import type { Lot, WorldState } from '../../contracts';

/** The cozy ceiling outside landmarks (18-eras.md). */
export const MAX_STOREYS = 4;

/** Storeys by the tier a home houses: a Settler cottage one and a half, up to a Merchants' townhouse three. */
const HOME_STOREYS: readonly [tier: string, storeys: number][] = [
  ['settler', 1.5],
  ['craftsfolk', 2],
  ['merchant', 3],
  ['patron', 3],
];

/** Storeys by business level 1 to 3. */
const BUSINESS_STOREYS: readonly number[] = [1, 1.5, 2];

/**
 * The storeys of a building growing on a lot, in half-storey steps.
 *
 * R2 stand-in (R2F): by the home's tier or the business's level alone. R2F reads the row (neighbors
 * step by at most one storey, a later lot fits the row it joins) and keeps them right as homes move up
 * a tier and businesses a level, from its hourly lot pass.
 */
export function storeysFor(_state: WorldState, _lot: Lot, def: BuildingDef, level = 1): number {
  const business = content.trades.some((t) => t.building === def.id);
  if (def.housing && !business) {
    const tier = def.tier ?? 'settler';
    return HOME_STOREYS.find(([t]) => t === tier)?.[1] ?? 1;
  }
  return BUSINESS_STOREYS[Math.max(0, Math.min(BUSINESS_STOREYS.length - 1, level - 1))]!;
}
