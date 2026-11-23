import type { FestivalTwistDef } from './types';

// R3C: a custom is a habit the town fell into (townBook.ts), and a festival held where the town keeps
// that habit can lean on it (docs/spec/19-evenings.md, The Town Book). One twist per custom, offered
// once the custom's page is found. None has a goal: the twist holds when the festival's ground covers
// the place where the custom lives (systems/festivals/score.ts). Ids are stored in saves and never
// change once shipped. Each blurb says where to hold the festival, in the town's voice.

export const customBuntingSeason: FestivalTwistDef = {
  id: 'custom-bunting-season',
  name: 'Bunting Season',
  blurb:
    'The bunting is up before anyone asks. Hold the festival under it, and it will feel it has been waiting.',
  custom: 'bunting-season',
};

export const customEveningWalk: FestivalTwistDef = {
  id: 'custom-evening-walk',
  name: 'The Evening Walk',
  blurb: 'Hold the festival along the lantern walk, and the town will arrive already dressed for it.',
  custom: 'evening-walk',
};

export const customGreenEvenings: FestivalTwistDef = {
  id: 'custom-green-evenings',
  name: 'Evenings on the Green',
  blurb: 'Hold it on the green, where the rugs and baskets come out whether or not anyone is invited.',
  custom: 'green-evenings',
};

export const customLanternRound: FestivalTwistDef = {
  id: 'custom-lantern-round',
  name: 'The Lantern Round',
  blurb: 'Hold it where the lamplighter has worn a path, and let the lights make the entrance.',
  custom: 'lantern-round',
};

export const customLongTable: FestivalTwistDef = {
  id: 'custom-long-table',
  name: 'The Long Table',
  blurb: 'Hold it by the cafe tables, and seat the whole town at once. Elbows are permitted.',
  custom: 'long-table',
};

export const customMarketNight: FestivalTwistDef = {
  id: 'custom-market-night',
  name: 'Market Night',
  blurb: 'Hold it at the cross, where the stalls arrived one week and neglected to leave.',
  custom: 'market-night',
};

export const customOrchardStroll: FestivalTwistDef = {
  id: 'custom-orchard-stroll',
  name: 'The Orchard Stroll',
  blurb: 'Hold it under the fruit trees, which the town already considers good for them.',
  custom: 'orchard-stroll',
};

export const customPondEvening: FestivalTwistDef = {
  id: 'custom-pond-evening',
  name: 'The Pond Evening',
  blurb: 'Hold it by the pond. The ducks have opinions and will not be quiet about them.',
  custom: 'pond-evening',
};

export const customPromenade: FestivalTwistDef = {
  id: 'custom-promenade',
  name: 'The Promenade',
  blurb: 'Hold it along the river walk, where everyone nods twice and no one is in a hurry.',
  custom: 'promenade',
};

export const customSquareNight: FestivalTwistDef = {
  id: 'custom-square-night',
  name: 'Square Night',
  blurb: 'Hold it in the square, where folk turn up for no reason and leave with a pastry.',
  custom: 'square-night',
};

export const customTavernNight: FestivalTwistDef = {
  id: 'custom-tavern-night',
  name: 'Tavern Night',
  blurb: 'Hold it by the tavern, which has already ordered more chairs and will not be talked out of them.',
  custom: 'tavern-night',
};

export const customWellGathering: FestivalTwistDef = {
  id: 'custom-well-gathering',
  name: 'The Well Gathering',
  blurb: 'Hold it at the well, where news travels fastest and the water has heard it all.',
  custom: 'well-gathering',
};

export const customWinterFires: FestivalTwistDef = {
  id: 'custom-winter-fires',
  name: 'The Winter Fires',
  blurb: 'Hold it where the town keeps its fires through the cold months, and nobody will want to go home.',
  seasons: [3],
  custom: 'winter-fires',
};
