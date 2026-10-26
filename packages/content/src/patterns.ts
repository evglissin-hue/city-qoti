import type { PatternDef } from './types';

// The eight I1 patterns of the Pattern Book (docs/spec/12-hearth.md). Each names a detector
// module in packages/sim/src/systems/hearth/patterns/detectors (C3B). Params are a list, never a
// record. Hints are shown (three at a time, in hintOrder) before discovery; flavor after.

export const hedgerowLane: PatternDef = {
  id: 'hedgerow-lane',
  name: 'Hedgerow Lane',
  flavor: 'A lane between hedges is a corridor for wrens, hedgehogs and anyone in no particular hurry.',
  hint: 'Some lanes are better with green on both sides, close enough to brush with a sleeve.',
  rank: 'hamlet',
  detector: 'hedgerowLane',
  params: [
    ['minRun', 6],
    ['minHedged', 4],
  ],
  siteBonus: { charm: 5, radius: 1, category: 'nature' },
  unlocks: ['wildflower-verge'],
  hintOrder: 6,
};

export const kitchenGarden: PatternDef = {
  id: 'kitchen-garden',
  name: 'Kitchen Garden',
  flavor: 'A garden at the back door feeds the house twice: once at supper, once on the way there.',
  hint: 'A home might like a couple of plots growing just outside, kept safe behind a fence or hedge.',
  rank: 'hamlet',
  detector: 'kitchenGarden',
  params: [
    ['plots', 2],
    ['within', 2],
    ['foodPerDay', 1],
  ],
  siteBonus: { charm: 5, radius: 2, category: 'nature' },
  unlocks: ['herb-planter'],
  hintOrder: 3,
};

export const lanternWalk: PatternDef = {
  id: 'lantern-walk',
  name: 'Lantern Walk',
  flavor: 'A path lit end to end turns the walk home into the best part of the evening.',
  hint: 'A long path, ten steps or more, never more than a couple of steps from a light.',
  rank: 'hamlet',
  detector: 'lanternWalk',
  params: [
    ['minRun', 10],
    ['window', 3],
    ['reach', 1],
    ['lanterns', 3],
  ],
  siteBonus: { charm: 6, radius: 1, category: 'light' },
  unlocks: ['hanging-lantern'],
  hintOrder: 4,
};

export const pocketPark: PatternDef = {
  id: 'pocket-park',
  name: 'Pocket Park',
  flavor: 'A park need not be large. It needs a tree, a seat, some flowers and walls to lean against.',
  hint: 'A small green room tucked between buildings: a tree, a seat, a few flowers.',
  rank: 'hamlet',
  detector: 'pocketPark',
  params: [
    ['minSize', 2],
    ['maxSize', 4],
    ['trees', 1],
    ['benches', 1],
    ['flowers', 2],
    ['sides', 2],
  ],
  siteBonus: { charm: 6, radius: 3 },
  unlocks: ['birdbath'],
  hintOrder: 5,
};

export const promenadeByTheWater: PatternDef = {
  id: 'promenade-by-the-water',
  name: 'Promenade by the Water',
  flavor:
    'Give people a path along the water and they will walk it every evening for the rest of their lives.',
  hint: 'A long walk right beside the river, with places to sit and lights to see by.',
  rank: 'hamlet',
  detector: 'promenade',
  params: [
    ['minRun', 8],
    ['benches', 2],
    ['lanterns', 2],
  ],
  siteBonus: { charm: 10, radius: 2, category: 'view' },
  unlocks: ['mooring-post'],
  hintOrder: 8,
};

export const sittingWall: PatternDef = {
  id: 'sitting-wall',
  name: 'Sitting Wall',
  flavor: 'A low wall at the edge of a path is a bench that also keeps the flowers in.',
  hint: 'A low wall along a path, four lengths or more, with something growing on the far side.',
  rank: 'hamlet',
  detector: 'sittingWall',
  params: [
    ['segments', 4],
    ['gap', 51],
  ],
  siteBonus: { charm: 6, radius: 3, category: 'comfort' },
  unlocks: ['planter-wall'],
  hintOrder: 7,
};

export const treePlace: PatternDef = {
  id: 'tree-place',
  name: 'Tree Place',
  flavor: 'A big tree with seats beneath it becomes a place people give directions by.',
  hint: 'A grown tree where paths meet, with a couple of seats in its shade.',
  rank: 'hamlet',
  detector: 'treePlace',
  params: [
    ['benches', 2],
    ['benchReach', 384],
    ['paths', 2],
    ['pathReach', 2],
  ],
  siteBonus: { charm: 8, radius: 3 },
  unlocks: ['ring-bench'],
  hintOrder: 2,
};

export const wellGatheringPlace: PatternDef = {
  id: 'well-gathering-place',
  name: 'Well Gathering Place',
  flavor: 'Everyone needs water, so everyone meets at the well. Give them a seat and they will stay to talk.',
  hint: 'Where people fetch water they might linger, given a couple of seats, some shade and neighbors.',
  rank: 'hamlet',
  detector: 'wellGathering',
  params: [
    ['benches', 2],
    ['benchReach', 2],
    ['treeReach', 3],
    ['homes', 3],
    ['homeReach', 8],
  ],
  siteBonus: { charm: 8, radius: 4 },
  unlocks: ['curved-bench'],
  hintOrder: 1,
};
