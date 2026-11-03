import type { DecorDef, FestivalDef, FestivalTuning, FestivalTwistDef } from './types';

// I3 festivals, twists and festival pieces (docs/spec/12-hearth.md, Festivals). C5.0 seeds ids and
// names; C5B writes the rest. Festival pieces are locked decor that the ordinary decor tool may
// place while a festival is planned this season; they vanish at 04:00 the morning after it unless
// kept (keepable pieces only), and a piece unlocked by a festival milestone is ordinary decor.

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
  // Costumes take cloth (or coats, cut down by somebody brave).
  goal: { any: [{ stock: { good: 'cloth', atLeast: 8 } }, { stock: { good: 'coats', atLeast: 2 } }] },
};

export const harvestDisplay: FestivalTwistDef = {
  id: 'harvest-display',
  name: 'Harvest Display',
  blurb: 'The biggest marrow wins. Nobody asks how it got that big.',
  seasons: [2],
  goal: { code: 'festivalMenu', ref: 'vegetables', params: [['atLeast', 12]] },
};

export const lanternsOnTheWater: FestivalTwistDef = {
  id: 'lanterns-on-the-water',
  name: 'Lanterns on the Water',
  blurb: 'Paper lanterns set adrift at dusk, if the river will have them.',
  seasons: [0, 1, 2],
  goal: {
    all: [
      { code: 'festivalByWater', params: [['within', 6]] },
      { code: 'festivalPieces', ref: 'light', params: [['atLeast', 2]] },
    ],
  },
};

export const pieContest: FestivalTwistDef = {
  id: 'pie-contest',
  name: 'Pie Contest',
  blurb: 'Judged on crust, filling and how long the judges stay quiet afterward.',
  goal: { code: 'festivalMenu', ref: 'pies', params: [['atLeast', 10]] },
};

export const snowSculptures: FestivalTwistDef = {
  id: 'snow-sculptures',
  name: 'Snow Sculptures',
  blurb: 'The snow is free. The opinions about it are not.',
  seasons: [3],
  // Snow lies once the river has frozen; the sculptors want room between the tables.
  goal: {
    all: [{ code: 'riverFrozen' }, { code: 'festivalPieces', ref: 'festival', params: [['atLeast', 3]] }],
  },
};

// --- Scoring and rewards (C5B) ----------------------------------------------------------------

/**
 * How a festival scores. Both lanes show in it (P2): the Hearth's site, pieces and twist, the
 * Ledger's menu, and the music either can arrange. A plain Hamlet festival (a bare green, bread and
 * vegetables, no music) earns two stars; a planned one with a few pieces and a full table, three.
 */
export const festivalTuning: FestivalTuning = {
  weights: { site: 20, variety: 20, menu: 30, music: 15, twist: 15 },
  stars: [20, 40, 60, 80],
  reach: 24,
  weather: [
    ['rain', 700],
    ['storm', 450],
    ['snow', 900],
    ['fog', 900],
  ],
  moodFloor: 500,
  siteCharm: 40,
  patternBonus: 25,
  varietyFull: 4,
  menuGoods: 3,
  perGuest: 1,
  music: { none: 0, resident: 70, bandstand: 80, both: 100 },
  twist: 100,
  turnoutFloor: 600,
  mood: [0, 5, 8, 10, 13, 15],
  moodDays: 2,
  renown: [0, 1, 2, 4, 6, 9],
  unlocks: [
    [3, ['bunting']],
    [4, ['flower-arch']],
    [5, ['festival-stage']],
  ],
  donation: 1,
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
