import type { PatternDef } from './types';

// The six Village patterns (docs/spec/12-hearth.md, I2 patterns; C4C). They are detected and
// hinted from Village rank on. Detectors live in packages/sim/src/systems/hearth/patterns.

export const bridgeCrossing: PatternDef = {
  id: 'bridge-crossing',
  name: 'Bridge Crossing',
  flavor: 'A bridge is a place to stop halfway and watch the water decide where it is going.',
  hint: 'Where a road crosses the river, light both ends and leave somewhere to sit and watch.',
  rank: 'village',
  detector: 'bridgeCrossing',
  params: [
    ['span', 1],
    ['lanternReach', 1],
    ['benchReach', 3],
  ],
  siteBonus: { charm: 6, radius: 3, category: 'view' },
  unlocks: ['lamp-post'],
  hintOrder: 14,
};

export const cornerCafe: PatternDef = {
  id: 'corner-cafe',
  name: 'Corner Cafe',
  flavor: 'A table by a door on a corner lets you be out in the village and sat down at the same time.',
  hint: 'A tavern, bakery or shop on a corner where two roads meet, with seats and flowers outside.',
  rank: 'village',
  detector: 'cornerCafe',
  params: [
    ['cornerReach', 2],
    ['seats', 2],
    ['seatReach', 2],
    ['flowers', 1],
  ],
  siteBonus: { charm: 6, radius: 3, category: 'comfort' },
  unlocks: ['cafe-table'],
  hintOrder: 10,
};

export const marketCross: PatternDef = {
  id: 'market-cross',
  name: 'Market Cross',
  flavor: 'Every market wants a middle: a well or a tree at the crossroads where the stalls can face.',
  hint: 'Two roads crossing, a well or a tree right at the crossing, and stalls gathered round.',
  rank: 'village',
  detector: 'marketCross',
  params: [
    ['stalls', 2],
    ['stallReach', 4],
    ['markReach', 1],
  ],
  siteBonus: { charm: 8, radius: 4, category: 'comfort' },
  unlocks: ['notice-board'],
  hintOrder: 13,
};

export const smallSquare: PatternDef = {
  id: 'small-square',
  name: 'Small Square',
  flavor: 'A square is a room with the sky for a ceiling. Walls on three sides make it feel like one.',
  hint: 'A paved open space, three steps across or more, closed in by buildings, with a seat and a light.',
  rank: 'village',
  detector: 'smallSquare',
  params: [
    ['size', 3],
    ['sides', 3],
    ['sideReach', 2],
    ['benches', 1],
    ['lanterns', 1],
  ],
  siteBonus: { charm: 8, radius: 4, category: 'comfort' },
  unlocks: ['fountain'],
  hintOrder: 9,
};

export const villageGreen: PatternDef = {
  id: 'village-green',
  name: 'Village Green',
  flavor: 'Leave a square of grass alone in the middle of things and the village will find a use for it.',
  hint: 'An open lawn, five steps by five, with a grown tree, a seat at its edge and homes all round.',
  rank: 'village',
  detector: 'villageGreen',
  params: [
    ['size', 5],
    ['homes', 4],
    ['homeReach', 3],
    ['benches', 1],
  ],
  siteBonus: { charm: 8, radius: 4, category: 'nature' },
  unlocks: ['maypole'],
  hintOrder: 11,
};

export const windowGardens: PatternDef = {
  id: 'window-gardens',
  name: 'Window Gardens',
  flavor: 'One window box is a hobby. A row of them is a street that has decided to bloom.',
  hint: 'Three homes side by side on one street, every one with flowers at the windows.',
  rank: 'village',
  detector: 'windowGardens',
  params: [
    ['homes', 3],
    ['gap', 1],
  ],
  siteBonus: { charm: 5, radius: 2, category: 'nature' },
  unlocks: ['flower-cart'],
  hintOrder: 12,
};
