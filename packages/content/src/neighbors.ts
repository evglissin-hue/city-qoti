import type { NeighborDef } from './types';

// Neighbor towns for the Trading Post (docs/spec/13-ledger.md, Trade). Price factors are percent of
// base; C4A adds drift and impact on top and tunes these. C4A gave each a taste for something a
// young village has plenty of (Millhaven: logs for its barns; Stonecross: vegetables,
// which do not grow on a hillside), so every Hamlet good has a buyer somewhere.

export const millhaven: NeighborDef = {
  id: 'millhaven',
  name: 'Millhaven',
  blurb: 'A farm town downstream: sacks of wheat, bales of wool, and a soft spot for good planks.',
  character: 'Farm country: cheap grain and wool, and it pays well for tools and planks.',
  sells: [
    ['wheat', 85],
    ['wool', 90],
    ['milk', 95],
    ['apples', 90],
    // C5B: Millhaven's hives, until the valley keeps its own (C5C's apiary).
    ['honey', 110],
  ],
  buys: [
    ['tools', 125],
    ['planks', 115],
    ['bricks', 110],
    ['cider', 105],
    ['logs', 95],
    // C5B: Millhaven's farmhouses want chairs, and its harvest suppers want pies.
    ['furniture', 115],
    ['pies', 105],
    // C5X part 2: stone for its barns and field walls (a Village's quarries had no buyer anywhere).
    ['stone', 90],
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
  character: 'Quarry country: cheap stone and firewood, and it pays well for bread, cloth and cheese.',
  sells: [
    ['stone', 80],
    ['clay', 90],
    ['tools', 105],
    ['firewood', 95],
    // C5X part 2: logs off the hill woods. Nobody sold logs, so a Village whose woodcutters had
    // felled their patch could never rebuild one, and its chopping sheds and woodpile stood empty.
    ['logs', 115],
  ],
  buys: [
    ['bread', 120],
    ['cloth', 125],
    ['cheese', 115],
    ['fish', 110],
    ['vegetables', 100],
    // C5B: a cold hill town buys coats, dearest in winter, and candles for its long evenings.
    ['coats', 120],
    ['candles', 110],
    // C5X part 2: a town short of bread takes the grain to bake it, and wool for its own looms (a
    // Village of farmsteads held 1,500 wheat with nowhere to sell a sack).
    ['flour', 105],
    ['wheat', 95],
    ['wool', 100],
  ],
  seasonal: [
    ['firewood', 3, 130],
    ['cloth', 3, 120],
    ['coats', 3, 125],
  ],
  days: 3,
};
