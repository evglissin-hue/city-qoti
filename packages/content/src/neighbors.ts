import type { NeighborDef } from './types';

// Neighbor towns for the Trading Post (docs/spec/13-ledger.md, Trade). Price factors are percent of
// base; C4A adds drift and impact on top and tunes these.

export const millhaven: NeighborDef = {
  id: 'millhaven',
  name: 'Millhaven',
  blurb: 'A farm town downstream: sacks of wheat, bales of wool, and a soft spot for good planks.',
  sells: [
    ['wheat', 85],
    ['wool', 90],
    ['milk', 95],
    ['apples', 90],
  ],
  buys: [
    ['tools', 125],
    ['planks', 115],
    ['bricks', 110],
    ['cider', 105],
  ],
  seasonal: [
    ['wheat', 1, 80],
    ['wheat', 3, 120],
    ['apples', 2, 75],
  ],
  days: 2,
};

export const stonecross: NeighborDef = {
  id: 'stonecross',
  name: 'Stonecross',
  blurb: 'A hill town of quarries and chimneys, always short of bread and warm cloth.',
  sells: [
    ['stone', 80],
    ['clay', 90],
    ['tools', 105],
    ['firewood', 95],
  ],
  buys: [
    ['bread', 120],
    ['cloth', 125],
    ['cheese', 115],
    ['fish', 110],
  ],
  seasonal: [
    ['firewood', 3, 130],
    ['cloth', 3, 120],
  ],
  days: 3,
};
