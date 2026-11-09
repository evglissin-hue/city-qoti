import type { CallingDef, CallingTuning, ChronicleTemplate, DecorDef } from './types';

// Callings (docs/spec/15-progression.md, Callings): what the village is known for. The valley
// offers the two its map suits best when the Village Charter is claimed, and the seats pick one.
// Every number here is read by the sim; ids are stored in saves, so they never change once shipped.

export const callingTuning: CallingTuning = {
  offered: 2,
  // Pennies a day: 12 per point of the average door charm of homes (0 to 100) and 100 per renown
  // level, capped at 15 coins. A small, pleasant village earns 3 to 6 coins.
  visitors: { hour: 15, perCharm: 12, perRenown: 100, cap: 1500, noticeEveryDays: 7 },
};

/** The County's words. {town}, {a}, {b} (calling names), {ra}, {rb} (their reasons), {calling}, {signature}. */
export const callingPhrases = {
  offer:
    'A letter from the County Clerk: "Now that {town} is a village, the County would like to know what it means to be known for. The valley suggests two. {a}: {ra} {b}: {rb} Open the Calling card from the goal pill when you are ready; the County only asks once."',
  chosen:
    'A letter from the County Clerk: "Noted, with approval, that {town} means to be known as {calling}. A {signature} has been sent along, since it seemed the thing to send. Place it where it will be admired."',
  /** Garden Village: the weekly word on visitors ({town}, {coins}). */
  visitors: "This week's visitors left about {coins} behind in {town}, a good deal of it on cake.",
};

export const calling: ChronicleTemplate = {
  kind: 'calling',
  text: [
    '{town} has chosen what it will be known for: {calling}. The County has made a note, and so has the goat. Credit to {credit}.',
    'From today the valley will say {calling} when it says {town}. Nobody argued for long. Credit to {credit}.',
    '{calling}: that is what {town} means to be. The sign at the gate is being repainted already. Credit to {credit}.',
  ],
  notable: true,
};

export const gardenVillage: CallingDef = {
  id: 'garden-village',
  name: 'Garden Village',
  blurb: 'Pretty enough that people take the long way round to see it, and spend something on the way.',
  icon: 'calling-garden',
  effectLines: [
    'Day visitors spend in the town each afternoon, more as charm and renown grow.',
    'New districts lean toward Garden Plaster, with a little Riverside Timber.',
    'Unlocks the Rose arch.',
  ],
  visitors: true,
  styleWeights: [
    ['plaster', 3],
    ['timber', 1],
  ],
  signature: 'rose-arch',
  reasons: [
    'meadows are the kind people put on biscuit tins',
    'soil is rich enough to grow opinions',
    'water is never more than a few steps away',
  ],
};

export const millTown: CallingDef = {
  id: 'mill-town',
  name: 'Mill Town',
  blurb: 'Smoke from honest chimneys, the clatter of the wheel, and a ledger that likes it.',
  icon: 'calling-mill',
  effectLines: [
    'Workshops, mills, the quarry and the sawpits work 10% faster.',
    'New districts lean toward Market Brick and Hill Stone.',
    'Unlocks the Millstone bench.',
  ],
  yieldBoost: { ids: ['quarry', 'sawpit'], tags: ['mill', 'workshop'], permille: 100 },
  styleWeights: [
    ['brick', 3],
    ['stone', 2],
  ],
  signature: 'millstone-bench',
  reasons: ['hills are full of stone and clay', 'river never sits still'],
};

export const pilgrimsRest: CallingDef = {
  id: 'pilgrims-rest',
  name: "Pilgrims' Rest",
  blurb: 'A quiet place at the end of a long road, where people arrive tired and leave lighter.',
  icon: 'calling-pilgrim',
  effectLines: [
    'Festivals draw about a fifth more guests, and give one more renown at 2 stars or better.',
    'Lit lanterns give a little more light charm.',
    'New districts lean toward Hill Stone, with a little Riverside Timber.',
    'Unlocks the Wayside shrine.',
  ],
  festival: { guestsPermille: 200, renown: 1, minStars: 2 },
  lanternCharm: 1,
  styleWeights: [
    ['stone', 3],
    ['timber', 1],
  ],
  signature: 'wayside-shrine',
  reasons: [
    'hills climb high enough to look down on the weather',
    'woods are old and quiet',
    'summit sits a long, thoughtful walk from the gate',
  ],
};

// --- Signature decor (locked until the calling unlocks them; alphabetical in the decor registry) ---

export const millstoneBench: DecorDef = {
  id: 'millstone-bench',
  name: 'Millstone bench',
  lane: 'hearth',
  radius: 40,
  onRoad: true,
  tags: ['seat', 'millstone', 'calling'],
  art: { kit: 'millstone-bench' },
  charm: [{ category: 'comfort', value: 6, radius: 2 }],
  locked: true,
};

export const roseArch: DecorDef = {
  id: 'rose-arch',
  name: 'Rose arch',
  lane: 'hearth',
  radius: 40,
  onRoad: true,
  tags: ['arch', 'flower', 'calling'],
  art: { kit: 'rose-arch' },
  charm: [
    { category: 'nature', value: 6, radius: 2 },
    { category: 'view', value: 2, radius: 2 },
  ],
  locked: true,
};

export const waysideShrine: DecorDef = {
  id: 'wayside-shrine',
  name: 'Wayside shrine',
  lane: 'hearth',
  radius: 36,
  onRoad: true,
  tags: ['shrine', 'light', 'calling'],
  art: { kit: 'wayside-shrine' },
  charm: [
    { category: 'comfort', value: 3, radius: 2 },
    { category: 'light', value: 1, radius: 2, nightValue: 4 },
  ],
  locked: true,
};
