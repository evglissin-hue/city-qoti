import type { FlavorLike, NeedsBasket } from './types';

// What each tier wants, by family (docs/spec/13-ledger.md, Households: amount and variety, and
// Population tiers), written in R1.0. Amounts are a resident's a day unless `perHousehold`; Fuel is
// a household's on a winter day (the warmth pass at 07:30 buys it). Variety is the number of a
// family's flavors a household wants on offer over the last three days. No tier names a single good,
// so a town with no windmill reaches Craftsfolk on porridge, fish and cheese. Every number tunes in
// R1X. Merchants and Patrons arrive with I4 and I5.

export const craftsfolk: NeedsBasket = {
  tier: 'craftsfolk',
  wants: [
    { family: 'food', amount: 1, variety: 3 },
    { family: 'fuel', amount: 1, perHousehold: true, season: 3, variety: 0 },
    { family: 'wares', amount: 0.2, perHousehold: true, variety: 1 },
    { family: 'treats', amount: 0.2, variety: 1 },
  ],
  services: ['health', 'social'],
  charm: 25,
  // R1X: 12 (was 20): households spend most of what they earn on their baskets, and twenty coins
  // put by kept nearly every household from moving up at day 70 on every seed.
  savings: 12,
};

export const settler: NeedsBasket = {
  tier: 'settler',
  wants: [
    { family: 'food', amount: 1, variety: 1 },
    { family: 'fuel', amount: 1, perHousehold: true, season: 3, variety: 0 },
    { family: 'wares', amount: 0, perHousehold: true, variety: 0 },
    { family: 'treats', amount: 0.1, variety: 0 },
  ],
  services: [],
  charm: 0,
  savings: 0,
};

/**
 * Favorite flavors (R1A): a household with a member of the species or trait likes the good twice as
 * much as a plain flavor, so it pays a little more for it and buys it first at an even price. Sorted
 * by `who`, then `good`. Every number tunes in R1X.
 */
export const flavorLikes: readonly FlavorLike[] = [
  { who: 'badger', good: 'bread', weight: 2 },
  { who: 'fox', good: 'cheese', weight: 2 },
  { who: 'hedgehog', good: 'fruit', weight: 2 },
  { who: 'mouse', good: 'cheese', weight: 2 },
  { who: 'otter', good: 'fish', weight: 2 },
  { who: 'rabbit', good: 'vegetables', weight: 2 },
  { who: 'squirrel', good: 'fruit', weight: 2 },
  { who: 'sweet-tooth', good: 'cider', weight: 2 },
  { who: 'sweet-tooth', good: 'honey', weight: 2 },
];
