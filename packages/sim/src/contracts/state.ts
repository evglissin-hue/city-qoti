// World state (docs/spec/20-architecture.md, Simulation). Later iterations add per-system
// slices; any change to the saved shape bumps SAVE_VERSION and adds a migration.
import type {
  AchievementState,
  BuildingRuntime,
  ChronicleEntry,
  EconomyState,
  HearthState,
  Household,
  LogisticsState,
  Resident,
  SeenStats,
  TownStats,
  Wish,
} from './hamlet';
import type { EntityId, Lens, Rect, Rot4, SeatId, Speed } from './ids';
import type { ValleySettings } from './settings';
import type {
  Cart,
  CharterState,
  InnovationState,
  LeversState,
  LoansState,
  Lot,
  MarketState,
  Plan,
  SeatRequest,
  StoryState,
  TradeState,
  VillageStats,
} from './village';

/** Typed arrays of length size * size, index i = z * size + x (docs/spec/10-world-and-building.md). */
export interface MapLayers {
  height: Uint8Array;
  terrain: Uint8Array;
  water: Uint8Array;
  fertility: Uint8Array;
  deposit: Uint8Array;
  road: Uint8Array;
  tree: Uint8Array;
  occupant: Int32Array;
  zone: Uint8Array;
  parcel: Uint8Array;
  flags: Uint8Array;
  // I1 (C3.0). Charm 0..100 and its five categories (noise as a magnitude, 0 = quiet), stored
  // because charm is recomputed hourly per dirty chunk, so it depends on history.
  charm: Uint8Array;
  charmNature: Uint8Array;
  charmComfort: Uint8Array;
  charmLight: Uint8Array;
  charmView: Uint8Array;
  charmNoise: Uint8Array;
  /** Wheat field tiles: the farmhouse id that tends them, else 0. */
  fieldOwner: Int32Array;
  /** Crop growth on field tiles, 0 (bare) to 255 (ripe). */
  crop: Uint8Array;
  // I2 (C4.0). `zone` (above, since I0) holds zone layer values 0 to 5 (content.zones).
  /** Lot id per tile (state.lots), else 0. */
  lot: Int32Array;
  /** Cart passes over the tile in the last in-game hour, capped at 255 (C4B). */
  traffic: Uint8Array;
  /** Desire path wear from residents walking off-road, 0 to 255 (C4B). */
  wear: Uint8Array;
}

export interface WorldMeta {
  startArea: Rect;
  valleyGate: [number, number];
  flow: 'ns' | 'we';
}

export interface SeatState {
  seat: SeatId;
  name: string;
  color: number;
  lens: Lens;
  lastSeenTick: number;
  /** I1: stats when the seat last left, for the while-you-were-away letter. */
  seen?: SeenStats;
}

export interface Building {
  id: EntityId;
  def: string;
  x: number;
  z: number;
  rot: Rot4;
  builtBy: SeatId;
  handmade: boolean;
  stage: 'construction' | 'built';
  foundation: boolean;
  custom?: Record<string, string | boolean>;
  /** I1: runtime state in standard valleys. */
  rt?: BuildingRuntime;
  // I2 (C4.0), absent on hand-placed buildings.
  /** The lot it grew on. */
  lot?: EntityId;
  /** District style id it was grown in (C4E draws it). */
  style?: string;
}

export interface Decor {
  id: EntityId;
  def: string;
  fx: number;
  fz: number;
  rot: number;
  builtBy: SeatId;
}

export interface Note {
  id: EntityId;
  x: number;
  z: number;
  text: string;
  by: SeatId;
  tick: number;
}

export interface WorldState {
  saveVersion: number;
  seed: string;
  settings: ValleySettings;
  /** Last applied turn number. */
  lastTurn: number;
  /** Total ticks elapsed. */
  tick: number;
  /** desired: speed per seat, indexed by seat. connected: sorted seat ids. */
  time: { desired: Speed[]; connected: SeatId[] };
  /** 4 words per RngStream. */
  rng: Uint32Array;
  nextId: EntityId;
  map: MapLayers;
  meta: WorldMeta;
  /** Sorted by seat. */
  seats: SeatState[];
  /** Sorted by id. */
  buildings: Building[];
  /** Sorted by id. */
  decor: Decor[];
  /** Sorted by id. */
  notes: Note[];
  // I1 slices (C3.0). Sandbox valleys keep them empty.
  /** Sorted by id. */
  residents: Resident[];
  /** Sorted by id. */
  households: Household[];
  economy: EconomyState;
  logistics: LogisticsState;
  hearth: HearthState;
  /** Active wishes, sorted by id. */
  wishes: Wish[];
  /** Sorted by id (oldest first). */
  chronicle: ChronicleEntry[];
  /** Unlocked achievements in unlock order. */
  achievements: AchievementState[];
  stats: TownStats;
  /** Increments whenever roads, buildings or walkability change (path cache key). */
  networkVersion: number;
  // I2 slices (C4.0). docs/spec/20-architecture.md, "I2 contracts". Sandbox valleys keep them
  // neutral (base prices, no lots, Hamlet rank).
  market: MarketState;
  levers: LeversState;
  loans: LoansState;
  /** Sorted by id. */
  lots: Lot[];
  trade: TradeState;
  /** Sorted by id. */
  carts: Cart[];
  charter: CharterState;
  /** One per content innovation, sorted by id. */
  innovations: InnovationState[];
  /** Sorted by id. */
  plans: Plan[];
  /** Sorted by id. */
  requests: SeatRequest[];
  /** One per content story arc, sorted by arc id. */
  stories: StoryState[];
  village: VillageStats;
}
