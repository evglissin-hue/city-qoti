import type { BuildingDef, ChronicleTemplate, DecorDef } from './types';

// C5D: threats, defenses and the Watch (docs/spec/14-challenge.md). Chronicle kinds and Barnaby
// Ashcombe's finale landmark. Params by kind:
//   raid-held        {side}            a raid repelled with nothing stolen (snapshot)
//   raid-repelled    {side} {stolen}   raiders turned back, a little taken (snapshot)
//   raid-lost        {side} {stolen}   the raiders got away with something (snapshot)
//   bandit-home      {name}            a captured bandit took the offer of a home
//   bandit-sent      (none)            a captured bandit was sent on their way
//   wolves           {place}           wolves came down from the forest edge in the night
//   wolves-howl      (none)            wolves howled at the forest edge and stayed there

export const banditHome: ChronicleTemplate = {
  kind: 'bandit-home',
  text: [
    '{name} came to {town} to take things and stayed to fix them. The Watch is keeping one eye open. The other one is rather impressed.',
    'A captured bandit, {name}, was offered a home instead of the road. They accepted, unpacked a very small bag, and asked where the kettle was.',
    '{name} has hung up the mask and taken a cottage. The neighbors brought a pie, partly out of kindness and partly to count the spoons.',
  ],
  notable: true,
};

export const banditSent: ChronicleTemplate = {
  kind: 'bandit-sent',
  text: [
    'A captured bandit was walked to the edge of the valley, given a sandwich and a stern look, and sent on their way. Word gets around.',
    'The Watch saw a captured bandit off at the valley gate. The story of {town} will travel with them, and it is not a story that ends well for bandits.',
    'One bandit fewer in the world, or at least in the valley: sent off at dawn with a packed lunch and directions to somewhere else.',
  ],
};

export const raidHeld: ChronicleTemplate = {
  kind: 'raid-held',
  text: [
    'Bandits came out of the {side} at dusk, met the Watch and a closed gate, and went home with nothing but sore feet. The gate held.',
    'A raid from the {side} last night, and not one sack taken. The Watch is insufferable this morning, and has earned it.',
    'Raiders from the {side} found {town} awake, lit and unimpressed. They left empty-handed before the cocoa went cold.',
  ],
  notable: true,
};

export const raidLost: ChronicleTemplate = {
  kind: 'raid-lost',
  text: [
    'Bandits came out of the {side} at dusk and made off with {stolen} before dawn. Nobody was hurt. The storehouse door has opinions about it.',
    'A hard night: raiders from the {side} carried off {stolen}. The town counted its losses over breakfast and started planning a better wall.',
    'The raid from the {side} cost {town} {stolen}. Nobody was hurt, the shelves will fill again, and the Watch would like a word about lanterns.',
  ],
  notable: true,
};

export const raidRepelled: ChronicleTemplate = {
  kind: 'raid-repelled',
  text: [
    'Raiders from the {side} were turned back in the night, though not before {stolen} went over the wall with them. Mostly a win.',
    'The Watch saw off a raid from the {side}. A few sacks left with the bandits ({stolen}), but they left at a run.',
    'A raid from the {side}, repelled. The bandits got {stolen} for their trouble and a long cold walk home, which seems fair.',
  ],
  notable: true,
};

export const wolves: ChronicleTemplate = {
  kind: 'wolves',
  text: [
    'Wolves came down from the forest in the night and prowled round {place}. They frightened the hens and a few late walkers, and were gone by dawn.',
    'A winter night with wolves in it: they sniffed round {place}, found the lanterns lit elsewhere, and left before the sun came up.',
    'Wolf prints round {place} this morning, and a henhouse that will not lay for a day out of sheer indignation. Nobody was hurt.',
  ],
  notable: true,
};

export const wolvesHowl: ChronicleTemplate = {
  kind: 'wolves-howl',
  text: [
    'Wolves howled at the forest edge last night. They stayed there. Everyone checked the shutters anyway.',
    'The wolves sang at the edge of the trees until midnight. {town} pulled its blankets up and decided it was a lovely tune, from a distance.',
    'Howling in the forest after dark. The wolves are letting {town} know they exist, which is very considerate of them.',
  ],
};

// Pieces the two C5D patterns unlock (stand-in kits; the kit C5E should draw is in params.kit).

/** Town Gate unlocks a banner on a pole, for the gate's two sides. */
export const gateBanner: DecorDef = {
  id: 'gate-banner',
  name: 'Gate banner',
  lane: 'shared',
  radius: 24,
  onRoad: true,
  tags: ['banner', 'sign'],
  art: { kit: 'signpost', params: { kit: 'gate-banner' } },
  charm: [{ category: 'view', value: 3, radius: 2 }],
  locked: true,
};

/** Watch Lookout unlocks a bench with a spyglass on a post beside it. */
export const lookoutBench: DecorDef = {
  id: 'lookout-bench',
  name: 'Lookout bench',
  lane: 'hearth',
  radius: 48,
  onRoad: true,
  tags: ['bench', 'seat'],
  art: { kit: 'bench', params: { kit: 'lookout-bench', spyglass: true } },
  charm: [{ category: 'comfort', value: 3, radius: 2 }],
  locked: true,
};

/** Barnaby Ashcombe's finale: a stone bridge by the water, a landmark the whole valley can see. */
export const stoneBridge: BuildingDef = {
  id: 'stone-bridge',
  name: 'Stone Bridge',
  lane: 'shared',
  category: 'landmark',
  size: [3, 2],
  entrance: [1, 1],
  placement: [{ kind: 'waterEdge' }],
  cost: {
    coins: 40,
    goods: [['stone', 30]],
  },
  work: 20,
  charm: [{ category: 'view', value: 8, radius: 4 }],
  art: { kit: 'shed', params: { kit: 'stone-bridge' } },
  tags: ['landmark', 'bridge'],
  requires: { story: true },
};
