import type { WishTemplate } from './types';

// The twelve I1 wishes (docs/spec/12-hearth.md). Targets are checked hourly by the Condition DSL
// evaluator (packages/sim/src/conditions); a template is only offered while its target is unmet.
//
// Placeholders: {name} (given name), {family}, {place} (their home, "cottage"), {work} (their
// workplace, "bakery"), {species}. Thank-you letters are signed by the sim, so they end without a
// name. Digest phrases finish the Chronicle's weekly sentence "this week ... came true: ...".

const HAS_HOME = { not: { resident: { noHome: true } } } as const;
const HAS_JOB = { resident: { hasJob: true } } as const;

export const aGardenPlot: WishTemplate = {
  id: 'a-garden-plot',
  name: 'A Garden Plot',
  lane: 'hearth',
  text: [
    '{name} would like a vegetable plot near the {place}. Something to fuss over that fusses back.',
    '{name} has been reading seed catalogues again. A garden plot within a short stroll would do.',
    '{name} has strong opinions about carrots and nowhere to put them. A plot near home, please.',
    '{name} keeps a trowel by the door, just in case. A garden plot would give it a purpose.',
  ],
  when: HAS_HOME,
  target: {
    any: [
      { near: { building: 'vegetable-plot', of: 'home', within: 3 } },
      { near: { tag: 'herb', of: 'home', within: 3 } },
    ],
  },
  reward: { mood: 15, bond: 1 },
  thanks: [
    'The first radish was small, crooked and perfect. I have saved you the second one.',
    'I have been out in the garden since dawn and I have never been happier to have mud on my sleeves.',
    'Thank you for the plot. The slugs also send their thanks, though I did not ask them to.',
  ],
  digest: ['a garden plot for {name}', 'somewhere for {name} to grow things', "{name}'s vegetable plot"],
  weight: 3,
};

export const aProperPath: WishTemplate = {
  id: 'a-proper-path',
  name: 'A Proper Path',
  lane: 'ledger',
  text: [
    '{name} would like to walk to work without wading through the meadow. A proper path, please.',
    '{name} has ruined a second pair of boots on the way to the {work}. A path all the way would help.',
    '{name} arrives at work with half the meadow on their trousers. A path from door to door would fix it.',
  ],
  when: { all: [HAS_HOME, HAS_JOB] },
  target: { code: 'pathRoute' },
  reward: { mood: 18, bond: 1 },
  thanks: [
    'Dry feet all the way to work. A small miracle, and you made it.',
    'I walked to work this morning without once checking my boots. Thank you for the path.',
    'The path is lovely. I have started leaving five minutes later, just to enjoy it.',
  ],
  digest: ['a path to work for {name}', 'dry boots for {name}', "{name}'s path to the door"],
  weight: 3,
};

export const aWellCloser: WishTemplate = {
  id: 'a-well-closer',
  name: 'A Well Closer',
  lane: 'hearth',
  text: [
    '{name} is tired of carrying water halfway across town. A well closer to home?',
    "{name}'s arms are now noticeably longer. A nearby well would let them shrink back.",
    '{name} has done the sums: four buckets a day, and far too many steps each. A well nearby, please.',
  ],
  when: HAS_HOME,
  target: { near: { building: 'well', of: 'home', within: 4 } },
  reward: { mood: 18, bond: 1 },
  thanks: [
    'Water at the doorstep. I will never take it for granted. Probably.',
    'I filled the kettle three times today for no reason at all. Thank you for the well.',
    'My arms have forgiven you for everything. The new well is perfect.',
  ],
  digest: ['a well near {name}', 'a well by the {family} door', 'water closer to home for {name}'],
  weight: 3,
};

export const bakeryNearby: WishTemplate = {
  id: 'bakery-nearby',
  name: 'Bakery Nearby',
  lane: 'ledger',
  text: [
    '{name} dreams of warm bread within walking distance. Ideally within sniffing distance.',
    '{name} would like a bakery nearby. They promise to visit it far too often.',
    '{name} has started describing loaves in their sleep. A bakery near the {place} would help everyone.',
  ],
  when: {
    all: [
      HAS_HOME,
      {
        any: [
          { resident: { traits: ['sweet-tooth', 'homebody'] } },
          { resident: { species: ['mouse', 'badger'] } },
        ],
      },
    ],
  },
  target: { near: { buildingTag: 'bakery', of: 'home', within: 12 } },
  reward: { mood: 15, bond: 1 },
  thanks: [
    'The smell alone has improved my mornings. The bread does the rest.',
    'I can see the bakery chimney from my window. I check on it often. Thank you.',
    'Warm bread before breakfast is now a thing that happens to me. I am a changed creature.',
  ],
  digest: ['a bakery within sniffing distance of {name}', 'warm bread for {name}', "{name}'s nearby bakery"],
  weight: 2,
};

export const flowersOnTheLane: WishTemplate = {
  id: 'flowers-on-the-lane',
  name: 'Flowers on the Lane',
  lane: 'hearth',
  text: [
    '{name} would like some flowers out front. Three at least; two looks like an accident.',
    '{name} thinks the lane outside their door could use a little color.',
    "{name} has been eyeing the neighbors' window boxes with some envy. Flowers by the {place}, please.",
  ],
  when: HAS_HOME,
  target: { near: { tag: 'flower', of: 'home', within: 3, atLeast: 3 } },
  reward: { mood: 15, bond: 1 },
  thanks: [
    'I counted the flowers twice this morning, just to be sure. Thank you.',
    'The bees have found my front step and so, it seems, has every neighbor. Lovely.',
    'Three lots of flowers. I have started greeting them by name. They have not complained.',
  ],
  digest: ['flowers outside the {family} door', 'a little color for {name}', 'blooms on the lane for {name}'],
  weight: 3,
};

export const freshFish: WishTemplate = {
  id: 'fresh-fish',
  name: 'Fresh Fish',
  lane: 'ledger',
  text: [
    '{name} would love fresh fish at the market. Not soon. Now, ideally.',
    '{name} has been eyeing the river wistfully. Fish at the nearest stall would settle it.',
    '{name} has eaten so many vegetables they are beginning to look leafy. Fish at the market, please.',
  ],
  when: {
    all: [
      HAS_HOME,
      { resident: { species: ['otter', 'fox', 'badger'] } },
      { near: { buildingTag: 'market', of: 'home', within: 40 } },
    ],
  },
  target: { stock: { good: 'fish', at: 'nearestMarket', atLeast: 1 } },
  reward: { mood: 15, bond: 1 },
  thanks: [
    'Fish for supper, and nobody had to swim for it. Thank you.',
    'I bought the fish, carried it home and looked at it for a while before cooking it. Worth every penny.',
    'Fresh fish at the stall. My whiskers have not been this happy in seasons.',
  ],
  digest: ['fish at the market for {name}', "{name}'s fish supper", 'a well-stocked stall for {name}'],
  weight: 2,
};

export const lanternOnMyWayHome: WishTemplate = {
  id: 'lantern-on-my-way-home',
  name: 'Lantern on My Way Home',
  lane: 'hearth',
  text: [
    '{name} walks home from the {work} in the dark. A few lanterns along the way would be lovely.',
    '{name} has walked into the same fence post three evenings running. Lanterns, please.',
    '{name} navigates home by memory and the occasional apology. Some light on the way would help.',
  ],
  when: { all: [HAS_HOME, HAS_JOB] },
  target: { code: 'lanternRoute', params: [['share', 50]] },
  reward: { mood: 18, bond: 1 },
  thanks: [
    'The walk home is the best part of my day now. Who knew.',
    'I can see where I am going in the evenings. The fence post and I are on speaking terms again.',
    'The lanterns are beautiful. I have been taking the long way home just to walk under them twice.',
  ],
  digest: [
    'lanterns on the way home for {name}',
    'a lit walk home for {name}',
    "light on {name}'s evening walk",
  ],
  weight: 2,
};

export const neighbors: WishTemplate = {
  id: 'neighbors',
  name: 'Neighbors',
  lane: 'hearth',
  text: [
    '{name} is a bit lonely out there. Someone living nearby would be nice to wave at.',
    '{name} has started naming the crows. A neighbor would be better company.',
    '{name} bakes for two out of habit and eats both portions out of politeness. Neighbors, please.',
  ],
  when: HAS_HOME,
  target: { near: { home: 'occupied', of: 'home', within: 4, excludeSelf: true } },
  reward: { mood: 15, bond: 1 },
  thanks: [
    'I have someone to borrow sugar from. And lend it to, I suppose.',
    'There is a light on next door in the evenings now. I find it very companionable.',
    'We waved at each other four times today. I think it is going well.',
  ],
  digest: ['new neighbors for {name}', 'someone next door for {name}', 'a friendly wave for {name}'],
  weight: 2,
};

export const quietPlease: WishTemplate = {
  id: 'quiet-please',
  name: 'Quiet, Please',
  lane: 'hearth',
  text: [
    '{name} cannot hear themselves think over the workshops. Some quiet at home, please.',
    "{name} has taken to sleeping with a tea cosy on each ear. It isn't working.",
    '{name} would like the sawing, hammering and clattering to happen somewhere further from the {place}.',
  ],
  when: { all: [HAS_HOME, { charm: { of: 'home', layer: 'noise', atLeast: 4 } }] },
  target: { charm: { of: 'home', layer: 'noise', atMost: 3 } },
  reward: { mood: 15, bond: 1 },
  thanks: [
    'I heard a blackbird this morning. First time in weeks.',
    'I have retired the tea cosies. Thank you for the quiet.',
    'It is so quiet I can hear the kettle thinking about boiling. Bliss.',
  ],
  digest: ['some quiet for {name}', 'peace at the {family} home', 'a blackbird heard by {name}'],
  weight: 2,
};

export const riverBench: WishTemplate = {
  id: 'river-bench',
  name: 'River Bench',
  lane: 'hearth',
  text: [
    '{name} would love a bench by the river, not too far from home, for watching the water do nothing.',
    '{name} wants somewhere to sit by the water. Somewhere with a view and no particular purpose.',
    '{name} has a book, a free afternoon and a river nearby. All that is missing is a bench.',
  ],
  when: { all: [HAS_HOME, { near: { water: true, of: 'home', within: 10 } }] },
  target: {
    near: { tag: 'bench', of: 'home', within: 10, also: { target: { water: true }, within: 2 } },
  },
  reward: { mood: 15, bond: 1 },
  thanks: [
    'I sat by the river for an hour and solved nothing. Bliss. Thank you.',
    'A heron and I shared the bench this morning. Neither of us said a word. Perfect.',
    'I have read three chapters on the new bench and watched a great deal of river. Thank you.',
  ],
  digest: ['a bench by the river for {name}', 'a river view for {name}', "{name}'s bench by the water"],
  weight: 3,
};

export const somewhereToSit: WishTemplate = {
  id: 'somewhere-to-sit',
  name: 'Somewhere to Sit',
  lane: 'hearth',
  text: [
    '{name} would like a bench near home. Their knees have been very clear about it.',
    '{name} needs somewhere to sit outside. The doorstep has been filing complaints.',
    '{name} would like a bench by the {place}, for sitting, thinking, and sometimes only sitting.',
  ],
  when: HAS_HOME,
  target: { near: { tag: 'bench', of: 'home', within: 3 } },
  reward: { mood: 12, bond: 1 },
  thanks: [
    'A bench of my very own. Well, everyone else may sit on it too.',
    'I sat on the new bench and watched the whole town go by. It took eleven minutes. Lovely.',
    'My knees have written separately to thank you. I shall pass it on.',
  ],
  digest: ['a bench for {name}', 'somewhere to sit for {name}', 'a seat by the {family} door'],
  weight: 4,
};

export const treeByMyWindow: WishTemplate = {
  id: 'tree-by-my-window',
  name: 'Tree by My Window',
  lane: 'hearth',
  text: [
    '{name} would like a tree outside the window. Something for the birds and the afternoons.',
    "{name} misses the sound of leaves. A tree by the window, if it's no trouble.",
    '{name} would like a tree near the {place}: shade in summer, color in autumn, a robin all year.',
  ],
  when: HAS_HOME,
  target: { near: { tree: 'any', of: 'home', within: 2 } },
  reward: { mood: 15, bond: 1 },
  thanks: [
    'There is a robin in my tree. MY tree. Thank you.',
    'I watched the leaves move for most of the afternoon. It was time very well spent.',
    'The tree is young, and so, I feel, am I again. Thank you.',
  ],
  digest: [
    'a tree by the window for {name}',
    'a tree outside the {family} home',
    'leaves and birdsong for {name}',
  ],
  weight: 4,
};
