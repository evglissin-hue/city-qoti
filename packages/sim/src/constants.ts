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

// ---------------------------------------------------------------------------------------------
// I1 (C3.0): hamlet constants. Values marked (tune) in the spec are tuned in C3X.

/** Index order of Resident.needs. Append-only. */
export const NEED_IDS = ['food', 'water', 'shelter', 'belonging', 'beauty'] as const;
/** Mood weights per need, same order (docs/spec/11-residents.md, Mood). */
export const NEED_WEIGHTS = [25, 15, 20, 15, 15] as const;
/** Lower bounds of mood bands 1 to 4: Unhappy 20, Meh 40, Content 60, Glowing 80. */
export const MOOD_BAND_MIN = [20, 40, 60, 80] as const;
export const MOOD_BAND_NAMES = ['Miserable', 'Unhappy', 'Meh', 'Content', 'Glowing'] as const;
/** Productivity percent by mood band (Miserable to Glowing). */
export const MOOD_PRODUCTIVITY = [50, 75, 90, 100, 110] as const;
/** Tax factor percent by mood band. */
export const MOOD_TAX = [20, 50, 80, 100, 120] as const;

/** Ledger categories, index order of LedgerPeriod.money. Append-only. */
export const LEDGER_CATEGORIES = [
  { id: 'taxes', kind: 'income' },
  { id: 'peddler', kind: 'income' },
  { id: 'refunds', kind: 'income' },
  { id: 'upkeep', kind: 'expense' },
  { id: 'construction', kind: 'expense' },
  { id: 'roads', kind: 'expense' },
  { id: 'fields', kind: 'expense' },
] as const;
export type LedgerCategoryId = (typeof LEDGER_CATEGORIES)[number]['id'];

export const PENNIES_PER_COIN = 100;
/** Standard valley start (docs/spec/02-game-overview.md). */
export const START_TREASURY = 500 * PENNIES_PER_COIN;
export const PANTRY_CAPACITY = 8;
export const MAX_FRIENDS = 5;
export const MAX_HISTORY = 20;
export const MAX_WISHES = 12;
export const WISH_EXPIRY_DAYS = 6;
export const PORTER_CARRY = 4;
export const PORTER_MATCH_EVERY = 20;
export const STALL_RESTOCK_TARGET = 30;
export const FIELD_TILE_COST = 1;
export const FIELD_MIN_FERTILITY = 40;
export const MAX_FIELD_TILES = 256;
export const MAX_SIGN_CHARS = 24;
/** Undo stack depth per seat (client). */
export const UNDO_DEPTH = 30;
/** A* node expansion cap per search. */
export const MAX_PATH_EXPANSIONS = 20000;

/** Agent frame layout: Float32Array, stride 8, one row per resident outdoors. */
export const AGENT_STRIDE = 8;
/** Field offsets in an agent row: [id, x, z, y, heading, anim, carryGood + 1, flags]. */
export const AgentField = { id: 0, x: 1, z: 2, y: 3, heading: 4, anim: 5, carry: 6, flags: 7 } as const;
export const AgentAnim = { idle: 0, walk: 1, carry: 2, hop: 3, work: 4 } as const;
/** Agent row flags (bubbles and look hints). */
export const AgentFlags = {
  wish: 1,
  happy: 2,
  unhappy: 4,
  sleepy: 8,
  child: 16,
  slow: 32,
} as const;

/** Resident.flags bits. */
export const ResidentFlags = { story: 1, leaving: 2, hop: 4, stuck: 8 } as const;

/** BuildingRuntime.status bits (docs/spec/13-ledger.md, Reports). */
export const BuildingStatus = {
  noWorkers: 1,
  missingInput: 2,
  outputFull: 4,
  noRoad: 8,
  noPorters: 16,
  paused: 32,
  disrepair: 64,
  waitingMaterials: 128,
  waitingBuilders: 256,
  noTrees: 512,
  noFields: 1024,
} as const;
