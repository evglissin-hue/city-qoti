// Evening trade's shared readings (docs/spec/19-evenings.md, Evening trade). R2B owns this file; R2A's
// place pass reads which outlets serve a place through it, never the shelves itself.
import { content } from '@qoti/content';
import { GOOD_FAMILIES } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { GOODS_BY_FAMILY } from '../../state/zones';

const TREATS: readonly number[] = GOODS_BY_FAMILY[GOOD_FAMILIES.indexOf('treats')] ?? [];

/**
 * Whether a building sells Treats to the round at all (a shop whose trade sells them at its level,
 * the tavern, a stall, a cafe): structural, so the place index may cache it.
 *
 * R2 stand-in (R2B): any built outlet or tavern.
 */
export function sellsTreats(_state: WorldState, b: Building): boolean {
  if (b.stage !== 'built') return false;
  const tags = content.buildingById.get(b.def)?.tags ?? [];
  return tags.includes('outlet') || tags.includes('tavern');
}

/** Whether it has a Treat on the shelf right now (read live; never cache it). */
export function treatsOnShelf(_state: WorldState, b: Building): boolean {
  const store = b.rt?.store;
  if (!store) return false;
  for (const g of TREATS) if ((store[g] ?? 0) - (b.rt?.reservedOut[g] ?? 0) > 0) return true;
  return false;
}
