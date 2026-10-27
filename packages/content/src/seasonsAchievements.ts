import type { AchievementDef } from './types';

// The five I3 achievements (docs/spec/15-progression.md, Achievements). Their counts come from the
// I3 slices (state.seasons, state.nature), which C5A to C5D fill.

export const fieldNotes: AchievementDef = {
  id: 'field-notes',
  name: 'Field Notes',
  description: 'Ten species in the Field Guide, each one met in person.',
  lane: 'hearth',
  condition: { count: { what: 'fieldGuide', atLeast: 10 } },
};

export const fiveStars: AchievementDef = {
  id: 'five-stars',
  name: 'Five Stars',
  description: 'A festival so good the town still talks about the pies.',
  lane: 'shared',
  condition: { count: { what: 'festivalStars', atLeast: 5 } },
};

export const theGateHeld: AchievementDef = {
  id: 'the-gate-held',
  name: 'The Gate Held',
  description: 'Raiders came, saw the Watch and went home with nothing.',
  lane: 'ledger',
  condition: { count: { what: 'raidsHeld', atLeast: 1 } },
};

export const theRiverRunsClean: AchievementDef = {
  id: 'the-river-runs-clean',
  name: 'The River Runs Clean',
  description: 'A kingfisher fished the river, which is the river saying thank you.',
  lane: 'hearth',
  condition: { count: { what: 'sighted', ref: 'kingfisher', atLeast: 1 } },
};

export const warmHearths: AchievementDef = {
  id: 'warm-hearths',
  name: 'Warm Hearths',
  description: 'A whole winter and not one cold household.',
  lane: 'ledger',
  condition: { count: { what: 'warmWinters', atLeast: 1 } },
};
