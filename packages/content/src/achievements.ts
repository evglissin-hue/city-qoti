import type { AchievementDef } from './types';

// The I1 achievements, and R1D's zones-first feats at the end (docs/spec/15-progression.md): feats
// and stories, checked hourly. The description is the plaque's inscription and is quoted in the
// Chronicle.

export const balancedBooks: AchievementDef = {
  id: 'balanced-books',
  name: 'Balanced Books',
  description: 'A whole season ended with more coming in than going out.',
  lane: 'ledger',
  condition: { count: { what: 'seasonsInSurplus', atLeast: 1 } },
};

export const breadOnTheTable: AchievementDef = {
  id: 'bread-on-the-table',
  name: 'Bread on the Table',
  description: 'The first loaf came out of the oven, and nobody waited for it to cool.',
  lane: 'ledger',
  condition: { count: { what: 'goodProduced', ref: 'bread', atLeast: 1 } },
};

export const builtTogether: AchievementDef = {
  id: 'built-together',
  name: 'Built Together',
  description: 'A pattern site holds pieces placed by both of you.',
  lane: 'shared',
  condition: {
    any: [{ count: { what: 'builtTogether', atLeast: 1 } }, { count: { what: 'togetherSites', atLeast: 1 } }],
  },
};

export const everyDoorAName: AchievementDef = {
  id: 'every-door-a-name',
  name: 'Every Door a Name',
  description: 'Twenty residents call the valley home, and everyone knows whose door is whose.',
  lane: 'shared',
  condition: { count: { what: 'residents', atLeast: 20 } },
};

export const firstFootsteps: AchievementDef = {
  id: 'first-footsteps',
  name: 'First Footsteps',
  description: 'The first household walked in through the valley gate.',
  lane: 'shared',
  condition: { count: { what: 'households', atLeast: 1 } },
};

export const hearthAndHome: AchievementDef = {
  id: 'hearth-and-home',
  name: 'Hearth and Home',
  description: 'The first page of the Pattern Book was written.',
  lane: 'hearth',
  condition: { count: { what: 'patternsDiscovered', atLeast: 1 } },
};

export const plankByPlank: AchievementDef = {
  id: 'plank-by-plank',
  name: 'Plank by Plank',
  description: 'The first timber was cut, measured twice and cut once.',
  lane: 'ledger',
  condition: { count: { what: 'goodProduced', ref: 'timber', atLeast: 1 } },
};

export const theLongWalkHome: AchievementDef = {
  id: 'the-long-walk-home',
  name: 'The Long Walk Home',
  description: 'A Lantern Walk lights someone home.',
  lane: 'hearth',
  condition: { count: { what: 'pattern', ref: 'lantern-walk', atLeast: 1 } },
};

export const wellMet: AchievementDef = {
  id: 'well-met',
  name: 'Well Met',
  description: 'The well became a gathering place.',
  lane: 'hearth',
  condition: { count: { what: 'pattern', ref: 'well-gathering-place', atLeast: 1 } },
};

export const wishesGranted: AchievementDef = {
  id: 'wishes-granted',
  name: 'Wishes Granted',
  description: 'Five wishes came true, and five thank-you letters were pinned up.',
  lane: 'hearth',
  condition: { count: { what: 'wishesGranted', atLeast: 5 } },
};

// R1 (R1D): the zones-first feats (docs/spec/15-progression.md, Achievements, the [R1] note).

export const aTownThatBuildsItself: AchievementDef = {
  id: 'a-town-that-builds-itself',
  name: 'A Town That Builds Itself',
  description: 'Ten businesses opened that nobody drew. The town has started making its own arrangements.',
  lane: 'ledger',
  condition: { count: { what: 'businesses', atLeast: 10 } },
};

export const marketDay: AchievementDef = {
  id: 'market-day',
  name: 'Market Day',
  description: 'Grain, vegetables, fruit, fish and cheese on the stalls at once, and a queue at every one.',
  lane: 'ledger',
  condition: { code: 'marketDay' },
};

export const porridgeNoMore: AchievementDef = {
  id: 'porridge-no-more',
  name: 'Porridge No More',
  description: 'Every household had three kinds of Food within reach. Porridge is now a choice.',
  lane: 'shared',
  condition: { code: 'porridgeNoMore' },
};
