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

/**
 * Index order of Resident.needs. Append-only. I2 (C4.0) appends the tier needs: `goods` (the
 * tier's basket bought at the market), `social` (tavern), `health` (herbalist), `education`
 * (school, children). They weigh nothing until C4A and C4C give them weights; a need a tier does
 * not have stays at 100.
 */
export const NEED_IDS = [
  'food',
  'water',
  'shelter',
  'belonging',
  'beauty',
  'goods',
  'social',
  'health',
  'education',
] as const;
/** Mood weights per need, same order (docs/spec/11-residents.md, Mood). C4A weighs `goods` at 10. */
export const NEED_WEIGHTS: readonly number[] = [25, 15, 20, 15, 15, 10, 0, 0, 0];
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
  // I2 (C4.0). `book()` moves money across the valley's edge (counted in economy.external);
  // `pay()` moves it between the treasury and households (wages, sales, taxes on wages).
  { id: 'wages', kind: 'expense' },
  { id: 'sales', kind: 'income' },
  { id: 'exports', kind: 'income' },
  { id: 'imports', kind: 'expense' },
  { id: 'loans', kind: 'income' },
  { id: 'interest', kind: 'expense' },
  { id: 'repayments', kind: 'expense' },
  { id: 'subsidies', kind: 'expense' },
  { id: 'terraforming', kind: 'expense' },
  /** Story and Charter rewards from the County. */
  { id: 'grants', kind: 'income' },
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
/** I2 (C4.0): `cart` rows are carts (state.carts), not residents; carry is the first load good. */
export const AgentAnim = { idle: 0, walk: 1, carry: 2, hop: 3, work: 4, cart: 5 } as const;
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
  // I2 (C4.0)
  /** Waiting for materials for a home upgrade. */
  upgrading: 2048,
  /** A cart shed with no cart road out. */
  noCartRoad: 4096,
} as const;

// ---------------------------------------------------------------------------------------------
// I2 (C4.0): village constants (docs/spec/13-ledger.md, 15-progression.md). Values marked (tune)
// in the spec are tuned in C4X.

/** Population tiers, in order (TierId). Index order of per-tier arrays. */
export const TIERS = ['settler', 'craftsfolk', 'merchant', 'patron'] as const;
/** Town ranks, in order (RankId). */
export const RANKS = ['hamlet', 'village', 'town', 'marketTown', 'city'] as const;

/** `zone` map layer values (content.zones layerValue). */
export const Zone = { none: 0, homesLow: 1, homesMedium: 2, shops: 3, crafts: 4, farms: 5 } as const;

/**
 * Daily wages per job tier at wage level 100, pennies, in TIERS order (tune). C4A tuned them down
 * from the spec's 6, 10, 16 and 26 coins so a working household's basket at base prices takes most
 * of its pay (a worker keeps about one and a half people fed): purses still fill toward the next
 * tier's savings, but slowly enough that the treasury is not drained into them.
 */
export const WAGES = [250, 450, 700, 1100] as const;
export const WAGE_LEVEL_RANGE = [80, 120] as const;
export const DEFAULT_WAGE_LEVEL = 100;
export const TAX_RATE_RANGE = [0, 20] as const;
export const DEFAULT_TAX_RATE = 10;
export const MAX_SUBSIDY = 50;

/** Market (docs/spec/13-ledger.md, Market and prices). */
export const PRICE_HISTORY_DAYS = 24;
/** Target cover T in days. */
export const TARGET_COVER = 3;
/** Price multiplier curve: [cover / T in hundredths, multiplier in hundredths], interpolated linearly. */
export const PRICE_CURVE: readonly (readonly [number, number])[] = [
  [25, 250],
  [50, 160],
  [75, 120],
  [100, 100],
  [150, 90],
  [200, 80],
  [400, 65],
  [800, 50],
];
/** Each day the price moves this percent of the way to base * m. */
export const PRICE_SMOOTHING = 25;
/** Prices stay within these percents of base. */
export const PRICE_CLAMP = [40, 300] as const;

/** Trade (docs/spec/13-ledger.md, Trade). */
export const TRADE_BUY_PERCENT = 120;
export const TRADE_SELL_PERCENT = 85;
/** Drift: permille step up to 20 a day, bounded. Impact: permille per unit, recovery percent a day. */
export const DRIFT_STEP = 20;
export const DRIFT_RANGE = [700, 1400] as const;
export const IMPACT_PER_UNIT = 5;
export const IMPACT_RECOVERY = 10;
export const CARAVAN_HOUR = 8;
export const TRADE_LOG_MAX = 60;

/** Loans: interest per season in percent, and the credit limit in coins per resident (tune). */
export const LOAN_RATE = 5;
export const CREDIT_PER_RESIDENT = 20;
export const CREDIT_MIN = 200;
/** I2 (C4A): what the County Bank lends in all, coins, by rank in RANKS order (500, 1,500, 4,000). */
export const LOAN_LIMITS = [0, 500, 1500, 4000, 4000] as const;

/** Zoning and growth. */
export const LOT_MIN = 2;
export const LOT_MAX = 3;
export const MAX_ZONE_TILES = 256;

/** Streets and traffic. Cart passes per hour before slowing, and the slowest factor. */
export const CART_CAPACITY = 16;
export const TRAFFIC_SLOWDOWN_MAX = 2;

/** Terraforming: tiles per command and coins per level per tile (tune). */
export const TERRAFORM_MAX_TILES = 64;
export const TERRAFORM_COST = 2;

/** Tiers: days in a row to upgrade a home, and to slide back. */
export const TIER_UP_DAYS = 3;
export const TIER_DOWN_DAYS = 4;

/** Plans and requests. */
export const MAX_PLANS = 40;
export const MAX_PLAN_ITEMS = 64;
export const MAX_PLAN_NAME_CHARS = 40;
export const MAX_COMMENT_CHARS = 200;
export const MAX_COMMENTS = 30;
export const MAX_REQUESTS = 60;

/** Life events. */
export const APPRENTICE_DAYS = 6;
export const SEASIDE_YEARS = 20;
