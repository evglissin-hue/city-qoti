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
  text: [
    '{place} drew {n} folk and had nothing to sell them.',
    '{n} folk spent the evening at {place} and went home with every coin they brought.',
  ],
  closes: 'A shop or stall with treats on the shelf within three tiles, two evenings running.',
  closed: '{place} has something to sell at last: {closers} saw to the treats.',
  closedQuiet: '{place} has treats in reach again.',
};

export const nobodyPasses: GapDef = {
  kind: 'nobodyPasses',
  from: 'R2',
  lane: 'hearth',
  threshold: 4,
  openAfter: 3,
  closeAfter: 1,
  text: [
    '{shop} had treats out three evenings running and {folk} came by. The evening walks elsewhere.',
    '{shop} has a full shelf and an empty doorstep: {folk} in three evenings. Nobody walks this way.',
  ],
  closes:
    'A place within three tiles that draws eight or more of an evening: seats, some charm, somewhere to be.',
  closed: 'Folk walk past {shop} now: {closers} gave them somewhere to be.',
  closedQuiet: 'Folk walk past {shop} again.',
};

export const nowhereToGo: GapDef = {
  kind: 'nowhereToGo',
  from: 'R2',
  lane: 'hearth',
  threshold: 6,
  openAfter: 3,
  closeAfter: 1,
  text: [
    '{street} stays in of an evening.',
    '{n} households on {street} stayed in three evenings running, for want of anywhere to go.',
    '{street} has {n} households and nowhere for them to go of an evening.',
  ],
  closes: 'Somewhere worth the walk, with a seat or two, near enough that half of them go out.',
  closed: '{street} goes out of an evening now, thanks to {closers}.',
  closedQuiet: '{street} goes out of an evening again.',
};

export const shortOfSupplies: GapDef = {
  kind: 'shortOfSupplies',
  from: 'R3',
  lane: 'ledger',
  // R3A: visitors on the evening (R2's "draws 8+"): only a place folk came to opens one.
  threshold: 8,
  openAfter: 2,
  closeAfter: 2,
  text: [
    '{place} wants {n} {good} {when}; the town makes {makes}.',
    '{place} could use {n} {good} {when}, and the town makes {makes}. The shelves are being polite about it.',
    'Something at {place} needs {n} {good} {when}. The town makes {makes}, which is a start.',
  ],
  closes:
    'Enough of what its pieces burn, two nights running: stock the storehouse, switch on the places, or let the place rest.',
  closed: '{place} is supplied again: {closers} saw to it.',
  closedQuiet: '{place} has its supplies again.',
};
