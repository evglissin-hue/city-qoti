import type { ChronicleTemplate, MasterDef, MasteryTuning } from './types';

// Masters (docs/spec/19-evenings.md, Masters), written in R3.0. One row for each trade and each
// specialized building that has masters. A master's good is made while one is on the crew, from the
// raw goods the trade already takes (rule 2: a made good is never an input). Hours follow the trade's
// own method. R3B adds the unlocks the forester and the quarryman bring.

/** What it takes to become a master, and how a business keeps its level. Every number tunes here. */
export const MASTERY: MasteryTuning = {
  // Four hearts...
  hearts: 4,
  // ...and twenty working days in one trade, an apprentice's day counting twice.
  days: 20,
  apprenticeWeight: 2,
  // In a business of level 2 or more, or at a specialized building.
  level: 2,
  // One new master a trade a season.
  perTradeSeason: 1,
  // An apprentice who served a season under a master becomes one after ten working days of their own.
  apprenticeDays: 10,
  // A business keeps its level six days after its last master leaves, then slides.
  graceDays: 6,
  // The carrier sells a master's good once the town holds more than this (and twice a day's buying).
  exportKeep: 8,
};

export const baker: MasterDef = {
  of: 'baker',
  title: 'master baker',
  good: 'pies',
  method: {
    id: 'bake-pies',
    name: 'Bake pies',
    kind: 'craft',
    inputs: [['grain', 2]],
    outputs: [['pies', 2]],
    hours: 2,
    workers: 1,
  },
  level3: true,
  apprentices: true,
};

export const carpenter: MasterDef = {
  of: 'carpenter',
  title: 'master carpenter',
  good: 'toys',
  method: {
    id: 'carve-toys',
    name: 'Carve toys',
    kind: 'craft',
    inputs: [['timber', 1]],
    outputs: [['toys', 2]],
    hours: 3,
    workers: 1,
  },
  level3: true,
  apprentices: true,
};

export const chandler: MasterDef = {
  of: 'chandler',
  title: 'master chandler',
  good: 'soap',
  method: {
    id: 'boil-soap',
    name: 'Boil soap',
    kind: 'craft',
    inputs: [['honey', 1]],
    outputs: [['soap', 3]],
    hours: 1,
    workers: 1,
  },
  level3: true,
  apprentices: true,
};

export const ciderMaker: MasterDef = {
  of: 'cider-maker',
  title: 'master cider maker',
  good: 'cordial',
  method: {
    id: 'steep-cordial',
    name: 'Steep cordial',
    kind: 'craft',
    inputs: [['fruit', 1]],
    outputs: [['cordial', 2]],
    hours: 1,
    workers: 1,
  },
  level3: true,
  apprentices: true,
};

export const dairy: MasterDef = {
  of: 'dairy',
  title: 'master cheesemaker',
  good: 'butter',
  method: {
    id: 'churn-butter',
    name: 'Churn butter',
    kind: 'gather',
    inputs: [],
    outputs: [['butter', 2]],
    hours: 3,
    workers: 2,
    perWorker: true,
  },
  level3: true,
  apprentices: true,
};

export const fishery: MasterDef = {
  of: 'fishery',
  title: 'master fisher',
  good: 'smoked-fish',
  method: {
    id: 'smoke-fish',
    name: 'Smoke fish',
    kind: 'craft',
    inputs: [['fish', 2]],
    outputs: [['smoked-fish', 2]],
    hours: 2,
    workers: 1,
  },
  apprentices: true,
};

/** R3B adds the ornamental trees a master forester unlocks. */
export const forestersLodge: MasterDef = {
  of: 'foresters-lodge',
  title: 'master forester',
  unlocks: ['ornamental-tree'],
  apprentices: true,
};

export const grainFarm: MasterDef = {
  of: 'grain-farm',
  title: 'master grain farmer',
  level3: true,
  apprentices: true,
};

export const hives: MasterDef = {
  of: 'hives',
  title: 'master beekeeper',
  good: 'mead',
  method: {
    id: 'brew-mead',
    name: 'Brew mead',
    kind: 'craft',
    inputs: [['honey', 1]],
    outputs: [['mead', 1]],
    hours: 6,
    workers: 1,
  },
  level3: true,
  apprentices: true,
};

export const marketGarden: MasterDef = {
  of: 'market-garden',
  title: 'master gardener',
  level3: true,
  apprentices: true,
};

export const orchard: MasterDef = {
  of: 'orchard',
  title: 'master orchardist',
  good: 'jam',
  method: {
    id: 'boil-jam',
    name: 'Boil jam',
    kind: 'craft',
    inputs: [['fruit', 2]],
    outputs: [['jam', 2]],
    hours: 2,
    workers: 1,
  },
  level3: true,
  apprentices: true,
};

/** R3B adds the carved stone a master quarryman unlocks. */
export const quarry: MasterDef = {
  of: 'quarry',
  title: 'master quarryman',
  unlocks: ['carved-stone'],
  apprentices: true,
};

export const sheepRun: MasterDef = {
  of: 'sheep-run',
  title: 'master shepherd',
  level3: true,
  apprentices: true,
};

export const shop: MasterDef = {
  of: 'shop',
  title: 'master shopkeeper',
  level3: true,
  apprentices: true,
};

export const weaver: MasterDef = {
  of: 'weaver',
  title: 'master weaver',
  good: 'coats',
  method: {
    id: 'sew-coats',
    name: 'Sew coats',
    kind: 'craft',
    inputs: [['wool', 2]],
    outputs: [['coats', 1]],
    hours: 3,
    workers: 1,
  },
  level3: true,
  apprentices: true,
};

/** A master miller makes room for one more baker in the mill's reach. */
export const windmill: MasterDef = {
  of: 'windmill',
  title: 'master miller',
  apprentices: true,
  room: 'baker',
};

// --- Words (R3B) ---------------------------------------------------------------------------------
// The town's voice for a new master and for losing one. Variants rotate (the sim walks each list
// before repeating). Placeholders: {name} the master, {title} ("master baker"), {place} where they
// work ("the bakery"), {town}.

export const masterWords = {
  /** A letter to the town when someone becomes a master ({name} {title} {place} {town}). */
  letter: [
    'A letter from the Guild of Nobody In Particular: {name} of {place} is now a {title}. A sign will go up over the door. The sign is rather proud of itself already.',
    'Word has gone round {town}: {name} has been named a {title}. Nobody was asked to vote, and nobody minded.',
    'By long habit, steady hands and a great deal of getting up early, {name} is now a {title}. Over at {place}, the sign has been told and is standing a little straighter.',
    'The valley has a new {title}: {name}, of {place}. A small crowd gathered to say it was about time. It was a very small crowd, and very sincere.',
  ],
  /** The notice when someone becomes a master ({name} {title} {place}). */
  made: [
    '{name} is now a {title}. The sign went up over {place} before the paint was dry.',
    '{name} has become a {title}, which at {place} mostly means the same work, said with more weight.',
    'A good many good days later, {name} is a {title}. Everyone at {place} is pleased and pretending not to be.',
    '{name} was named a {title} today. The apprentices at {place} are taking notes.',
  ],
  /** The notice when a master retires ({name} {title}). */
  lostRetired: [
    '{name}, {title}, has retired. The trade will miss the hands, and the stories that came with them.',
    'The {title} has hung up the apron: {name} is retired, still a master, and off the schedule for good.',
    '{name} has stepped back from the work. A {title} does not stop being one, but the business will feel the gap.',
    'Retirement has found {name}, the {title}. The workshop is quiet, in the way a room is quiet after a good talker leaves.',
  ],
  /** The notice when a master's household leaves the valley ({name} {title}). */
  lostLeft: [
    '{name}, {title}, is leaving the valley. The trade has had worse news, but not recently.',
    'The household of {name} is packing up, and with them goes a {title}. The sign will hang a while out of habit.',
    '{name} is off, and a {title} walks out of {town} with the good tools. The business has some days to find its feet.',
    'A {title} has decided the grass is greener elsewhere. {name} is leaving, and the neighbors are being brave about it.',
  ],
  /** The Chronicle's `{why}` for a master lost: retired, or left the valley. */
  whyRetired: ['has retired', 'has hung up the apron', 'has stepped back from the work'],
  whyLeft: ['is leaving the valley', 'has packed up and gone', 'is off over the hills'],
} as const;

export const masterMade: ChronicleTemplate = {
  kind: 'master-made',
  text: [
    '{name} became a {title} today, at {place}. The sign over the door is new, and so is the way the neighbors say hello.',
    'A {title} for {town}: {name}, of {place}. Years of habit, it turns out, add up to something you can paint on a board.',
    '{name} is now a {title}. A sign went up over {place}, and it has been polished twice by people who were only passing.',
    'The valley counts a new {title}: {name}, at {place}. The apprentices have been told to look busy.',
  ],
  notable: true,
};

/** A story character whose arc is done: the town calls them a master (StoryArc.mastery). */
export const masterStory: ChronicleTemplate = {
  kind: 'master-story',
  text: [
    'With the last of their plans seen through, {name} is a {title} as far as {town} is concerned. Nobody asked them; everybody agreed.',
    '{name} has done what they came to do, and the valley has given them a title for it: {title}. Word has gone round {place}.',
    'It is official, or as official as {town} gets: {name} is its {title}. The sign was painted by three people who all claim the credit.',
  ],
  notable: true,
};

export const masterLost: ChronicleTemplate = {
  kind: 'master-lost',
  text: [
    'Our {title}, {name}, {why}. The business keeps its sign and its level for a few days, and its fingers crossed.',
    '{name}, the {title}, {why}. Everyone agrees it will not be the same, and has started to say so quietly.',
    'The valley loses a {title}: {name} {why}. Somebody has to learn the trade fast.',
  ],
  notable: true,
};
