import type { MasterDef, MasteryTuning } from './types';

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
