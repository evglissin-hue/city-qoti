import type { WishTemplate } from './types';

// The twelve I1 wishes (docs/spec/12-hearth.md). Text variants use {name}, {place} and {species}.
// Targets are checked hourly by the Condition DSL evaluator (packages/sim/src/conditions).

const HAS_HOME = { not: { resident: { noHome: true } } } as const;

export const aGardenPlot: WishTemplate = {
  id: 'a-garden-plot',
  name: 'A Garden Plot',
  lane: 'hearth',
  text: [
    '{name} would like a vegetable plot near home. Something to fuss over that fusses back.',
    '{name} has been reading seed catalogues again. A garden plot within a short stroll would do.',
  ],
  when: HAS_HOME,
  target: {
    any: [
      { near: { building: 'vegetable-plot', of: 'home', within: 3 } },
      { near: { tag: 'herb', of: 'home', within: 3 } },
    ],
  },
  reward: { mood: 15, bond: 1 },
  thanks: ['The first radish was small, crooked and perfect. Thank you. {name}'],
  weight: 3,
};

export const aProperPath: WishTemplate = {
  id: 'a-proper-path',
  name: 'A Proper Path',
  lane: 'ledger',
  text: [
    '{name} would like to walk to work without wading through the meadow. A proper path, please.',
    '{name} has ruined a second pair of boots on the way to work. A path all the way would help.',
  ],
  when: { all: [HAS_HOME, { resident: { hasJob: true } }] },
  target: { code: 'pathRoute' },
  reward: { mood: 15, bond: 1 },
  thanks: ['Dry feet all the way to work. A small miracle, and you made it. {name}'],
  weight: 3,
};

export const aWellCloser: WishTemplate = {
  id: 'a-well-closer',
  name: 'A Well Closer',
  lane: 'hearth',
  text: [
    '{name} is tired of carrying water halfway across town. A well closer to home?',
    "{name}'s arms are now noticeably longer. A nearby well would let them shrink back.",
  ],
  when: HAS_HOME,
  target: { near: { building: 'well', of: 'home', within: 4 } },
  reward: { mood: 15, bond: 1 },
  thanks: ['Water at the doorstep. I will never take it for granted. Probably. {name}'],
  weight: 3,
};

export const bakeryNearby: WishTemplate = {
  id: 'bakery-nearby',
  name: 'Bakery Nearby',
  lane: 'ledger',
  text: [
    '{name} dreams of warm bread within walking distance. Ideally within sniffing distance.',
    '{name} would like a bakery nearby. They promise to visit it far too often.',
  ],
  when: {
    all: [
      HAS_HOME,
      { any: [{ resident: { traits: ['sweet-tooth'] } }, { resident: { species: ['mouse'] } }] },
    ],
  },
  target: { near: { buildingTag: 'bakery', of: 'home', within: 12 } },
  reward: { mood: 15, bond: 1 },
  thanks: ['The smell alone has improved my mornings. The bread does the rest. {name}'],
  weight: 2,
};

export const flowersOnTheLane: WishTemplate = {
  id: 'flowers-on-the-lane',
  name: 'Flowers on the Lane',
  lane: 'hearth',
  text: [
    '{name} would like some flowers out front. Three at least; two looks like an accident.',
    '{name} thinks the lane outside their door could use a little color.',
  ],
  when: HAS_HOME,
  target: { near: { tag: 'flower', of: 'home', within: 3, atLeast: 3 } },
  reward: { mood: 15, bond: 1 },
  thanks: ['I counted the flowers twice this morning, just to be sure. Thank you. {name}'],
  weight: 3,
};

export const freshFish: WishTemplate = {
  id: 'fresh-fish',
  name: 'Fresh Fish',
  lane: 'ledger',
  text: [
    '{name} would love fresh fish at the market. Not soon. Now, ideally.',
    '{name} has been eyeing the river wistfully. Fish at the nearest stall would settle it.',
  ],
  when: { all: [HAS_HOME, { resident: { species: ['otter', 'fox', 'badger'] } }] },
  target: { stock: { good: 'fish', at: 'nearestMarket', atLeast: 1 } },
  reward: { mood: 15, bond: 1 },
  thanks: ['Fish for supper, and nobody had to swim for it. Thank you. {name}'],
  weight: 2,
};

export const lanternOnMyWayHome: WishTemplate = {
  id: 'lantern-on-my-way-home',
  name: 'Lantern on My Way Home',
  lane: 'hearth',
  text: [
    '{name} walks home from work in the dark. A few lanterns along the way would be lovely.',
    '{name} has walked into the same fence post three evenings running. Lanterns, please.',
  ],
  when: { all: [HAS_HOME, { resident: { hasJob: true } }] },
  target: { code: 'lanternRoute', params: [['share', 50]] },
  reward: { mood: 15, bond: 1 },
  thanks: ['The walk home is the best part of my day now. Who knew. {name}'],
  weight: 2,
};

export const neighbors: WishTemplate = {
  id: 'neighbors',
  name: 'Neighbors',
  lane: 'hearth',
  text: [
    '{name} is a bit lonely out there. Someone living nearby would be nice to wave at.',
    '{name} has started naming the crows. A neighbor would be better company.',
  ],
  when: HAS_HOME,
  target: { near: { home: 'occupied', of: 'home', within: 4, excludeSelf: true } },
  reward: { mood: 15, bond: 1 },
  thanks: ['I have someone to borrow sugar from. And lend it to, I suppose. {name}'],
  weight: 2,
};

export const quietPlease: WishTemplate = {
  id: 'quiet-please',
  name: 'Quiet, Please',
  lane: 'hearth',
  text: [
    '{name} cannot hear themselves think over the workshops. Some quiet at home, please.',
    "{name} has taken to sleeping with a tea cosy on each ear. It isn't working.",
  ],
  when: { all: [HAS_HOME, { charm: { of: 'home', layer: 'noise', atLeast: 4 } }] },
  target: { charm: { of: 'home', layer: 'noise', atMost: 3 } },
  reward: { mood: 15, bond: 1 },
  thanks: ['I heard a blackbird this morning. First time in weeks. {name}'],
  weight: 2,
};

export const riverBench: WishTemplate = {
  id: 'river-bench',
  name: 'River Bench',
  lane: 'hearth',
  text: [
    '{name} would love a bench by the river, not too far from home, for watching the water do nothing.',
    '{name} wants somewhere to sit by the water. Somewhere with a view and no particular purpose.',
  ],
  when: { all: [HAS_HOME, { near: { water: true, of: 'home', within: 10 } }] },
  target: {
    near: { tag: 'bench', of: 'home', within: 10, also: { target: { water: true }, within: 2 } },
  },
  reward: { mood: 15, bond: 1 },
  thanks: ['I sat by the river for an hour and solved nothing. Bliss. Thank you. {name}'],
  weight: 3,
};

export const somewhereToSit: WishTemplate = {
  id: 'somewhere-to-sit',
  name: 'Somewhere to Sit',
  lane: 'hearth',
  text: [
    '{name} would like a bench near home. Their knees have been very clear about it.',
    '{name} needs somewhere to sit outside. The doorstep has been filing complaints.',
  ],
  when: HAS_HOME,
  target: { near: { tag: 'bench', of: 'home', within: 3 } },
  reward: { mood: 15, bond: 1 },
  thanks: ['A bench of my very own. Well, everyone else may sit on it too. {name}'],
  weight: 4,
};

export const treeByMyWindow: WishTemplate = {
  id: 'tree-by-my-window',
  name: 'Tree by My Window',
  lane: 'hearth',
  text: [
    '{name} would like a tree outside the window. Something for the birds and the afternoons.',
    "{name} misses the sound of leaves. A tree by the window, if it's no trouble.",
  ],
  when: HAS_HOME,
  target: { near: { tree: 'any', of: 'home', within: 2 } },
  reward: { mood: 15, bond: 1 },
  thanks: ['There is a robin in my tree. MY tree. Thank you. {name}'],
  weight: 4,
};
