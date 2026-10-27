import type { PatternDef } from './types';

// The six I3 pattern stubs (docs/spec/12-hearth.md, later patterns). Detectors arrive with their
// owners (C5C: Orchard Path, Children's Corner, Reading Nook, Pond Garden; C5D: Town Gate, Watch
// Lookout). Until then `rank: 'town'` keeps their hints out of a Village's Pattern Book; owners set
// 'village' when the detector lands.

export const childrensCorner: PatternDef = {
  id: 'childrens-corner',
  name: "Children's Corner",
  flavor: 'Somewhere to run, somewhere to sit and watch them run.',
  hint: 'A patch of grass near homes with room to play and a bench for the grown-ups.',
  rank: 'town',
  detector: 'childrensCorner',
  params: [],
  siteBonus: { charm: 6, radius: 3, category: 'comfort' },
  unlocks: [],
  hintOrder: 16,
};

export const orchardPath: PatternDef = {
  id: 'orchard-path',
  name: 'Orchard Path',
  flavor: 'A walk under fruit trees is a walk that takes twice as long, gladly.',
  hint: 'A path running between fruit trees on both sides.',
  rank: 'town',
  detector: 'orchardPath',
  params: [],
  siteBonus: { charm: 6, radius: 2, category: 'nature' },
  unlocks: [],
  hintOrder: 15,
};

export const pondGarden: PatternDef = {
  id: 'pond-garden',
  name: 'Pond Garden',
  flavor: 'Still water, a few reeds and a frog with opinions.',
  hint: 'A pond with flowers and a seat beside it.',
  rank: 'town',
  detector: 'pondGarden',
  params: [],
  siteBonus: { charm: 7, radius: 3, category: 'nature' },
  unlocks: [],
  hintOrder: 17,
};

export const readingNook: PatternDef = {
  id: 'reading-nook',
  name: 'Reading Nook',
  flavor: 'A quiet seat in good light, for one chapter more.',
  hint: 'A bench in a quiet, lit corner, away from the noise of workshops.',
  rank: 'town',
  detector: 'readingNook',
  params: [],
  siteBonus: { charm: 5, radius: 2, category: 'comfort' },
  unlocks: [],
  hintOrder: 18,
};

export const townGate: PatternDef = {
  id: 'town-gate',
  name: 'Town Gate',
  flavor: 'A gate says welcome and goodbye in the same breath.',
  hint: 'A gate in a wall where the main lane leaves the village, with lanterns either side.',
  rank: 'town',
  detector: 'townGate',
  params: [],
  siteBonus: { charm: 6, radius: 3, category: 'view' },
  unlocks: [],
  hintOrder: 19,
};

export const watchLookout: PatternDef = {
  id: 'watch-lookout',
  name: 'Watch Lookout',
  flavor: 'The best view in the valley, and someone kind enough to keep an eye on it.',
  hint: 'A watchtower on high ground with a clear view of the forest edge.',
  rank: 'town',
  detector: 'watchLookout',
  params: [],
  siteBonus: { charm: 5, radius: 3, category: 'view' },
  unlocks: [],
  hintOrder: 20,
};
