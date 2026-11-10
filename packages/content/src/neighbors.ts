import type { NeighborDef } from './types';

// Neighbor towns (docs/spec/13-ledger.md, The carrier and trade). The carrier buys from what they
// sell and sells to what they buy; what no neighbor sells, it cannot bring. Price factors are percent
// of base, with drift and impact on top. R1.0 rewrote the lists in the sixteen goods so every family
// has a seller: Millhaven is farm country downstream (grain and wool, the boat's port), Stonecross a
// hill town of quarries and chimneys (stone and firewood). R1A and R1X tune them.

export const millhaven: NeighborDef = {
  id: 'millhaven',
  name: 'Millhaven',
  blurb: 'A farm town downstream: sacks of grain, bales of wool, and a soft spot for good timber.',
  character: 'Farm country: cheap grain and wool, and it pays well for timber and brick.',
  sells: [
    ['grain', 85],
    ['wool', 90],
    ['vegetables', 95],
    ['fruit', 90],
    ['cheese', 100],
    ['cloth', 115],
    ['honey', 110],
    ['cider', 110],
  ],
  buys: [
    ['timber', 115],
    ['brick', 110],
    ['stone', 90],
    ['furniture', 115],
    ['candles', 100],
    ['fish', 105],
  ],
  seasonal: [
    ['grain', 1, 80],
    ['grain', 3, 120],
    ['fruit', 2, 75],
  ],
  days: 2,
};

export const stonecross: NeighborDef = {
  id: 'stonecross',
  name: 'Stonecross',
  blurb: 'A hill town of quarries and chimneys, always short of bread and warm cloth.',
  character: 'Quarry country: cheap stone and firewood, and it pays well for bread, cloth and cheese.',
  sells: [
    ['stone', 80],
    ['firewood', 95],
    ['timber', 115],
    ['brick', 110],
    ['candles', 110],
  ],
  buys: [
    ['bread', 120],
    ['cloth', 125],
    ['cheese', 115],
    ['fish', 110],
    ['vegetables', 100],
    ['grain', 95],
    ['wool', 100],
    ['honey', 105],
    ['cider', 105],
  ],
  seasonal: [
    ['firewood', 3, 130],
    ['cloth', 3, 120],
  ],
  days: 3,
};
