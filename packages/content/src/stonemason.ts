import type { StoryArc } from './types';

// Barnaby Ashcombe, the stonemason (docs/spec/11-residents.md, Story characters; C5D). He walks in
// once a Village has a quarry and has seen its first raid telegraphed (or already weathered one),
// and teaches walls and the Watch: a palisade, the Watch House, posting the Watch, a stone wall the
// Hearth has dressed, and a proper bridge. Stone walls unlock early with his third step. His
// finale is the Stone Bridge landmark.

export const stonemason: StoryArc = {
  id: 'stonemason',
  character: {
    given: 'Barnaby',
    family: 'Ashcombe',
    species: 'badger',
    traits: ['practical', 'grumpy', 'sporty'],
    stage: 'adult',
    bio: 'A stonemason who talks to walls, and claims the good ones answer.',
  },
  arrival: {
    all: [
      { count: { what: 'rank', atLeast: 1 } },
      { count: { what: 'buildings', ref: 'quarry', atLeast: 1 } },
      { code: 'raidSeen' },
    ],
  },
  hello: [
    'To whoever is in charge, or thinks they are,',
    'Barnaby Ashcombe, stonemason. I heard there were tracks in your woods and a quarry in your hills, which is the sort of news that gets a badger out of bed.',
    'I have taken a room. I will be looking at your fences in a disapproving way for a few days. Do not take it personally. I look at everything that way until it is made of stone.',
    'B. Ashcombe',
  ].join('\n'),
  steps: [
    {
      letter: [
        'Right.',
        'Before anyone builds anything handsome, build something honest: a palisade. Logs in the ground, close together, round the place you keep your goods. Leave a gate. A wall with no gate is a prison, and a town with no wall is a picnic.',
        'Six lengths will do to start. Bandits are lazy. Most of them only want an easy night.',
        'B. Ashcombe',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'palisade', atLeast: 6 } },
      reward: { coins: 20, bond: 1 },
      hint: 'Six lengths of palisade (paint a wall run) round a storehouse.',
    },
    {
      letter: [
        'Better.',
        'Walls do not stop anyone. People stop people, and walls give them somewhere to stand. Put up a Watch House and folk who care about this valley will sign on.',
        'They get a stipend, a staff and a lantern. Nobody fights. They stand together and look unimpressed, and you would be amazed how far that gets you.',
        'B. Ashcombe',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'watch-house', atLeast: 1 } },
      reward: { mood: 10, bond: 1 },
      hint: 'Build a Watch House and let volunteers sign on.',
    },
    {
      letter: [
        'Good.',
        'Now tell your Watch where to stand. A guard point at the storehouse, one at the market, one where the farms are loneliest. Raiders go where the goods are, so be there first.',
        'Do that and I will teach your masons stone walls. Proper ones, four times the palisade and twice as handsome.',
        'B. Ashcombe',
      ].join('\n'),
      goal: { code: 'watchPosted' },
      reward: { unlock: ['stone-wall'], coins: 20 },
      hint: 'Set the Watch posture: a guard point or two, and at least two members.',
    },
    {
      letter: [
        'Stone walls, then.',
        'A plain wall keeps bandits out. A wall with ivy on it and a flower box keeps them out and makes the neighbors jealous. Ask the Hearth to dress one. I will pretend I do not care how it looks.',
        'I care how it looks.',
        'B. Ashcombe',
      ].join('\n'),
      goal: { code: 'dressedWall' },
      reward: { mood: 10, bond: 1 },
      hint: 'A stone wall, dressed with a module by the Hearth.',
    },
    {
      letter: [
        'Last thing, and it is the one I came for.',
        'A town lives by its crossings. Build a road over the water, any road, and let me see folk walking it.',
        'Then we will talk about doing it properly.',
        'B. Ashcombe',
      ].join('\n'),
      goal: { code: 'bridgeBuilt' },
      reward: { coins: 30, bond: 1 },
      hint: 'Lay a road across the river.',
    },
  ],
  finale: {
    letter: [
      'Well.',
      'A wall that held, a Watch that turns out, stone that wears ivy and a road over the water. {town} is built to last, and I do not say that about many places. I say it about two, and the other one is a bridge in the south that I built.',
      'I have drawn you a Stone Bridge. Arches, a parapet you can lean on, and room underneath for the ducks to have their arguments. Put it where people cross.',
      'I am staying, if anyone was wondering. Someone has to keep an eye on the walls.',
      'B. Ashcombe',
    ].join('\n'),
    unlock: ['stone-bridge'],
    coins: 40,
    bond: 1,
    mood: 15,
    renown: 2,
  },
};
