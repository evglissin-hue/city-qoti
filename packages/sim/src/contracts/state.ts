// World state (docs/spec/20-architecture.md, Simulation). Later iterations add per-system
// slices; any change to the saved shape bumps SAVE_VERSION and adds a migration (from version 6,
// R1's fresh start: older valleys are refused, docs/spec/21-networking-and-saves.md).
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
import type {
  CommissionsState,
  DockState,
  FestivalState,
  GuideState,
  LiveRaid,
  NatureState,
  RenownState,
  SeasonsStats,
  ThreatState,
  TrialState,
  WarmthStats,
  WatchState,
  WeatherState,
} from './seasons';
import type { EveningsState, GapsState, PlaceState, Street } from './evenings';
import type { MastersState, SuppliesState, ThreadsState, TownBookState } from './masters';
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
import type { BusinessCounters, CarrierState, DemandState, SeasonPlan } from './zones';

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
  // R2 (R2.0): footfall (19-evenings.md, Footfall), saturating at 65535, both halved at 04:00 (R2A).
  // Uint16LayerName, not LayerName: hashed and saved, never patched to clients (FootfallView).
  /** Steps taken on the tile by anyone walking, but on an evening round. */
  footfallDay: Uint16Array;
  /** Steps on the way to a stop or between the stops of a round (the walk home does not count). */
  footfallEve: Uint16Array;
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
  // R1 (R1.0): a business (docs/spec/13-ledger.md, Zoning and growth). Absent on every other building.
  /** Its trade (content trade id): what grows on a Workshops, Farmland or Shops lot, or the Apiary's hives. */
  trade?: string;
  /** The resident who keeps it (the family name goes on the sign), or 0 while it has none. */
  keeperId?: EntityId;
  /** 1 to 3: each a bigger building with a larger crew, never a multiplier. Absent means 1. */
  level?: number;
  /** The Ledger pinned its trade (build.pinRecipe): it never retools, unless its site fails. */
  pinned?: true;
  /** What its level and retooling read (R1B). */
  counters?: BusinessCounters;
  // R2 (R2.0): floors by tier and row (i4-visual-planning-notes.md, V2 item 4; V3B draws it as
  // `params.storeys`). Absent on hand-placed buildings.
  /**
   * Storeys of a grown building, in half-storey steps (1, 1.5, 2 up to 4): chosen by the sim from its
   * tier (homes) or level (businesses) and its row, saved so both seats see one skyline.
   */
  storeys?: number;
  /**
   * R2 (R2B): a shop that has put tables out and become a cafe (19-evenings.md, Shops follow the
   * walkers): set and cleared by the levels pass at 23:30 (a shop of `PLACES.cafeLevel` whose door
   * is within `cafeRadius` of `cafeSeats` seats); `cafeTables` reads it for the place pass.
   */
  cafe?: true;
  /**
   * R3 (R3.0): residents who bought a Treat at its door on the round on evening `day` (stops and
   * passing trade, counted once a sale by recordSale): the per-outlet evening customers R2C's "a shop
   * nobody passes" lacked. Reads 0 for any other day. Absent until its first round sale.
   */
  roundSales?: { day: number; customers: number };
  /**
   * R3 (R3.0): the master on its crew (a business or specialized building), kept in step by R3B's
   * masters system: the sign over the door (BuildingView.master). Absent while none works there.
   */
  masterId?: EntityId;
}

export interface Decor {
  id: EntityId;
  def: string;
  fx: number;
  fz: number;
  rot: number;
  builtBy: SeatId;
  /** I3 (C5.0, C5B): a temporary festival piece; `kept` once a seat chose to keep it as decor. */
  festival?: { kept: boolean };
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
  // I3 slices (C5.0). docs/spec/20-architecture.md, "I3 contracts". Sandbox valleys keep them
  // neutral (clear weather, no festival, no threats).
  weather: WeatherState;
  warmth: WarmthStats;
  festival: FestivalState;
  renown: RenownState;
  commissions: CommissionsState;
  dock: DockState;
  nature: NatureState;
  threats: ThreatState;
  watch: WatchState;
  /** The live raid, null outside one. */
  raid: LiveRaid | null;
  /** The trial on hand (the Village Charter's first winter), null when none. */
  trial: TrialState | null;
  /** The first days guide (C5H). */
  guide: GuideState;
  seasons: SeasonsStats;
  // R1 slices (R1.0). docs/spec/20-architecture.md, "R1 contracts". Sandbox valleys keep them neutral.
  /** The carrier: its rules, reserves, budget, the County tab and what it carried (R1A). */
  carrier: CarrierState;
  /** The Ledger's answers on the season card (season.setPlan; R1B reads the reserve and where to build). */
  seasonPlan: SeasonPlan;
  /** The four demand bars and their reasons, from the 01:00 growth pass (R1B). */
  demand: DemandState;
  // R2 slices (R2.0). docs/spec/20-architecture.md, "R2 contracts"; docs/spec/19-evenings.md, Data and
  // budgets. Sandbox valleys keep them empty.
  /** What the town remembers of each place, by stable id, sorted by id (R2A writes; R2B and R2C read). */
  places: PlaceState[];
  /** Open and lately closed gaps, their streaks and credits (R2C). */
  gaps: GapsState;
  /** Street names by road run, sorted by id (R2A; road.rename). */
  streets: Street[];
  /** The evening under way and the last few, for the edition, the Charter and the feats (R2A, R2B, R2C). */
  evenings: EveningsState;
  // R3 slices (R3.0). docs/spec/20-architecture.md, "R3 contracts"; docs/spec/19-evenings.md, Data and
  // budgets. Sandbox valleys keep them empty.
  /** Lit bits and reach ticks, supplied pieces' records, what places drew, the lamplighters (R3A). */
  supplies: SuppliesState;
  /** The season each trade last made a master, and masters ever made (R3B). */
  masters: MastersState;
  /** Pages found, hints and the callings earned (R3C). */
  townBook: TownBookState;
  /** The door-pair counts behind Follow the thread (R3D). */
  threads: ThreadsState;
  /**
   * R3: the first calling earned (`townBook.callings[0]`), for readers that ask for one calling as
   * P1's did; absent until one is earned. R3C keeps it in step.
   */
  calling?: string;
}
