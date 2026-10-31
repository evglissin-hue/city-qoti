import type { ChronicleTemplate } from './types';

// I3 Chronicle kinds for the seasons and the weather (C5A). Params by kind:
//   first-winter     (none)
//   first-frost      (none)
//   flood            {place}
//   cold-snap        (none)
//   circus           {place}
//   trial-passed     {trial} {charter}
//   trial-failed     {trial}

export const coldSnap: ChronicleTemplate = {
  kind: 'cold-snap',
  text: [
    'A cold snap came down from the hills. Every chimney in {town} smoked twice as hard, and the cats claimed the hearths.',
    'Frost on the inside of the windows this morning. {town} burned its firewood like it meant it.',
    'The cold snap arrived on schedule, which is more than can be said for the post. Woodpiles shrank all day.',
  ],
  notable: true,
};

export const circus: ChronicleTemplate = {
  kind: 'circus',
  text: [
    'A travelling circus pitched on {place} for an evening. There were jugglers, a dancing goat and a great deal of popcorn on the green afterward.',
    'The circus came to {town} and set up on {place}. Children are still walking on their hands. Parents are still asking them to stop.',
    'Lanterns, a striped tent and a strongman on {place}. The circus left at dawn, the town left a little richer.',
  ],
  notable: true,
};

export const firstFrost: ChronicleTemplate = {
  kind: 'first-frost',
  text: [
    'An early frost silvered the fields before the harvest was in. What was still standing took the worst of it.',
    'Frost came early to {town} this year, and it did not knock. The wheat still in the fields is the poorer for it.',
  ],
  notable: true,
};

export const firstWinter: ChronicleTemplate = {
  kind: 'first-winter',
  text: [
    'The first winter came to {town}. The river will freeze by tomorrow, the woodpiles are what they are, and everyone has found out where their thickest socks went.',
    'Winter, for the first time in {town}. Chimneys smoking, breath showing, and a general agreement that soup is the answer.',
  ],
  notable: true,
};

export const flood: ChronicleTemplate = {
  kind: 'flood',
  text: [
    'The river came over its banks by {place}. The low ground took a soaking, and so did a few cellars. Nobody was hurt, and the ducks were delighted.',
    'High water in {town}: the floodplain by {place} spent the day as part of the river. It will dry out. So, eventually, will the boots.',
  ],
  notable: true,
};

export const trialFailed: ChronicleTemplate = {
  kind: 'trial-failed',
  text: [
    '{trial} did not go our way this year. Some hearths went cold. The County Clerk wrote kindly, and the Charter waits for next winter.',
    'Not this time. {trial} found {town} a little short, and the Charter stays unsealed until the next one. The woodpiles will be bigger.',
  ],
  notable: true,
};

export const trialPassed: ChronicleTemplate = {
  kind: 'trial-passed',
  text: [
    '{town} came through {trial} fed and warm. The County has sealed the {charter} Charter, and a plaque went up in the Town Hall to prove it.',
    '{trial}: weathered. The {charter} Charter is sealed, the County is impressed, and {town} would like a nap.',
  ],
  notable: true,
};
