import type { BuildingDef, StoryArc } from './types';

// Mother Thornbury, the herbalist (docs/spec/11-residents.md, Story characters; C5A). She moves in
// in the first autumn at Village rank, when a home is free, and teaches the town to get through the
// winter: herbs, a woodpile, the Bath House, cold snaps and the herbalist. Her finale is her own
// cottage and the plans for a clinic (the clinic itself is I4).

export const herbalist: StoryArc = {
  id: 'herbalist',
  character: {
    given: 'Mother',
    family: 'Thornbury',
    species: 'hedgehog',
    traits: ['green-fingered', 'generous', 'early-bird'],
    stage: 'elder',
    bio: 'An herbalist who has a remedy for everything except other people, and is working on that.',
  },
  arrival: {
    all: [{ count: { what: 'rank', atLeast: 1 } }, { code: 'seasonIs', params: [['index', 2]] }],
  },
  hello: [
    'My dears,',
    'I have taken the house with the good south window, and I have already hung three bunches of something from the beams. You will get used to the smell. Everyone does, eventually, and then they miss it.',
    'My name is Thornbury, and folk call me Mother, which I allow. I go where the winters are coming and the woodpiles are not ready. Yours is not ready.',
    'Do not worry. Worry is cold work. We will do something about it instead.',
    'Warmly, and I mean that literally,',
    'Mother Thornbury',
  ].join('\n'),
  steps: [
    {
      letter: [
        'My dears,',
        'First things first: a garden of herbs. Feverfew, thyme, a little sage and a great deal of mint, because mint will not take no for an answer. Dried in autumn they see a town through the coughs of January.',
        'Put an herb garden somewhere with a bit of sun. I will bring the cuttings and the opinions.',
        'Mother T.',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'herb-garden', atLeast: 1 } },
      reward: { mood: 10, bond: 1 },
      hint: 'Build an herb garden.',
    },
    {
      letter: [
        'My dears,',
        'Now the woodpile. In winter every hearth in the valley burns a log of firewood a day, and nothing grows to replace it until spring. A family without it sits in its coat at supper, and nobody is cheerful in a coat at supper.',
        'A chopping shed turns logs into firewood. Get sixty in store before the first frost and I will stop mentioning it. Possibly.',
        'Mother T.',
      ].join('\n'),
      goal: { stock: { good: 'firewood', atLeast: 60 } },
      reward: { coins: 30, mood: 5 },
      hint: 'Sixty firewood in store: chopping sheds turn logs into firewood.',
    },
    {
      letter: [
        'My dears,',
        'A Bath House. Do not laugh. Hot water and a warm bench do more for a winter cough than anything in my jars, and a town that bathes together gossips together, which is good for everyone except the people being gossiped about.',
        'The homes it reaches feel the cold far less. It heats its water with firewood, so keep the woodpile honest.',
        'Mother T.',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'bath-house', atLeast: 1 } },
      reward: { bond: 1, mood: 10 },
      hint: 'Build a Bath House near the homes.',
    },
    {
      letter: [
        'My dears,',
        'A word about cold snaps. Now and then the hills breathe out and for two days every hearth wants twice the wood. The almanac gives a day or two of warning, and the sensible town has a second woodpile behind the first.',
        'Two chopping sheds and a hundred firewood, and I will sleep easy. I sleep a great deal, so this is important.',
        'Mother T.',
      ].join('\n'),
      goal: {
        all: [
          { count: { what: 'buildings', ref: 'chopping-shed', atLeast: 2 } },
          { stock: { good: 'firewood', atLeast: 100 } },
        ],
      },
      reward: { coins: 40, mood: 5 },
      hint: 'Two chopping sheds and a hundred firewood in store, for the cold snaps.',
    },
    {
      letter: [
        'My dears,',
        'Last lesson, and it is the one I like best. A herbalist in the middle of town: someone to brew the remedies, mind the coughs and tell people to wear a hat. The homes near one stay well, and in winter they feel the cold a little less, mostly because I told them to wear a hat.',
        'Mind the herb garden keeps it supplied. A herbalist without herbs is just a person with strong opinions, and the town already has me.',
        'Mother T.',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'herbalist', atLeast: 1 } },
      reward: { bond: 1, mood: 10 },
      hint: 'A herbalist in town.',
    },
  ],
  finale: {
    letter: [
      'My dears,',
      'Herbs drying in the rafters, a woodpile you could lose a cat in, hot baths and a herbalist with a firm view on hats. {town} is ready for any winter the hills care to send, and I am more pleased than I am letting on.',
      'I am staying. I have drawn up a cottage for myself, with a proper drying loft and room for a porch, and you may build it wherever the light is good. I have also written out the plans for a clinic, for when {town} is a town. That will need more hands than mine.',
      'With love, and a jar of something for your chest,',
      'Mother Thornbury',
    ].join('\n'),
    unlock: ['herbalists-cottage'],
    coins: 50,
    bond: 1,
    mood: 15,
  },
};

/** Mother Thornbury's finale: a cottage with a drying loft (module slots for C5C's porch and dormer). */
export const herbalistsCottage: BuildingDef = {
  id: 'herbalists-cottage',
  name: "Herbalist's Cottage",
  lane: 'hearth',
  category: 'home',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 30,
    goods: [
      ['planks', 18],
      ['stone', 8],
    ],
  },
  upkeep: 0,
  housing: { households: 1, residents: 4 },
  work: 10,
  charm: [{ category: 'nature', value: 4, radius: 3 }],
  tags: ['home', 'garden', 'warm'],
  moduleSlots: [
    ['front', 1],
    ['roof', 1],
  ],
  // Unlocked by Mother Thornbury's finale (into hearth.unlocked).
  requires: { rank: 'village', story: true },
  art: { kit: 'cottage', params: { kit: 'herbalists-cottage' } },
};
