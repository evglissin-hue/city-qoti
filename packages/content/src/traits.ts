import type { TraitDef } from './types';

// The sixteen I1 traits (docs/spec/11-residents.md). Effects are read by name in the sim
// (packages/sim/src/systems/residents/traits.ts): mood and friendMood in mood points, scheduleShift
// in hours, leisureRadius, walkSpeed, friendshipRate, friendshipDecay and homeTime in percent,
// productivity and gardenYield as percent bonuses, and the *Weight effects as leisure multipliers.
// Clashes are symmetric: if A clashes with B, B clashes with A.

export const artistic: TraitDef = {
  id: 'artistic',
  name: 'Artistic',
  blurb: 'Notices when every bench in town is the same bench.',
  clashes: ['practical'],
  befriends: ['artistic', 'romantic'],
  effects: [['varietyWeight', 2]],
};

export const bookish: TraitDef = {
  id: 'bookish',
  name: 'Bookish',
  blurb: 'Reads at breakfast, lunch and most of the way home.',
  clashes: ['sporty'],
  befriends: ['bookish', 'shy'],
  effects: [['quietWeight', 2]],
};

export const cheerful: TraitDef = {
  id: 'cheerful',
  name: 'Cheerful',
  blurb: 'Waves at people they have never met. They usually wave back.',
  clashes: ['grumpy'],
  befriends: ['cheerful', 'generous'],
  effects: [
    ['mood', 5],
    ['friendMood', 2],
  ],
};

export const curious: TraitDef = {
  id: 'curious',
  name: 'Curious',
  blurb: 'Takes the long way round, on purpose.',
  clashes: ['homebody'],
  befriends: ['curious', 'artistic'],
  effects: [['leisureRadius', 150]],
};

export const earlyBird: TraitDef = {
  id: 'early-bird',
  name: 'Early Bird',
  blurb: 'Up before the bakery, and slightly smug about it.',
  clashes: ['night-owl'],
  befriends: ['early-bird', 'practical'],
  effects: [['scheduleShift', -2]],
};

export const generous: TraitDef = {
  id: 'generous',
  name: 'Generous',
  blurb: 'Brings a pie to every door, including the wrong ones.',
  clashes: ['thrifty'],
  befriends: ['cheerful', 'generous'],
  effects: [['friendshipRate', 125]],
};

export const greenFingered: TraitDef = {
  id: 'green-fingered',
  name: 'Green-Fingered',
  blurb: 'Talks to tomatoes. The tomatoes seem to listen.',
  clashes: [],
  befriends: ['green-fingered', 'homebody'],
  effects: [['gardenYield', 20]],
};

export const grumpy: TraitDef = {
  id: 'grumpy',
  name: 'Grumpy',
  blurb: 'Has opinions about the weather, the bread and you.',
  clashes: ['cheerful'],
  befriends: ['grumpy'],
  effects: [['mood', -5]],
};

export const homebody: TraitDef = {
  id: 'homebody',
  name: 'Homebody',
  blurb: 'Considers the garden gate an expedition.',
  clashes: ['curious', 'sporty'],
  befriends: ['homebody', 'green-fingered'],
  effects: [
    ['leisureRadius', 50],
    ['homeTime', 60],
  ],
};

export const nightOwl: TraitDef = {
  id: 'night-owl',
  name: 'Night Owl',
  blurb: 'Does their best thinking after the lanterns are lit.',
  clashes: ['early-bird'],
  befriends: ['night-owl', 'romantic'],
  effects: [['scheduleShift', 2]],
};

export const practical: TraitDef = {
  id: 'practical',
  name: 'Practical',
  blurb: 'Owns one good knife and knows exactly where it is.',
  clashes: ['artistic'],
  befriends: ['practical', 'thrifty'],
  effects: [['productivity', 5]],
};

export const romantic: TraitDef = {
  id: 'romantic',
  name: 'Romantic',
  blurb: 'Will walk twice as far if there are lanterns.',
  clashes: [],
  befriends: ['romantic', 'artistic'],
  effects: [['lightWeight', 3]],
};

export const shy: TraitDef = {
  id: 'shy',
  name: 'Shy',
  blurb: 'Slow to say hello, impossible to lose as a friend.',
  clashes: [],
  befriends: ['shy', 'bookish'],
  effects: [
    ['friendshipRate', 50],
    ['friendshipDecay', 50],
    ['quietWeight', 2],
  ],
};

export const sporty: TraitDef = {
  id: 'sporty',
  name: 'Sporty',
  blurb: 'Jogs. Nobody is sure where to.',
  clashes: ['bookish', 'homebody'],
  befriends: ['sporty'],
  effects: [
    ['walkSpeed', 80],
    ['natureWeight', 2],
  ],
};

export const sweetTooth: TraitDef = {
  id: 'sweet-tooth',
  name: 'Sweet Tooth',
  blurb: 'Can smell a fresh loaf from the next parish.',
  clashes: [],
  befriends: ['sweet-tooth', 'cheerful'],
  effects: [['bakeryWeight', 3]],
};

export const thrifty: TraitDef = {
  id: 'thrifty',
  name: 'Thrifty',
  blurb: 'Reuses string. Has a drawer for it.',
  clashes: ['generous'],
  befriends: ['thrifty', 'practical'],
};
