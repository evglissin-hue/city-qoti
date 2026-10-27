import type { DecorDef, FestivalDef, FestivalTwistDef } from './types';

// I3 festivals, twists and festival pieces (docs/spec/12-hearth.md, Festivals). C5.0 seeds ids and
// names; C5B writes the rest. Festival pieces are locked decor (the festival planner places them,
// never the ordinary decor picker) and vanish the morning after unless kept.

// --- Festivals (one per season, alphabetical) -------------------------------------------------

export const blossomFair: FestivalDef = {
  id: 'blossom-fair',
  name: 'Blossom Fair',
  season: 0,
  blurb: 'Stalls under the blossom, and a prize for the best-kept garden.',
  pieces: ['bunting', 'festival-stall', 'flower-arch'],
};

export const harvestSupper: FestivalDef = {
  id: 'harvest-supper',
  name: 'Harvest Supper',
  season: 2,
  blurb: 'Long tables, a bonfire and everything the fields gave this year.',
  pieces: ['bonfire', 'festival-stall', 'festival-table'],
};

export const hearthFeast: FestivalDef = {
  id: 'hearth-feast',
  name: 'Winter Hearth Feast',
  season: 3,
  blurb: 'A bonfire, hot pies and everyone who can still feel their toes.',
  pieces: ['bonfire', 'festival-table', 'bunting'],
};

export const lanternNight: FestivalDef = {
  id: 'lantern-night',
  name: 'Midsummer Lantern Night',
  season: 1,
  blurb: 'Lanterns on every lane and music until the moths go home.',
  pieces: ['bunting', 'festival-stage', 'festival-stall'],
};

// --- Twists (alphabetical; C5B writes their goals) --------------------------------------------

export const costumeParade: FestivalTwistDef = {
  id: 'costume-parade',
  name: 'Costume Parade',
  blurb: 'Everyone dresses up as something they are not, mostly vegetables.',
};

export const harvestDisplay: FestivalTwistDef = {
  id: 'harvest-display',
  name: 'Harvest Display',
  blurb: 'The biggest marrow wins. Nobody asks how it got that big.',
  seasons: [2],
};

export const lanternsOnTheWater: FestivalTwistDef = {
  id: 'lanterns-on-the-water',
  name: 'Lanterns on the Water',
  blurb: 'Paper lanterns set adrift at dusk, if the river will have them.',
  seasons: [0, 1, 2],
};

export const pieContest: FestivalTwistDef = {
  id: 'pie-contest',
  name: 'Pie Contest',
  blurb: 'Judged on crust, filling and how long the judges stay quiet afterward.',
};

export const snowSculptures: FestivalTwistDef = {
  id: 'snow-sculptures',
  name: 'Snow Sculptures',
  blurb: 'The snow is free. The opinions about it are not.',
  seasons: [3],
};

// --- Festival pieces (decor; alphabetical in the decor registry) ------------------------------

export const bonfire: DecorDef = {
  id: 'bonfire',
  name: 'Bonfire',
  lane: 'hearth',
  radius: 96,
  blocksWalking: true,
  tags: ['festival', 'fire'],
  art: { kit: 'lantern', params: { kit: 'bonfire' } },
  locked: true,
  festival: {},
};

export const bunting: DecorDef = {
  id: 'bunting',
  name: 'Bunting',
  lane: 'hearth',
  radius: 32,
  linear: true,
  onRoad: true,
  tags: ['festival', 'bunting'],
  art: { kit: 'fence', params: { kit: 'bunting' } },
  locked: true,
  festival: { keepable: true },
};

export const festivalStage: DecorDef = {
  id: 'festival-stage',
  name: 'Festival Stage',
  lane: 'hearth',
  radius: 128,
  blocksWalking: true,
  tags: ['festival', 'stage', 'music'],
  art: { kit: 'crates', params: { kit: 'festival-stage' } },
  locked: true,
  festival: {},
};

export const festivalStall: DecorDef = {
  id: 'festival-stall',
  name: 'Festival Stall',
  lane: 'hearth',
  radius: 96,
  blocksWalking: true,
  tags: ['festival', 'stall'],
  art: { kit: 'crates', params: { kit: 'festival-stall' } },
  locked: true,
  festival: {},
};

export const festivalTable: DecorDef = {
  id: 'festival-table',
  name: 'Festival Table',
  lane: 'hearth',
  radius: 80,
  blocksWalking: true,
  tags: ['festival', 'table', 'seat'],
  art: { kit: 'bench', params: { kit: 'festival-table' } },
  locked: true,
  festival: {},
};

export const flowerArch: DecorDef = {
  id: 'flower-arch',
  name: 'Flower Arch',
  lane: 'hearth',
  radius: 48,
  onRoad: true,
  tags: ['festival', 'flower'],
  art: { kit: 'flower-bed', params: { kit: 'flower-arch' } },
  locked: true,
  festival: { keepable: true },
};
