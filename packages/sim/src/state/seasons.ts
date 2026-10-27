// Neutral I3 slices (C5.0): clear weather with the river open, no festival planned, no renown, no
// commissions or boats, empty habitats and Field Guide, no threat pressure, no Watch, no raid, no
// trial, and the first days guide over. New valleys and migrated I2 valleys both start here; a new
// standard valley with `settings.guide` on opens the guide (C5H). Sandbox valleys keep them and
// never touch them.
import { CHUNKS_PER_SIDE, DAYS_PER_SEASON, HABITAT_IDS, MAP_SIZE, SEASONS_PER_YEAR } from '../constants';
import type {
  FestivalState,
  GuideState,
  NatureState,
  SeasonsStats,
  ThreatState,
  WarmthStats,
  WatchState,
  WeatherState,
  WorldState,
} from '../contracts';
import { Flags, Water } from '../map/layers';
import { dayIndex } from '../systems/economy/time';

/** Floodplain reach: tiles within this many of the river (14-challenge.md, Flood). */
export const FLOODPLAIN_REACH = 6;
/** Floodplain height: tiles at this level or lower. */
export const FLOODPLAIN_MAX_HEIGHT = 1;

export function clearWeather(): WeatherState {
  return { today: 'clear', forecast: [], events: [], river: { frozen: false, frozenTick: -1 } };
}

export function emptyWarmth(): WarmthStats {
  return { winter: -1, coldHouseholdDays: 0, coldHouseholds: [] };
}

export function emptyFestival(): FestivalState {
  return { plan: null, pieces: [], live: false, outcome: null, history: [] };
}

export function emptyNature(): NatureState {
  const chunks = CHUNKS_PER_SIDE * CHUNKS_PER_SIDE;
  return {
    habitats: new Array<number>(HABITAT_IDS.length * chunks).fill(0),
    guide: [],
    hints: [],
    pests: [],
  };
}

export function calmThreats(): ThreatState {
  return {
    pressure: 0,
    deterrence: { walls: 0, towers: 0, lanterns: 0, watch: 0 },
    scheduled: null,
    wolves: [],
    history: [],
  };
}

export function emptyWatch(): WatchState {
  return { members: [], target: 0, training: 100, morale: 50, posture: [], duty: [], budget: 0 };
}

/** The guide as it starts: open at step 0 when `on`, else over before it began. */
export function startGuide(on: boolean): GuideState {
  return { step: 0, doneTicks: [], hidden: [false, false, false, false], over: !on };
}

export function emptySeasonsStats(): SeasonsStats {
  return { raidsHeld: 0, warmWinters: 0, bestStars: 0, together: [] };
}

/** The I3 slices of a fresh WorldState. The guide starts over; createWorld opens it (C5H). */
export function emptySeasonsSlices(): Pick<
  WorldState,
  | 'weather'
  | 'warmth'
  | 'festival'
  | 'renown'
  | 'commissions'
  | 'dock'
  | 'nature'
  | 'threats'
  | 'watch'
  | 'raid'
  | 'trial'
  | 'guide'
  | 'seasons'
> {
  return {
    weather: clearWeather(),
    warmth: emptyWarmth(),
    festival: emptyFestival(),
    renown: { points: 0, level: 0, log: [] },
    commissions: { list: [] },
    dock: { boats: [], log: [] },
    nature: emptyNature(),
    threats: calmThreats(),
    watch: emptyWatch(),
    raid: null,
    trial: null,
    guide: startGuide(false),
    seasons: emptySeasonsStats(),
  };
}

/**
 * Sets Flags.floodplain on land at height FLOODPLAIN_MAX_HEIGHT or lower within FLOODPLAIN_REACH
 * tiles (Chebyshev) of river water, and clears it everywhere else. Ponds and canals do not flood.
 */
export function markFloodplain(map: { height: Uint8Array; water: Uint8Array; flags: Uint8Array }): void {
  const S = MAP_SIZE;
  const R = FLOODPLAIN_REACH;
  // Distance to the nearest river tile along rows, then columns (a separable Chebyshev pass).
  const far = R + 1;
  const row = new Uint8Array(S * S).fill(far);
  for (let z = 0; z < S; z++) {
    let d = far;
    for (let x = 0; x < S; x++) {
      const w = map.water[z * S + x];
      d = w === Water.river || w === Water.riverDeep ? 0 : Math.min(far, d + 1);
      row[z * S + x] = d;
    }
    d = far;
    for (let x = S - 1; x >= 0; x--) {
      const w = map.water[z * S + x];
      d = w === Water.river || w === Water.riverDeep ? 0 : Math.min(far, d + 1);
      if (d < row[z * S + x]!) row[z * S + x] = d;
    }
  }
  for (let x = 0; x < S; x++) {
    for (let z = 0; z < S; z++) {
      const i = z * S + x;
      let best = far;
      for (let dz = -R; dz <= R; dz++) {
        const zz = z + dz;
        if (zz < 0 || zz >= S) continue;
        const v = Math.max(row[zz * S + x]!, dz < 0 ? -dz : dz);
        if (v < best) best = v;
      }
      const flood = best <= R && map.water[i] === Water.none && map.height[i]! <= FLOODPLAIN_MAX_HEIGHT;
      map.flags[i] = flood ? map.flags[i]! | Flags.floodplain : map.flags[i]! & ~Flags.floodplain;
    }
  }
}

/** Season index (0 spring to 3 winter) and year index (0 = year 1) at a tick. */
export function seasonAt(tick: number): { season: number; year: number; day: number } {
  const d = dayIndex(tick);
  const season = Math.floor(d / DAYS_PER_SEASON) % SEASONS_PER_YEAR;
  return {
    season,
    year: Math.floor(d / (DAYS_PER_SEASON * SEASONS_PER_YEAR)),
    day: (d % DAYS_PER_SEASON) + 1,
  };
}
