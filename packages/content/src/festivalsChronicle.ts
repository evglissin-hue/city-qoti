import type { ChronicleTemplate } from './types';

// I3 Chronicle kinds for festivals, renown, commissions and the River Dock (C5B). Params by kind:
//   festival          {festival} {stars} {guests} {place}
//   renown-level      {level}
//   commission-done   {commission} {from}
//   first-boat        {neighbor}

export const commissionDone: ChronicleTemplate = {
  kind: 'commission-done',
  text: [
    '{town} kept its word to {from}: {commission}, delivered on time and in one piece.',
    'A letter of thanks came from {from} for {commission}. It has been pinned up where everyone can pretend not to read it.',
    '{commission}: done. {from} says {town} is the kind of place you can count on, which is nice to hear in writing.',
  ],
};

export const festival: ChronicleTemplate = {
  kind: 'festival',
  text: [
    'The {festival} on {place}: {guests} came, and the town gave it {stars} stars. The tables were cleared long after the lanterns burned low.',
    '{guests} turned out for the {festival} on {place}. Verdict: {stars} stars, several speeches nobody asked for, and not a crumb left over.',
    'The {festival} filled {place} with {guests} of us until well after dark. {stars} stars, and a few sore feet in the morning.',
  ],
  notable: true,
};

export const firstBoat: ChronicleTemplate = {
  kind: 'first-boat',
  text: [
    'The first boat tied up at the River Dock and pushed off for {neighbor} with the current. The ducks escorted it to the bend.',
    'A boat left {town} for {neighbor} this morning, low in the water and in no hurry. The river is a road now, too.',
    'The River Dock sent its first boat downstream to {neighbor}. Half the town waved it off; the other half asked what it was carrying.',
  ],
  notable: true,
};

export const renownLevel: ChronicleTemplate = {
  kind: 'renown-level',
  text: [
    'Word gets around: up and down the valley, {town} is now {level}.',
    'Travelers have started saying the name of {town} as if they had heard it before. Renown: {level}.',
    'The County Gazette mentioned {town} in a paragraph of its own. We are, it seems, {level}.',
  ],
  notable: true,
};

export const shopOpened: ChronicleTemplate = {
  kind: 'shop-opened',
  text: [
    '{name} opened {shop} on the high street, with a hand-painted sign and a bell over the door.',
    'A new sign went up today: {shop}. {name} has been saving for it longer than anyone knew.',
    '{shop} is open. {name} stood in the doorway all morning, which is how you know it is real.',
  ],
  notable: true,
};
