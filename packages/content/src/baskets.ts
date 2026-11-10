import type { NeedsBasket } from './types';

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
  savings: 20,
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
