import type { CallingDef, ChronicleTemplate } from './types';

// Callings (docs/spec/15-progression.md, Callings): what the town is known for. R3.0 brings P1's three
// back, earned instead of chosen: three Town Book pages of one leaning earn that calling, and no
// command picks one. Ids are stored in saves and never change once shipped; each signature is a locked
// decor piece in signatureDecor.ts.

/** The County's words. {town}, {calling}, {signature}, {leaning}, {coins}. */
export const callingPhrases = {
  earned:
    'A letter from the County Clerk: "Noted, with approval, that {town} has earned {calling}. Three pages of the Town Book lean {leaning}, and the County can count. A {signature} has been sent along, since it seemed the thing to send. Place it where it will be admired."',
  /** Garden Village: the weekly word on visitors ({town}, {coins}). */
  visitors: "This week's visitors left about {coins} behind in {town}, a good deal of it on cake.",
};

export const calling: ChronicleTemplate = {
  kind: 'calling',
  text: [
    '{town} has earned what it is known for: {calling}. The County has made a note, and so has the goat. Credit to {credit}.',
    'From today the valley will say {calling} when it says {town}. Nobody argued, because it was true. Credit to {credit}.',
    '{calling}: that is what {town} turned out to be. The sign at the gate is being repainted already. Credit to {credit}.',
  ],
  notable: true,
};

export const gardenVillage: CallingDef = {
  id: 'garden-village',
  name: 'Garden Village',
  blurb: 'Pretty enough that people take the long way round to see it, and spend something on the way.',
  icon: 'calling-garden',
  leaning: 'gardens',
  effectLines: [
    'Day visitors spend in the town each afternoon, more as charm and renown grow.',
    'Unlocks the Rose arch.',
  ],
  visitors: true,
  styleWeights: [
    ['plaster', 3],
    ['timber', 1],
  ],
  signature: 'rose-arch',
};

export const millTown: CallingDef = {
  id: 'mill-town',
  name: 'Mill Town',
  blurb: 'Smoke from honest chimneys, the clatter of the wheel, and a ledger that likes it.',
  icon: 'calling-mill',
  leaning: 'industry',
  effectLines: [
    'Room for one more workshop in the reach of each windmill and sawmill.',
    'Unlocks the Millstone bench.',
  ],
  room: { buildings: ['windmill', 'sawmill'], extra: 1 },
  styleWeights: [
    ['brick', 3],
    ['stone', 2],
  ],
  signature: 'millstone-bench',
};

export const pilgrimsRest: CallingDef = {
  id: 'pilgrims-rest',
  name: "Pilgrims' Rest",
  blurb: 'A quiet place at the end of a long road, where people arrive tired and leave lighter.',
  icon: 'calling-pilgrim',
  leaning: 'pilgrimage',
  effectLines: [
    'Festivals draw about a fifth more guests, and give one more renown at 2 stars or better.',
    'Lit lanterns give a little more light charm.',
    'Unlocks the Wayside shrine.',
  ],
  festival: { guestsPermille: 200, renown: 1, minStars: 2 },
  lanternCharm: 1,
  styleWeights: [
    ['stone', 3],
    ['timber', 1],
  ],
  signature: 'wayside-shrine',
};
