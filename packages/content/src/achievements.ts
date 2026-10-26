import type { AchievementDef } from './types';

// The ten I1 achievements (docs/spec/15-progression.md): feats and stories, checked hourly.

export const balancedBooks: AchievementDef = {
  id: 'balanced-books',
  name: 'Balanced Books',
  description: 'A season ended with more coming in than going out.',
  lane: 'ledger',
  condition: { count: { what: 'seasonsInSurplus', atLeast: 1 } },
};

export const breadOnTheTable: AchievementDef = {
  id: 'bread-on-the-table',
  name: 'Bread on the Table',
  description: 'The first loaf came out of the oven.',
  lane: 'ledger',
  condition: { count: { what: 'goodProduced', ref: 'bread', atLeast: 1 } },
};

export const builtTogether: AchievementDef = {
  id: 'built-together',
  name: 'Built Together',
  description: 'A pattern site holds pieces placed by both of you.',
  lane: 'shared',
  condition: { count: { what: 'builtTogether', atLeast: 1 } },
};

export const everyDoorAName: AchievementDef = {
  id: 'every-door-a-name',
  name: 'Every Door a Name',
  description: 'Twenty residents call the valley home.',
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
  description: 'The first planks were sawn.',
  lane: 'ledger',
  condition: { count: { what: 'goodProduced', ref: 'planks', atLeast: 1 } },
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
  description: 'Five wishes came true.',
  lane: 'hearth',
  condition: { count: { what: 'wishesGranted', atLeast: 5 } },
};
