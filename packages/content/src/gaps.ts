import type { GapDef } from './types';

// Gaps: requests the town writes itself (docs/spec/19-evenings.md, Gaps). R2.0 wrote the rules'
// numbers from the spec and first words; R2C owns the words and opens and closes them (from Village
// rank). The R3 row is here so the kinds stay in order; nothing opens it before R3. Words are warm and
// dry, and each says what would close it.

export const nothingToSell: GapDef = {
  kind: 'nothingToSell',
  from: 'R2',
  lane: 'ledger',
  threshold: 8,
  openAfter: 2,
  closeAfter: 2,
  text: ['{place} drew {n} folk and had nothing to sell them.'],
  closes: 'A shop or stall with treats within three tiles.',
};

export const nobodyPasses: GapDef = {
  kind: 'nobodyPasses',
  from: 'R2',
  lane: 'hearth',
  threshold: 4,
  openAfter: 3,
  closeAfter: 1,
  text: ['{shop} sold {n} treats in three evenings: nobody walks this way.'],
  closes: 'A place within three tiles that draws eight or more of an evening.',
};

export const nowhereToGo: GapDef = {
  kind: 'nowhereToGo',
  from: 'R2',
  lane: 'hearth',
  threshold: 6,
  openAfter: 3,
  closeAfter: 1,
  text: ['{street} stays in of an evening.'],
  closes: 'Somewhere worth the walk, with a seat or two, near enough that half of them go out.',
};

export const shortOfSupplies: GapDef = {
  kind: 'shortOfSupplies',
  from: 'R3',
  lane: 'ledger',
  threshold: 2,
  openAfter: 2,
  closeAfter: 2,
  text: ['{place} wants {n} a night; the town makes fewer.'],
  closes: 'Enough of what its pieces burn, two nights running.',
};
