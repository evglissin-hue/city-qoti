import type { PatternDef } from './types';

// The six I3 pattern stubs (docs/spec/12-hearth.md, later patterns). Detectors arrive with their
// owners (C5C: Orchard Path, Children's Corner, Reading Nook, Pond Garden; C5D: Town Gate, Watch
// Lookout). Until then `rank: 'town'` keeps their hints out of a Village's Pattern Book; owners set
// 'village' when the detector lands. C5C's four are written (rules in 12-hearth.md).

export const childrensCorner: PatternDef = {
  id: 'childrens-corner',
  name: "Children's Corner",
  flavor: 'Somewhere to run, somewhere to sit and watch them run.',
  hint: 'A swing where three homes with children can see it, and a bench for the grown-ups.',
  rank: 'village',
  detector: 'childrensCorner',
  params: [
    ['homes', 3],
    ['sight', 8],
    ['benchReach', 3],
  ],
  siteBonus: { charm: 6, radius: 3, category: 'comfort' },
  unlocks: ['see-saw'],
  hintOrder: 16,
};

export const orchardPath: PatternDef = {
  id: 'orchard-path',
  name: 'Orchard Path',
  flavor: 'A walk under fruit trees is a walk that takes twice as long, gladly.',
  hint: 'A path along the side of an orchard, with a bench to sit under the trees.',
  rank: 'village',
  detector: 'orchardPath',
  params: [
    ['pathTiles', 3],
    ['benchReach', 2],
  ],
  siteBonus: { charm: 6, radius: 2, category: 'nature' },
  unlocks: ['pear-tree'],
  hintOrder: 15,
};

export const pondGarden: PatternDef = {
  id: 'pond-garden',
  name: 'Pond Garden',
  flavor: 'Still water, a few reeds and a frog with opinions.',
  hint: 'A pond with planting around it, a seat beside it and a path to it.',
  rank: 'village',
  detector: 'pondGarden',
  params: [
    ['pondTiles', 2],
    ['planting', 2],
    ['reach', 2],
  ],
  siteBonus: { charm: 7, radius: 3, category: 'nature' },
  unlocks: ['reed-bed'],
  hintOrder: 17,
};

export const readingNook: PatternDef = {
  id: 'reading-nook',
  name: 'Reading Nook',
  flavor: 'A quiet seat in good light, for one chapter more.',
  hint: 'A bench tucked in by walls or hedges, with flowers and a lantern, away from workshop noise.',
  rank: 'village',
  detector: 'readingNook',
  params: [
    ['enclosure', 3],
    ['reach', 2],
    ['maxNoise', 2],
  ],
  siteBonus: { charm: 5, radius: 2, category: 'comfort' },
  unlocks: ['arbor-seat'],
  hintOrder: 18,
};

export const townGate: PatternDef = {
  id: 'town-gate',
  name: 'Town Gate',
  flavor: 'A gate says welcome and goodbye in the same breath.',
  hint: 'A gate in a wall run with lanterns either side and a stone wall dressed beside it.',
  rank: 'village',
  detector: 'townGate',
  params: [
    ['lanterns', 2],
    ['lanternReach', 2],
    ['dressedReach', 3],
  ],
  siteBonus: { charm: 6, radius: 3, category: 'view' },
  unlocks: ['gate-banner'],
  hintOrder: 19,
};

export const watchLookout: PatternDef = {
  id: 'watch-lookout',
  name: 'Watch Lookout',
  flavor: 'The best view in the valley, and someone kind enough to keep an eye on it.',
  hint: 'A watchtower with a bench at its foot and a view over a lane or the river.',
  rank: 'village',
  detector: 'watchLookout',
  params: [
    ['benchReach', 3],
    ['view', 6],
  ],
  siteBonus: { charm: 5, radius: 3, category: 'view' },
  unlocks: ['lookout-bench'],
  hintOrder: 20,
};
