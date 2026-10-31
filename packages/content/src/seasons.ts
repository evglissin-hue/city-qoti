import type { EventDef, RenownDef, SeasonDef, ThreatDef, TrialDef, WeatherDef } from './types';

// I3 seasons, weather, events, renown and threats (docs/spec/14-challenge.md, 15-progression.md).
// C5.0 seeds ids, names and the spec's table; C5A writes weather odds and event numbers, C5B the
// renown curve, C5D the threats. Permille throughout: 1000 is x1.

// --- Seasons (in SeasonIndex order; the registry keeps this order) -----------------------------

export const spring: SeasonDef = {
  id: 'spring',
  name: 'Spring',
  index: 0,
  sow: [1, 3],
  river: 'high',
  events: ['flood'],
  festival: 'blossom-fair',
};

export const summer: SeasonDef = {
  id: 'summer',
  name: 'Summer',
  index: 1,
  river: 'best',
  events: ['circus', 'drought'],
  festival: 'lantern-night',
};

export const autumn: SeasonDef = {
  id: 'autumn',
  name: 'Autumn',
  index: 2,
  harvest: [1, 4],
  river: 'normal',
  events: ['early-frost'],
  festival: 'harvest-supper',
};

export const winter: SeasonDef = {
  id: 'winter',
  name: 'Winter',
  index: 3,
  river: 'freezes',
  warmth: 1,
  events: ['cold-snap'],
  festival: 'hearth-feast',
};

// --- Weather (alphabetical; C5A) -------------------------------------------------------------
// Odds are permille per day by season index (0 spring, 1 summer, 2 autumn, 3 winter); each
// season's column adds up to 1000. Effects are permille: farm and well output, the share of folk
// who still go out in the evening ('leisure'), each tile's walking ticks ('walk'), a storm's roofs.

export const clear: WeatherDef = {
  id: 'clear',
  name: 'Clear',
  odds: [
    [0, 350],
    [1, 480],
    [2, 300],
    [3, 260],
  ],
  effects: [],
};
export const cloudy: WeatherDef = {
  id: 'cloudy',
  name: 'Cloudy',
  odds: [
    [0, 250],
    [1, 160],
    [2, 280],
    [3, 240],
  ],
  effects: [],
};
export const fog: WeatherDef = {
  id: 'fog',
  name: 'Fog',
  odds: [
    [0, 70],
    [2, 100],
    [3, 100],
  ],
  effects: [['warning', 500]],
};
export const heat: WeatherDef = {
  id: 'heat',
  name: 'Heat',
  odds: [[1, 120]],
  effects: [['well', 800]],
};
export const rain: WeatherDef = {
  id: 'rain',
  name: 'Rain',
  odds: [
    [0, 300],
    [1, 160],
    [2, 250],
  ],
  effects: [
    ['farm', 1100],
    ['leisure', 500],
  ],
};
// Snow: 'walk' is permille of each tile's walking ticks (1300 is 30% slower).
export const snow: WeatherDef = {
  id: 'snow',
  name: 'Snow',
  odds: [[3, 350]],
  effects: [['walk', 1300]],
};
export const storm: WeatherDef = {
  id: 'storm',
  name: 'Storm',
  odds: [
    [0, 30],
    [1, 80],
    [2, 70],
    [3, 50],
  ],
  effects: [['roofs', 1]],
};

// --- Events (alphabetical; C5A). Odds are the chance per season, permille, times the dial. ------

export const circus: EventDef = {
  id: 'circus',
  name: 'Traveling Circus',
  season: 1,
  rank: 'village',
  odds: 600,
  forecastDays: [2, 2],
  durationDays: [1, 1],
  effects: [],
  blurb: 'A circus is on the road and looking for a green to pitch on.',
};

export const coldSnap: EventDef = {
  id: 'cold-snap',
  name: 'Cold Snap',
  season: 3,
  odds: 550,
  forecastDays: [1, 2],
  durationDays: [2, 2],
  effects: [['warmth', 2000]],
  blurb: 'A cold snap is coming. Every hearth will want twice the firewood.',
};

export const drought: EventDef = {
  id: 'drought',
  name: 'Drought',
  season: 1,
  odds: 400,
  forecastDays: [1, 2],
  durationDays: [2, 3],
  effects: [['farm', 600]],
  blurb: 'No rain in sight. Farms far from a well will feel it.',
};

export const earlyFrost: EventDef = {
  id: 'early-frost',
  name: 'Early Frost',
  season: 2,
  odds: 350,
  forecastDays: [1, 2],
  durationDays: [1, 1],
  effects: [['wheat', 500]],
  blurb: 'Frost is early this year. Wheat still in the field will suffer.',
};

export const flood: EventDef = {
  id: 'flood',
  name: 'Flood',
  season: 0,
  odds: 450,
  forecastDays: [1, 2],
  durationDays: [1, 2],
  effects: [['condition', 800]],
  blurb: 'The river is rising. The low ground by the water may flood.',
};

// --- Renown (in level order; C5B tunes the curve) ---------------------------------------------

export const renown0: RenownDef = { level: 0, name: 'Unknown', points: 0, effects: [] };
export const renown1: RenownDef = { level: 1, name: 'Spoken Of', points: 10, effects: [['trade', 2]] };
export const renown2: RenownDef = { level: 2, name: 'Well Regarded', points: 30, effects: [['trade', 4]] };
export const renown3: RenownDef = { level: 3, name: 'Admired', points: 60, effects: [['trade', 6]] };
export const renown4: RenownDef = { level: 4, name: 'Celebrated', points: 100, effects: [['trade', 8]] };
export const renown5: RenownDef = { level: 5, name: 'Storied', points: 160, effects: [['trade', 10]] };

// --- Threats (alphabetical; C5D writes the numbers) -------------------------------------------

export const bandits: ThreatDef = {
  id: 'bandits',
  name: 'Bandit gang',
  spawn: ['forest', 'road'],
  speed: 16,
  morale: 10,
  carry: 8,
};

export const wolves: ThreatDef = {
  id: 'wolves',
  name: 'Winter wolves',
  spawn: ['forest'],
  speed: 10,
  morale: 6,
  carry: 0,
};

// --- Trials (docs/spec/15-progression.md, Ranks and Charters) ---------------------------------

/** The Village Charter's trial: the first winter after the claim (C5A). */
export const firstWinter: TrialDef = {
  kind: 'winter',
  name: 'The First Winter',
  blurb: 'Get everyone through the first winter as a Village: fed on stored food, and warm.',
};
