import type { NeedsBasket } from './types';

// Needs baskets per tier (docs/spec/13-ledger.md, Market and prices, Population tiers). Seeded in
// C4.0 for Settlers and Craftsfolk; C4A buys from them, C4C's tiers read them, both tune the numbers.

export const craftsfolk: NeedsBasket = {
  tier: 'craftsfolk',
  groups: [
    {
      id: 'food',
      name: 'Food',
      perDay: 1,
      goods: [
        ['bread', 3],
        ['cheese', 3],
        ['fish', 2],
        ['vegetables', 2],
        ['apples', 2],
        ['milk', 1],
      ],
    },
    { id: 'bread', name: 'Bread', perDay: 0.3, goods: [['bread', 1]] },
    { id: 'firewood', name: 'Firewood', perDay: 1, perHousehold: true, goods: [['firewood', 1]] },
    { id: 'cloth', name: 'Cloth', perDay: 0.1, goods: [['cloth', 1]] },
    {
      id: 'treats',
      name: 'Treats',
      perDay: 0.2,
      goods: [
        ['cider', 2],
        ['cheese', 1],
      ],
    },
  ],
  services: ['health', 'social'],
  charm: 25,
  // C4X: 20 coins put by (30 kept half the households from ever moving up on a Settler's wage).
  savings: 20,
};

export const settler: NeedsBasket = {
  tier: 'settler',
  groups: [
    {
      id: 'food',
      name: 'Food',
      perDay: 1,
      goods: [
        ['bread', 2],
        ['fish', 2],
        ['vegetables', 1],
        ['apples', 1],
        ['milk', 1],
        ['cheese', 2],
      ],
    },
  ],
  services: [],
  charm: 0,
  savings: 0,
};
