// Simulation constants (docs/spec/02-game-overview.md, 10-world-and-building.md, 16-coop.md).

// Map and units
export const MAP_SIZE = 192;
/** Sub-tile fixed point: 1 tile = 256 units (decor and agent positions). */
export const TILE_FP = 256;
export const CHUNK_SIZE = 16;
export const CHUNKS_PER_SIDE = MAP_SIZE / CHUNK_SIZE;
export const MAX_HEIGHT = 15;
export const DECOR_ROTATIONS = 64;

// Time and calendar
export const TICKS_PER_SECOND = 10;
/** The room emits one turn per TURN_MS of real time; 1 tick per turn at 1x. */
export const TURN_MS = 100;
export const TICKS_PER_HOUR = 200;
export const HOURS_PER_DAY = 24;
export const TICKS_PER_DAY = TICKS_PER_HOUR * HOURS_PER_DAY;
export const DAYS_PER_SEASON = 6;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
/** Calendar start: Year 1, Spring, day 1, 06:00. */
export const START_HOUR = 6;
/** Inclusive start hour, exclusive end hour; night wraps past midnight. */
export const DAY_PHASES = {
  night: [21, 5],
  dawn: [5, 7],
  day: [7, 18],
  dusk: [18, 21],
} as const;
export const WORK_HOURS = [8, 17] as const;
/** Day 6 of each season, 18:00 to 22:00 [I3]. */
export const FESTIVAL = { day: 6, from: 18, to: 22 } as const;
export const MAX_SPEED = 3;
export const DEFAULT_SPEED = 1;

// Sync
export const HASH_EVERY_TURNS = 50;
export const SNAPSHOT_EVERY_TURNS = 300;

// Limits
export const MAX_ROAD_TILES = 256;
export const MAX_REMOVE_IDS = 256;
export const MAX_NOTE_CHARS = 200;
export const MAX_NOTES = 200;
export const MAX_NAME_CHARS = 24;
export const MAX_VALLEY_NAME_CHARS = 32;
export const DECOR_CAP = 6000;
export const DECOR_WARN = 5500;
export const MAX_RUN_SEGMENTS = 64;
/** Decor may not come closer than this to a building footprint (fixed point). */
export const DECOR_BUILDING_MARGIN = 32;
