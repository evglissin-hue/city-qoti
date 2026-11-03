import type { CommissionDef } from './types';

// I3 commissions (docs/spec/13-ledger.md, Commissions; C5B). Neighbors ask from Village rank;
// notable visitors come as renown grows. Goods asks are met from town stock (the goods leave with
// the asker); condition asks are met when the condition holds. A missed deadline only closes the
// offer. Nothing is asked of a town that cannot make it yet: a goods ask waits until the town has
// made that good once, a condition ask until its building can be built (`builds`).

export const countySurveyor: CommissionDef = {
  id: 'county-surveyor',
  name: 'A landing for the County barge',
  from: 'visitor',
  visitor: 'Surveyor Hobbs',
  blurb: 'The County barge would stop here, if there were anywhere to tie it.',
  ask: { condition: { count: { what: 'buildings', ref: 'river-dock', atLeast: 1 } } },
  builds: 'river-dock',
  deadlineDays: 12,
  reward: { coins: 60, renown: 4 },
  renown: 2,
};

export const millhavenBread: CommissionDef = {
  id: 'millhaven-bread',
  name: 'Bread for the Millhaven threshers',
  from: 'millhaven',
  blurb: 'Our threshers eat like threshers. Could you spare a few loaves?',
  ask: { goods: [['bread', 24]] },
  deadlineDays: 4,
  reward: { coins: 60, renown: 2 },
};

export const millhavenFurniture: CommissionDef = {
  id: 'millhaven-furniture',
  name: 'Chairs for the Millhaven hall',
  from: 'millhaven',
  blurb: 'The hall has a roof and a dance floor. It would like chairs.',
  ask: { goods: [['furniture', 6]] },
  deadlineDays: 6,
  reward: { coins: 110, renown: 3, unlock: ['festival-table'] },
};

export const minstrelCandles: CommissionDef = {
  id: 'minstrel-candles',
  name: 'Candles for a long recital',
  from: 'visitor',
  visitor: 'Wren Ashdown, minstrel',
  blurb: 'I play until the candles go out. Make sure that is very late.',
  ask: { goods: [['candles', 20]] },
  deadlineDays: 6,
  reward: { coins: 40, renown: 3, unlock: ['bunting'] },
  renown: 2,
};

export const stonecrossCoats: CommissionDef = {
  id: 'stonecross-coats',
  name: 'Coats for the Stonecross quarrymen',
  from: 'stonecross',
  blurb: 'The wind up here has opinions. Our quarrymen would like coats to argue back.',
  ask: { goods: [['coats', 6]] },
  deadlineDays: 6,
  reward: { coins: 100, renown: 3 },
};

export const stonecrossPlanks: CommissionDef = {
  id: 'stonecross-planks',
  name: 'Planks for the Stonecross scaffolds',
  from: 'stonecross',
  blurb: 'We have plenty of stone and nothing to stand on while we stack it.',
  ask: { goods: [['planks', 30]] },
  deadlineDays: 5,
  reward: { coins: 90, renown: 2 },
};

export const theDowager: CommissionDef = {
  id: 'the-dowager',
  name: 'Pies for the Dowager of Amberly',
  from: 'visitor',
  visitor: 'the Dowager of Amberly',
  blurb: 'One has heard about the pies. One would like to stop hearing and start eating.',
  ask: { goods: [['pies', 30]] },
  deadlineDays: 6,
  reward: { coins: 90, renown: 5, unlock: ['flower-arch'] },
  renown: 3,
};
