// Population tiers (docs/spec/13-ledger.md, Population tiers; docs/build/i2-wave-notes.md). Daily
// at 05:00 each household is checked: failing its own tier counts days down (household.tierDays
// negative), and after TIER_DOWN_DAYS it slides back; meeting the next tier counts days up, and
// after TIER_UP_DAYS its home starts the upgrade (materials by porter, then the def swaps in
// place; see ./api). Anything else resets the count. Nothing moves until the valley unlocks a tier
// above Settlers (the Village Charter unlocks Craftsfolk), so a Hamlet plays as in I1.
import { content } from '@qoti/content';
import { TICKS_PER_DAY, TIER_DOWN_DAYS, TIER_UP_DAYS } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { dailyOffset } from '../economy/time';
import { checkTier, nextTier, slideBack, startUpgrade, tierContext, tierIndex, tiersActive } from './api';

/** One daily pass over every household (exported for tests). */
export function updateTiers(state: WorldState, ctx: TickCtx): void {
  if (!tiersActive(state)) return;
  const tc = tierContext(state);
  for (const h of state.households) {
    if (!h.homeId) continue;
    const home = findById(state.buildings, h.homeId);
    if (!home || home.stage !== 'built') continue;
    const days = h.tierDays ?? 0;
    const own = tierIndex(h.tier) > 0 ? content.basketByTier.get(h.tier) : undefined;
    if (own && checkTier(state, tc, h, own, false).missing.length > 0) {
      h.tierDays = Math.min(0, days) - 1;
      if (h.tierDays <= -TIER_DOWN_DAYS) slideBack(state, ctx, h);
      continue;
    }
    const next = nextTier(state, h.tier);
    const basket = next ? content.basketByTier.get(next) : undefined;
    if (!next || !basket || home.rt?.upgrade || checkTier(state, tc, h, basket, true).missing.length > 0) {
      // An upgrade under way keeps its count; it finishes when the materials are in.
      if (!home.rt?.upgrade) h.tierDays = 0;
      continue;
    }
    h.tierDays = Math.max(0, days) + 1;
    if (h.tierDays >= TIER_UP_DAYS) startUpgrade(state, ctx, h, next);
  }
}

export const tiers: System = {
  id: 'tiers',
  order: 58,
  every: TICKS_PER_DAY,
  offset: dailyOffset(5),
  tick(state, ctx) {
    updateTiers(state, ctx);
  },
};
