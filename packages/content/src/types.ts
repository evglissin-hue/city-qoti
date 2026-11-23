// Content contract (docs/spec/31-parallel-development.md): additive changes only during parallel waves.
// Ids are kebab-case and stable forever, because saves reference them. R1.0 (the zones-first
// contracts, the one cycle allowed to remove) cut the chain economy's goods, methods and callings
// and added families, trades and specialized buildings: docs/spec/20-architecture.md, R1 contracts.

import type { DressingRule } from './dressingRules';

/** Which lens a piece belongs to. Shared pieces show in both lens toolbars. */
export type ContentLane = 'hearth' | 'ledger' | 'shared';

/**
 * V1.0, reserved for I4 (docs/spec/18-eras.md, Data): the Old Age, the Age of Steam (Town) and the
 * Bright Age (City). Defs list the eras they belong to in `eras`; no data or sim state yet.
 */
export type Era = 'old' | 'steam' | 'bright';

/** Reference to a procedural art kit in packages/art (one kit per def in I0). */
export interface ArtRef {
  kit: string;
  params?: Record<string, number | string | boolean>;
}

/** What placing or building something costs. Sandbox valleys ignore costs; I1 fills them in. */
export interface Cost {
  coins?: number;
  /** Goods by content id and quantity. A list, not a record, so the sim never iterates object keys. */
  goods?: [good: string, qty: number][];
}

export type DepositKind = 'stone' | 'clay' | 'sand' | 'coal';

/** Def-specific placement rules, checked by canPlaceBuilding with the matching reason code. */
export type PlacementRule =
  /** At least one footprint tile touches water; footprint tiles may stand on the water edge. NEEDS_WATER_EDGE. */
  | { kind: 'waterEdge' }
  /** At least one (or `minTiles`, C3.0 addition) footprint tile lies on this deposit. NEEDS_DEPOSIT. */
  | { kind: 'deposit'; deposit: DepositKind; minTiles?: number }
  /** Average fertility over the footprint is at least `min` (0 to 100). NEEDS_FERTILITY. */
  | { kind: 'fertility'; min: number }
  /** Every footprint tile height lies within the range (0 to 15). TOO_STEEP. */
  | { kind: 'height'; min?: number; max?: number }
  // R1 (R1.0): the site rules of specialized buildings (docs/spec/10-world-and-building.md, From the
  // redesign; 13-ledger.md, Land and specialized buildings). R1B checks them in canPlaceBuilding.
  /** At least `trees` mature trees within `within` tiles of the footprint (Forester's Lodge). NEEDS_WOODS. */
  | { kind: 'woods'; trees: number; within: number }
  /** The door on the river's edge, not a pond's (Sawmill, River Dock). NEEDS_RIVER. */
  | { kind: 'river' }
  /** No other building within `clear` tiles of the footprint (Windmill). NEEDS_OPEN_GROUND. */
  | { kind: 'openGround'; clear: number }
  /** A road at the door, of one of these kinds (any road when absent). NEEDS_ROAD. */
  | { kind: 'road'; roads?: ('path' | 'lane' | 'street')[] }
  /** Within `within` tiles of the valley road, the road that runs to the valley gate (Trading Post). NEEDS_VALLEY_ROAD. */
  | { kind: 'valleyRoad'; within: number };

export interface BuildingDef {
  id: string;
  name: string;
  lane: ContentLane;
  category: 'home' | 'production' | 'storage' | 'service' | 'civic' | 'landmark' | 'defense';
  /** Footprint in tiles at rotation 0. */
  size: [w: number, d: number];
  /** Entrance tile inside the footprint at rotation 0 (entrance faces south, +z). */
  entrance: [dx: number, dz: number];
  placement?: PlacementRule[];
  cost?: Cost;
  /** Coins per in-game day [I1]. */
  upkeep?: number;
  art: ArtRef;
  // I1 additions (C3.0). All optional, so sandbox-only defs stay valid.
  /** Jobs at this building and who fills them. `tier` [I2]: the tier of the job (default settler). */
  jobs?: { count: number; role: JobRole; tier?: TierName };
  /** Homes: households and residents it holds. */
  housing?: { households: number; residents: number };
  /** Storage capacity in units, all goods together (storehouse 800, granary 1,200, market stall 40). */
  storage?: number;
  /** Area services: water (well), food outlet (market stall), logistics (storehouse range). */
  coverage?: Coverage[];
  /**
   * Production methods. R1: a specialized building has at most one (the quarry cuts stone, the
   * Brickworks fires brick); a business runs its trade's method instead (TradeDef.method), so
   * nothing switches methods any more.
   */
  methods?: ProductionMethod[];
  /** Builder-hours of work to finish construction (standard valleys). */
  work?: number;
  /** Output buffer capacity per good (default 10; farms 30). */
  outputBuffer?: number;
  /** Charm sources at the building (well comfort, workshop noise). */
  charm?: CharmSource[];
  /** Behavior tags: 'workshop', 'smelly', 'outlet', 'storehouse', 'farm', 'builders'. A business also answers to its trade id (R1). */
  tags?: string[];
  /** Which valley modes offer it in the toolbar (default both). */
  modes?: ValleyMode[];
  // I2 additions (C4.0).
  /** Homes: the population tier it houses (default settler). */
  tier?: TierName;
  /** Grown on lots of this zone; hidden from the build picker unless `handPlaced`. */
  grows?: { zone: string; weight?: number; handPlaced?: boolean };
  /** Upgrades in place to this def when its household reaches the next tier, consuming the goods. */
  upgradesTo?: { def: string; goods: [good: string, qty: number][] };
  /**
   * Rank or innovation needed before it can be placed or grown. Playtest round six addition:
   * `built`, buildings the town must have standing first ([def, how many]); since R1 only the
   * Builder's Yard uses it (after four cottages).
   */
  requires?: {
    rank?: RankName;
    innovation?: string;
    built?: [def: string, count: number][];
    /** I3 (C5A): only once a story's reward has unlocked it (hearth.unlocked holds the def id). */
    story?: boolean;
    /** I3 (C5B): renown level needed (the River Dock waits for renown 1). */
    renown?: number;
  };
  // I3 additions (C5.0).
  /** Defense pieces (docs/spec/14-challenge.md, Defenses; C5D fills the numbers). */
  defense?: DefenseDef;
  /** Module slots for customization phase 2 (C5C): [slot, how many]. */
  moduleSlots?: [slot: ModuleSlot, count: number][];
  /**
   * Playtest round seven: the kit draws window boxes on its own unless the player says otherwise
   * (hand-placed homes only), so an unset `custom.windowBoxes` means on, with the charm they bring.
   */
  boxesByDefault?: boolean;
  // V1 additions (V1.0).
  /** Eras this building belongs to (18-eras.md); absent means every era. Reserved, filled in I4. */
  eras?: Era[];
  // R1 additions (R1.0). docs/spec/13-ledger.md, Land and specialized buildings.
  /**
   * A specialized building: hand-placed, tied to the ground by its site rule (`placement`), and
   * shelved apart in the Build picker. The thirteen of 13-ledger.md; content tests check each has a
   * site rule.
   */
  specialized?: true;
  /** Walking distance along roads, in tiles, that it serves (24 unless noted). */
  reach?: number;
  /** How many businesses (or homes) it serves in its reach: the Windmill's 2 bakers. */
  capacity?: number;
  /** The capacity when it stands this many levels above the ground around it (the Windmill: 4 at 4). */
  raisedCapacity?: [levels: number, capacity: number];
  /** Trade ids that may set up only in its reach (the Windmill enables 'baker'). */
  enables?: string[];
  /** The families its storage takes (the Granary Food; the Storehouse the other four); all when absent. */
  stores?: GoodFamily[];
  // R2 additions (R2.0). docs/spec/19-evenings.md, Places.
  /** A host on the evening round: its room and kinds (tavern, Bath House, Market Square, stall, well). */
  host?: HostDef;
  // R3 additions (R3.0, for R3H: specialized buildings that grow with success).
  /**
   * The levels a specialized building may climb (`Building.level`, 1 to 3), as businesses do: a bigger
   * building with a bigger crew, reach, store or room, never a multiplier (13-ledger.md, Levels).
   * Absent: it stays at level 1.
   */
  levels?: SpecializedLevelsDef;
}

/**
 * R3 (R3.0): what each level of a specialized building is (`BuildingDef.levels`). Each array holds one
 * entry a level, level 1 first; a field left out keeps the building's own value at every level.
 */
export interface SpecializedLevelsDef {
  /** Hands at each level (`jobs.count` at level 1). */
  crew?: number[];
  /** Reach in tiles at each level (the Forester's wood, the Market Stall's food reach). */
  reach?: number[];
  /** Storage in units at each level (the Granary, the Storehouse). */
  storage?: number[];
  /** Businesses it serves in its reach at each level (the Windmill's bakers). */
  capacity?: number[];
  /**
   * R3H (the master's ruling of 2026-11-22): for `full`, the share of its level's storage, in
   * percent, a store holds on a good day toward each next level, level 2 first (a third, then half).
   */
  fullShare?: number[];
  /**
   * What a good day is, toward the next level: its goods `carried` off (the Quarry, the Fishery, the
   * Forester's Lodge), `customers` served (the Market Stall), everything it serves `served` (the Windmill:
   * every baker in reach had grain), or `full` (a store at least half full with every porter at work).
   */
  good?: 'carried' | 'customers' | 'served' | 'full';
}

/**
 * R2 (R2.0): what a place is for (docs/spec/19-evenings.md, Places: Kinds). Index order is the sim's
 * PLACE_KINDS; append-only.
 */
export type PlaceKind = 'sit' | 'eat' | 'view' | 'play' | 'meet' | 'walk';

/** R2 (R2.0): a building that is a place on the evening round (docs/spec/19-evenings.md, Hosts). */
export interface HostDef {
  /** Seats (tavern 12, Bath House 8). */
  seats: number;
  /** Standing room where folk gather on their feet (a well 4, a stall 4). */
  standing: number;
  /** What it offers (the tavern sits, eats and meets). */
  kinds: PlaceKind[];
  /** Under a roof: rain spares it. */
  sheltered?: boolean;
  /** Heated: winter spares it. */
  warm?: boolean;
}

export interface DecorDef {
  id: string;
  name: string;
  lane: ContentLane;
  /** Collision radius in sub-tile fixed point (1 tile = 256). */
  radius: number;
  /** Placed as runs of 1-tile segments along a dragged line (fences, walls, hedges). */
  linear?: boolean;
  /** May stand on path and lane tiles. */
  onRoad?: boolean;
  /** May stand on water tiles. */
  onWater?: boolean;
  /** Walkers route around it [I1]. */
  blocksWalking?: boolean;
  tags: string[];
  art: ArtRef;
  // I1 additions (C3.0).
  /** Charm sources (bench comfort, lantern light, flowers nature). */
  charm?: CharmSource[];
  /** Coins in standard valleys. */
  cost?: Cost;
  /** Hidden from the toolbar until a pattern (or another unlock) names it in hearth.unlocked. */
  locked?: boolean;
  // I3 additions (C5.0).
  /** A temporary festival piece (C5B): removed the morning after unless kept, when keepable. */
  festival?: { keepable?: boolean };
  /** Raiders crossing it are slowed by this many percent (fence 20, hedge 30; C5D). */
  slows?: number;
  // V1 additions (V1.0).
  /** Eras this piece belongs to (18-eras.md); absent means every era. Reserved, filled in I4. */
  eras?: Era[];
  // R2 additions (R2.0). docs/spec/19-evenings.md, Places (every number tunes).
  /** Room for sitters (bench 2, curved bench 3, ring bench 4, cafe table 4); content tests check every seat piece has some. */
  seats?: number;
  /** The seats are for children only (swing, see-saw): grown-ups never take them. */
  childSeats?: true;
  /** Room for folk on their feet where they gather (a fire 8). */
  standing?: number;
  /** A fire: the place it stands in is warm (bonfire, brazier). */
  warm?: true;
  // R3 additions (R3.0). docs/spec/19-evenings.md, Supplies (every number tunes).
  /**
   * What the piece draws on to be at its best, and how it rests without it (lanterns burn candles,
   * fires firewood, cafe tables the outlet beside them, festival cloth fades, fountains want a well).
   * Absent: it needs nothing. From Village rank; in a Hamlet every piece is supplied for nothing.
   */
  supply?: SupplyDef;
}

/**
 * R3 (R3.0): how a supplied piece rests without its supply (docs/spec/19-evenings.md, Supplies). It
 * stays where it is, costs nothing and loses only this: an unlit lantern its night charm, night draw
 * and deterrence; a cold fire its place's warmth; a bare table what it serves (seats only); faded
 * cloth and a dry fountain half their charm. Index order is the sim's REST_KINDS; append-only.
 */
export type RestKind = 'unlit' | 'cold' | 'bare' | 'faded' | 'dry';

/**
 * R3 (R3.0): how a piece is supplied. Index order is the sim's SUPPLY_KINDS; append-only.
 * - nightly: `good`, one unit a night for every `per` pieces (lanterns: a candle for every 4);
 * - evening: `qty` of `good` on an evening someone comes to its place, in `seasons` (a fire's firewood);
 * - season: `qty` of `good` when put up, once a season (festival cloth);
 * - outlet: an outlet within `radius` with Treats on its shelf, read live (cafe and festival tables);
 * - well: a well within `radius` tiles (fountain, birdbath).
 */
export type SupplyKind = 'nightly' | 'evening' | 'season' | 'outlet' | 'well';

/** R3 (R3.0): a supplied piece's supply (DecorDef.supply). Content validation checks each kind's fields. */
export interface SupplyDef {
  kind: SupplyKind;
  /** nightly, evening, season: the good it burns or wears (a content good id). */
  good?: string;
  /** evening, season: units drawn each time; nightly: units a night for `per` pieces (1). */
  qty?: number;
  /** nightly: pieces one `qty` supplies a night (lanterns 4). */
  per?: number;
  /** evening: the season indexes it burns in (autumn and winter; the thaw ends winter's). */
  seasons?: number[];
  /** outlet, well: tiles to the outlet or the well. */
  radius?: number;
  /** How it rests without its supply. */
  rests: RestKind;
}

export interface RoadDef {
  id: string;
  name: string;
  lane: ContentLane;
  /** Value stored in the `road` map layer (1 path, 2 lane, 3 street [I2], 4 avenue [I5]). */
  layerValue: number;
  cost?: Cost;
  // I2 additions (C4.0).
  /** Carts may use it; carts never use paths. */
  carts?: boolean;
  /** Cart passes per hour before carts slow down (lane 30, street 80). */
  capacity?: number;
  /** Rank or innovation needed (streets need Cobbles). */
  requires?: { rank?: RankName; innovation?: string };
  // I2 additions (C4B).
  /** Charm noise the road itself gives its tile, fading over the next (cobbles and bustle). */
  noise?: number;
  // V1 additions (V1.0).
  /** Eras this road belongs to (18-eras.md); absent means every era. Reserved, filled in I4. */
  eras?: Era[];
}

export interface TreeDef {
  id: string;
  name: string;
  /** Species index used by the `tree` map layer (value = species * 8 + stage). */
  species: number;
  deciduous: boolean;
  art: ArtRef;
}

/** Everything the sim and client need from content, with id lookups. */
export interface Content {
  buildings: readonly BuildingDef[];
  decor: readonly DecorDef[];
  roads: readonly RoadDef[];
  trees: readonly TreeDef[];
  buildingById: ReadonlyMap<string, BuildingDef>;
  decorById: ReadonlyMap<string, DecorDef>;
  roadById: ReadonlyMap<string, RoadDef>;
  treeById: ReadonlyMap<string, TreeDef>;
  // I1 additions (C3.0).
  /**
   * A good's index in this list is its index in every per-good array. R1 fixed the sixteen goods in
   * the order of docs/spec/13-ledger.md (Goods: families and flavors); append-only from here.
   */
  goods: readonly GoodDef[];
  goodById: ReadonlyMap<string, GoodDef>;
  /** Good id to its index in `goods`. */
  goodIndex: ReadonlyMap<string, number>;
  species: readonly SpeciesDef[];
  speciesById: ReadonlyMap<string, SpeciesDef>;
  traits: readonly TraitDef[];
  traitById: ReadonlyMap<string, TraitDef>;
  /** Shared family name pool. */
  familyNames: readonly string[];
  wishes: readonly WishTemplate[];
  wishById: ReadonlyMap<string, WishTemplate>;
  patterns: readonly PatternDef[];
  patternById: ReadonlyMap<string, PatternDef>;
  achievements: readonly AchievementDef[];
  achievementById: ReadonlyMap<string, AchievementDef>;
  chronicle: readonly ChronicleTemplate[];
  chronicleByKind: ReadonlyMap<string, ChronicleTemplate>;
  // I1 additions (C3B).
  /** Customization swatches by group (docs/spec/17-presentation.md palette names). */
  swatches: readonly SwatchDef[];
  // I2 additions (C4.0).
  zones: readonly ZoneDef[];
  zoneById: ReadonlyMap<string, ZoneDef>;
  /** Zone def by its `zone` layer value. */
  zoneByValue: ReadonlyMap<number, ZoneDef>;
  baskets: readonly NeedsBasket[];
  basketByTier: ReadonlyMap<string, NeedsBasket>;
  /** R1 (R1A): favorite flavors by species and trait, sorted by `who` then `good`. */
  flavorLikes: readonly FlavorLike[];
  neighbors: readonly NeighborDef[];
  neighborById: ReadonlyMap<string, NeighborDef>;
  /** Innovation state in saves is keyed by id, so this list is alphabetical like the rest. */
  innovations: readonly InnovationDef[];
  innovationById: ReadonlyMap<string, InnovationDef>;
  charters: readonly CharterDef[];
  charterById: ReadonlyMap<string, CharterDef>;
  stories: readonly StoryArc[];
  storyById: ReadonlyMap<string, StoryArc>;
  carts: readonly CartDef[];
  cartById: ReadonlyMap<string, CartDef>;
  // I2 additions (C4B).
  /** District styles grown buildings are drawn in. */
  styles: readonly DistrictStyleDef[];
  styleById: ReadonlyMap<string, DistrictStyleDef>;
  // I3 additions (C5.0).
  /** In SeasonIndex order. */
  seasons: readonly SeasonDef[];
  weather: readonly WeatherDef[];
  weatherById: ReadonlyMap<string, WeatherDef>;
  events: readonly EventDef[];
  eventById: ReadonlyMap<string, EventDef>;
  festivals: readonly FestivalDef[];
  festivalById: ReadonlyMap<string, FestivalDef>;
  twists: readonly FestivalTwistDef[];
  twistById: ReadonlyMap<string, FestivalTwistDef>;
  wildlife: readonly WildlifeDef[];
  wildlifeById: ReadonlyMap<string, WildlifeDef>;
  threats: readonly ThreatDef[];
  threatById: ReadonlyMap<string, ThreatDef>;
  modules: readonly ModuleDef[];
  moduleById: ReadonlyMap<string, ModuleDef>;
  /** C5C (additive): the six habitats in HABITAT_IDS order, and what scores each. */
  habitats: readonly HabitatDef[];
  habitatSources: readonly HabitatSource[];
  commissions: readonly CommissionDef[];
  commissionById: ReadonlyMap<string, CommissionDef>;
  /** In level order, 0 to 5. */
  renown: readonly RenownDef[];
  /** The first days guide (C5H). */
  guide: GuideDef;
  /** P1: the ladder homes climb on their own, in order (systems/dressing). */
  dressing: readonly DressingStep[];
  /** V3.0: the dressing layer's rules (dressingRules.ts), look data the sim never reads. */
  dressingRules: readonly DressingRule[];
  // R1 additions (R1.0).
  /** What a business on a zoned lot can do, alphabetical by id (docs/spec/13-ledger.md, Trades). */
  trades: readonly TradeDef[];
  tradeById: ReadonlyMap<string, TradeDef>;
  // R2 additions (R2.0).
  /** The evening round's numbers (docs/spec/19-evenings.md), one table so R2X tunes in one file. */
  places: PlacesTuning;
  /** The gaps, in GAP_KINDS order. */
  gaps: readonly GapDef[];
  gapByKind: ReadonlyMap<GapKind, GapDef>;
  // R3 additions (R3.0). docs/spec/19-evenings.md, Supplies, Masters, The Town Book.
  /** The supplies' numbers (the lamplighter, candles, resting), one table so R3X tunes in one file. */
  supplies: SuppliesTuning;
  /** What each trade's or building's master brings, sorted by `of`. */
  masters: readonly MasterDef[];
  /** By `of`: a trade id or a specialized building's def id. */
  masterByOf: ReadonlyMap<string, MasterDef>;
  /** Masters' numbers (hearts, days, apprentices, the six days' grace). */
  mastery: MasteryTuning;
  /** The Town Book: specialties (pattern and good) and customs, each with a leaning, sorted by id. */
  specialties: readonly SpecialtyDef[];
  specialtyById: ReadonlyMap<string, SpecialtyDef>;
  customs: readonly CustomDef[];
  customById: ReadonlyMap<string, CustomDef>;
  townBook: TownBookTuning;
  /** The three callings, earned through the Town Book's leanings (no command picks one), sorted by id. */
  callings: readonly CallingDef[];
  callingById: ReadonlyMap<string, CallingDef>;
}

// ---------------------------------------------------------------------------------------------
// I1 content types (C3.0). docs/spec/11-residents.md, 12-hearth.md, 13-ledger.md, 15-progression.md

export type ValleyMode = 'sandbox' | 'standard';

/** Who fills a building's jobs. Porters work at storehouses, builders at the town hall and yard. */
export type JobRole =
  | 'worker'
  | 'builder'
  | 'porter'
  | 'vendor'
  /**
   * R3 (R3.0): the lamplighter, held at the Town Hall beside its builders (docs/spec/19-evenings.md,
   * Supplies): one job for every `SuppliesTuning.lanternsPerLamplighter` supplied lanterns. No
   * building def carries this role; it names the job in views and the jobs code.
   */
  | 'lamplighter';

/**
 * R1: the five families every good belongs to (docs/spec/13-ledger.md, The five rules, rule 4). The
 * order is GOOD_FAMILIES in the sim: per-family arrays are indexed by it.
 */
export type GoodFamily = 'food' | 'fuel' | 'materials' | 'wares' | 'treats';

export interface GoodDef {
  id: string;
  name: string;
  /** Short plural label for tight UI ("veg"). */
  label: string;
  /** R1: its family. A Food good is eaten (it fills the pantry); a good is a flavor of its family. */
  family: GoodFamily;
  /**
   * R1: from land (true), or made by a workshop from raw goods only (false). A made good is never
   * an input (rule 2; a content test checks every trade and method).
   */
  raw: boolean;
  /** Base price in pennies (100 pennies = 1 coin). */
  basePrice: number;
  /** Units a porter carries in one trip. */
  carry: number;
  /** Spoils after this many days [I3]. */
  spoilsDays?: number;
  /**
   * I3 (C5A): how much of it grows each season (spring, summer, autumn, winter), permille of the
   * gatherer's rate. Absent: the same all year.
   */
  seasons?: [spring: number, summer: number, autumn: number, winter: number];
  /** Art kit for carried bundles and stock piles (packages/art). */
  art?: ArtRef;
}

/**
 * How a building turns inputs into outputs. `kind` picks the production logic:
 * craft (inputs to outputs per cycle), gather (outputs from nothing, for example a quarry or fishery),
 * fell (the Forester's Lodge: fells a mature tree in range), plant (plants a sapling in range),
 * farm (a grain farm: tends field tiles). R1: specialized buildings carry one in `methods`, trades
 * one in `TradeDef.method`.
 */
export interface ProductionMethod {
  id: string;
  name: string;
  kind: 'craft' | 'gather' | 'fell' | 'plant' | 'farm';
  inputs: [good: string, qty: number][];
  outputs: [good: string, qty: number][];
  /** In-game hours per cycle at full staffing. */
  hours: number;
  /** Workers the method uses (the building's jobs.count unless smaller). */
  workers: number;
  /** Output is per worker present rather than per building (quarry, fishery, Forester's Lodge). */
  perWorker?: boolean;
  /** Tiles: the Forester's Lodge's range, a grain farm's field reach. */
  range?: number;
  /** Bonus in percent at height level `heightMin` or more. */
  heightBonus?: { heightMin: number; percent: number };
}

// --- Trades (R1.0) ----------------------------------------------------------------------------
// docs/spec/13-ledger.md, Zoning and growth (Trades, Choosing a trade, Levels).

/**
 * A trade: what a business on a Farmland, Workshops or Shops lot does. The growth pass picks one
 * for a lot (R1B's trade score); the Ledger may pin one (build.pinRecipe).
 */
export interface TradeDef {
  id: string;
  name: string;
  /** One line for the Businesses book and the picker ("Bread from grain, in a windmill's reach"). */
  blurb: string;
  /** The zone it grows on: a content zone id ('farms', 'crafts' or 'shops'). */
  zone: string;
  /** The building def a business of this trade is ('farmstead', 'workshop', 'corner-shop'). */
  building: string;
  /** The good it makes, or null for a shop. */
  makes: string | null;
  /** The raw goods it takes, none for a land trade or a shop (rule 2: never a made good). */
  from: string[];
  /** How it works at level 1 with its full crew (`workers` is crew[0]); null for a shop. */
  method: ProductionMethod | null;
  /** Shops: the families on its shelf at levels 1, 2 and 3. */
  sells?: [GoodFamily[], GoodFamily[], GoodFamily[]];
  /** What its lot must offer (the site term of the trade score). */
  wants: TradeWants;
  /** Hands at levels 1, 2 and 3 (workshops 1, 2, 4; farmsteads 2, 3, 4; shops 1, 2, 3). */
  crew: [number, number, number];
  /** Its look: an existing building kit and params (R1E draws trades and levels from the kits). */
  look: ArtRef;
  /** Rank or innovation needed before it may grow. */
  requires?: { rank?: RankName; innovation?: string };
  /** Trait ids that make a resident keen to keep it (the keeper term: Sweet Tooth bakes). */
  keepers?: string[];
}

/** What a trade wants of its lot. Every field is a condition; absent means none. */
export interface TradeWants {
  /** Average fertility over the lot, 0 to 100 (a grain farm 15, an orchard 40). */
  fertility?: number;
  /** The pollinator habitat score in the lot's chunk, 0 to 255 (hives 100). */
  pollinators?: number;
  /** A specialized building (def id) whose reach holds the lot, with room under its capacity. */
  reach?: string;
  /** Shops: households in reach (footfall too from R2). */
  households?: number;
}

export interface Coverage {
  /**
   * I2 (C4C) adds the services: 'social' (tavern), 'health' (herbalist) and 'education' (school,
   * children only).
   */
  kind: 'water' | 'food' | 'logistics' | 'social' | 'health' | 'education';
  /** Tiles (straight-line for water, food and services, walking distance for logistics). */
  radius: number;
  /** Residents served (well 30; services count the residents who need them). */
  capacity?: number;
}

export type CharmCategory = 'nature' | 'comfort' | 'light' | 'view' | 'noise';

/** Value at the source tile with linear falloff to 0 at the radius. Noise values are negative. */
export interface CharmSource {
  category: CharmCategory;
  value: number;
  radius: number;
  /** Lanterns: a different value at night. */
  nightValue?: number;
}

/** A taste of a species: what it likes (+) or dislikes (-), each mapped to something the sim measures. */
export interface Taste {
  /** A charm category near home, a decor or building tag nearby, water nearby, or a named measure. */
  kind: 'charm' | 'tag' | 'water' | 'crowd' | 'trees' | 'height' | 'quiet';
  /** Charm category, tag or measure name, depending on kind. */
  what?: string;
  /** Tiles to look within. */
  within?: number;
  /** Desirability weight, +-10 typical. */
  weight: number;
  /** C3A addition: the taste counts when the thing is missing ("far from water", "treeless streets"). */
  absent?: boolean;
}

export interface SpeciesDef {
  id: string;
  name: string;
  plural: string;
  likes: Taste[];
  dislikes: Taste[];
  /** Species-flavored given names. */
  givenNames: string[];
  /** C3A addition: inspector bio openers, one picked per resident; {name} is the given name. */
  bios?: string[];
  /** Art parameters for packages/art residents (ears, tail, fur palette ids). */
  art: ArtRef;
}

export interface TraitDef {
  id: string;
  name: string;
  /** One short line for the inspector. */
  blurb: string;
  /** Trait ids this one cannot be paired with. */
  clashes: string[];
  /** Trait ids that make friendships faster (x1.5); clashes slow them (x0.5). */
  befriends?: string[];
  /** Data the sim reads by name, for example { mood: 5, scheduleShift: 2, walkSpeed: 0.8 }. As a list, never iterated by key. */
  effects?: [name: string, value: number][];
  /** C3A addition: the trait as an adjective for bios ("early-rising"), when the name is a noun. */
  adjective?: string;
  /** I3 (C5.0): never rolled for a newcomer; given by a story or an event (Reformed). */
  special?: true;
}

// --- Condition DSL (wish targets, wish offers, achievements) -------------------------------------
// A small typed JSON language. The evaluator lives in packages/sim/src/conditions (C3B).
// Places are bound when a wish is made: 'home' is the resident's home, 'work' their workplace.

/** Where a spatial condition is measured from. */
export type PlaceRef = 'home' | 'work' | 'nearestMarket' | { tile: [number, number] } | { building: number };

/** Something that can be counted near a place. */
export type Target =
  | { tag: string }
  | { decor: string }
  | { building: string }
  | { buildingTag: string }
  | { buildingCategory: string }
  | { tree: 'any' | 'mature' }
  | { water: true }
  | { road: 'any' | 'path' | 'lane' }
  | { home: 'occupied' };

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  /**
   * At least `atLeast` (default 1) targets within `within` tiles of `of`. With `also`, each counted
   * target must itself have `also.target` within `also.within` tiles (a bench that is near water).
   */
  | {
      near: Target & {
        of: PlaceRef;
        within: number;
        atLeast?: number;
        excludeSelf?: boolean;
        also?: { target: Target; within: number };
      };
    }
  /** Town-wide counters, for example { count: { what: 'residents', atLeast: 20 } }. */
  | { count: { what: CountWhat; atLeast?: number; atMost?: number; ref?: string } }
  /** A charm layer value at a place: average over `radius` tiles (0 = the tile). Noise is a magnitude (0 quiet). */
  | { charm: { of: PlaceRef; layer?: CharmCategory; radius?: number; atLeast?: number; atMost?: number } }
  /** Stock of a good at a place's outlet or in the town. */
  | { stock: { good: string; at?: PlaceRef; atLeast: number } }
  /** Resident facts for offering a wish. */
  | {
      resident: {
        species?: string[];
        traits?: string[];
        noHome?: boolean;
        hasJob?: boolean;
        needBelow?: [need: string, value: number];
      };
    }
  /**
   * Escape hatch to a named predicate in packages/sim/src/conditions/code.ts ('lanternRoute',
   * 'pathRoute'). I3 (C5.0): `ref` names a content id the predicate reads (a story arc id for
   * 'storyStep'), since params are numbers.
   */
  | { code: string; params?: [name: string, value: number][]; ref?: string };

export type CountWhat =
  | 'residents'
  | 'households'
  | 'patternsDiscovered'
  | 'pattern'
  | 'wishesGranted'
  | 'goodProduced'
  | 'seasonsInSurplus'
  | 'builtTogether'
  /** Valid pattern sites right now whose members were placed by both seats (C3B). */
  | 'togetherSites'
  // I2 (C4.0)
  /** Days of food in town stock at the current rate of eating. */
  | 'foodDays'
  /** Residents of the tier named in `ref`. */
  | 'tierResidents'
  /** Requests between seats fulfilled (R2: and gaps closed, which count where requests did). */
  | 'requestsFulfilled'
  /** Distinct goods in stock at market outlets. */
  | 'goodsAtMarket'
  /** Innovations unlocked. */
  | 'innovations'
  // I2 (C4D): story goals and shared goals.
  /** Built buildings whose def id or tag is `ref`. */
  | 'buildings'
  /** Built buildings whose def id or tag is `ref`, within 3 tiles of open water. */
  | 'byWater'
  /** 1 once the innovation `ref` is unlocked, else 0. */
  | 'innovation'
  /** The town's rank as an index (0 hamlet, 1 village, 2 town...). */
  | 'rank'
  /** Plans approved. */
  | 'plansApproved'
  /** Weddings held. */
  | 'weddings'
  // I3 (C5.0)
  /** Renown level, 0 to 5. */
  | 'renown'
  /** Best festival stars so far. */
  | 'festivalStars'
  /** Field Guide species found. */
  | 'fieldGuide'
  /** 1 once the wildlife id `ref` has been sighted. */
  | 'sighted'
  /** Raids repelled with nothing stolen. */
  | 'raidsHeld'
  /** Winters where nobody was cold. */
  | 'warmWinters'
  // R1 (R1D)
  /** Businesses standing that grew on a lot (nobody placed them by hand); `ref` a trade id, def id or tag keeps those that answer to it. */
  | 'businesses'
  /** Distinct trades among those businesses; `ref` (a def id or tag, such as 'workshop') keeps only those. */
  | 'businessTrades'
  /** Flavors of Food on offer in town (R1A's flavorsOnOffer); `ref` a family id counts that family instead. */
  | 'foodFlavors'
  /** Winters with no Food or Fuel imported and nobody hungry or cold. */
  | 'importFreeWinters'
  // R2 (R2.0); R2C counts them (state.gaps, state.evenings).
  /** Gaps closed. */
  | 'gapsClosed'
  /** Gaps closed by the seat that has closed fewest (Mind the Gap: three by each). */
  | 'gapsClosedEachSeat'
  /** Fair evenings running with at least half the grown-ups out (R2C's run). */
  | 'eveningsOut'
  /**
   * R2X: fair evenings with at least half the grown-ups out, counted whole (the Village's evening goal;
   * a thin evening no longer starts it again, as 15-progression.md asks for three, not three running).
   */
  | 'eveningsHalfOut'
  /** Fair evenings on which every grown-up went out (Out of an Evening). */
  | 'eveningsAllOut'
  /** Whole seasons in which nobody stood for want of a seat (A Seat for Everyone). */
  | 'seatedSeasons'
  // R3 (R3.0). Each calls its owner's body: supplies (R3A), masters (R3B), the Town Book (R3C).
  /** Seasons from Village rank in which every lantern was lit every night (The Lamplighter's Round). */
  | 'lampSeasons'
  /** Masters in town now; `ref` a trade id (or a specialized building's def id) keeps that trade's. */
  | 'masters'
  /** Masters ever made in the valley (Master of the House). */
  | 'mastersMade'
  /** Town Book pages found; `ref` 'specialty', 'custom' or a leaning keeps those. */
  | 'townBookPages'
  /** Town Book pages credited to two seats (Made Together). */
  | 'pagesTogether'
  /** Callings earned; `ref` a calling id counts 1 once it is earned. */
  | 'callings';

// --- Hearth content ---------------------------------------------------------------------------

export interface WishTemplate {
  id: string;
  name: string;
  lane: 'hearth' | 'ledger';
  /** Variants with {name}, {place}, {species}. */
  text: string[];
  /** Resident and town conditions for offering it. */
  when: Condition;
  /** Checked hourly; true means granted. */
  target: Condition;
  reward: { mood: number; bond: number; unlock?: string; hint?: boolean };
  /** Default 6 (one season). */
  expiryDays?: number;
  /** Thank-you letter variants, {name} and {place}. */
  thanks: string[];
  /** Relative weight when picking a template. */
  weight?: number;
  /** Phrases for the Chronicle's weekly digest, with {name} (C3B). "a bench by the river for {name}". */
  digest?: string[];
}

export interface PatternDef {
  id: string;
  name: string;
  /** Shown after discovery. */
  flavor: string;
  /** Shown before discovery. */
  hint: string;
  rank: 'hamlet' | 'village' | 'town' | 'marketTown' | 'city';
  /** Id of a detector module in packages/sim/src/systems/hearth/patterns. */
  detector: string;
  /** Detector parameters as a list (never iterated by key in the sim). */
  params: [name: string, value: number][];
  siteBonus: { charm: number; radius: number; category?: CharmCategory };
  /** Decor, building or style ids. */
  unlocks: string[];
  /** Order in which hints are revealed, lowest first (C3B). Content order when absent. */
  hintOrder?: number;
  /**
   * R1 (R1D): the pieces its page's "Lay it out" ghost places as a plan once it is discovered, in
   * tiles from the anchor (x east, z south) before the ghost is turned. Absent: no layout.
   */
  layout?: PatternPiece[];
}

/**
 * R1 (R1D): one piece of a pattern's layout. Decor and trees stand at tile centers; a building's
 * dx, dz are its footprint's corner; a run (linear decor) or a road goes from (dx, dz) to (tx, tz).
 */
export type PatternPiece =
  | { decor: string; dx: number; dz: number; rot?: number }
  | { tree: 'oak' | 'birch' | 'pine'; dx: number; dz: number }
  | { building: string; dx: number; dz: number; rot?: 0 | 1 | 2 | 3 }
  | { run: string; dx: number; dz: number; tx: number; tz: number }
  | { road: 'path' | 'lane'; dx: number; dz: number; tx: number; tz: number };

export interface AchievementDef {
  id: string;
  name: string;
  /** What it was for, shown on the plaque. */
  description: string;
  lane: 'hearth' | 'ledger' | 'shared';
  condition: Condition;
  /** Cosmetic reward ids (decor, title, style). */
  rewards?: string[];
}

/** Chronicle text templates per kind; variants picked with the 'misc' stream. {placeholders} from params. */
export interface ChronicleTemplate {
  kind: string;
  text: string[];
  /** Kinds that count as notable for the while-you-were-away letter. */
  notable?: boolean;
}

// --- Customization (C3B) ----------------------------------------------------------------------

export type SwatchGroup = 'wall' | 'roof' | 'roofMaterial' | 'accent' | 'flowers';

/**
 * A customization choice for build.customize. The sim validates ids per group; the renderer maps
 * them to colors. `token` names the packages/art palette entry (content never imports art).
 */
export interface SwatchDef {
  id: string;
  name: string;
  group: SwatchGroup;
  token: string;
}

// ---------------------------------------------------------------------------------------------
// I2 content types (C4.0). docs/spec/11-residents.md (Ages, Story characters), 13-ledger.md
// (Market, Zoning, Streets, Services, Tiers, Trade), 15-progression.md (Charters, Innovations).

/** Population tier ids (the sim's TierId). Content never imports the sim, so it is repeated here. */
export type TierName = 'settler' | 'craftsfolk' | 'merchant' | 'patron';

/** Town ranks, in order. */
export type RankName = 'hamlet' | 'village' | 'town' | 'marketTown' | 'city';

/**
 * R1: what a tier wants of one family (docs/spec/13-ledger.md, Households: amount and variety).
 * Any flavor of the family counts; households choose among them by price and liking.
 */
export interface FamilyWant {
  family: GoodFamily;
  /** Units a day: a resident's, or a household's with `perHousehold`. May be fractional (0.1). */
  amount: number;
  /** Per household rather than per resident (Fuel, Wares). */
  perHousehold?: boolean;
  /** Only in this season index (Fuel: 3, winter); every day when absent. */
  season?: number;
  /** Flavors of the family the household wants on offer in the last three days (0: none asked). */
  variety: number;
}

/**
 * R1 (R1A): a favorite flavor (docs/spec/13-ledger.md, Households: within a family households choose
 * by price and liking). A household with a member of the species or the trait `who` likes `good`
 * `weight` times as much as a plain flavor (which weighs 1).
 */
export interface FlavorLike {
  /** A species id or a trait id. */
  who: string;
  good: string;
  weight: number;
}

/** What a tier needs beyond shelter, water and belonging (docs/spec/13-ledger.md, Population tiers). */
export interface NeedsBasket {
  tier: TierName;
  /** One want per family it buys, in GOOD_FAMILIES order (Materials never). */
  wants: FamilyWant[];
  /** Service coverage this tier needs: 'social' (tavern), 'health' (herbalist), 'education' (school). */
  services: string[];
  /** Average charm around home this tier needs (0 to 100). */
  charm: number;
  /** Savings in coins a household needs before its home upgrades to this tier. */
  savings: number;
  /**
   * R2 (R2.0): the evenings its grown-ups must average, `PLACES.tierDays` days running (Craftsfolk 50,
   * Merchants 65, Patrons 80; docs/spec/19-evenings.md, Good evenings). R2B's tiers read it in place
   * of `charm` and the tavern in `services`; absent asks nothing.
   */
  evenings?: number;
}

/** A zone the Ledger paints (docs/spec/13-ledger.md, Zoning and growth). */
export interface ZoneDef {
  id: string;
  name: string;
  /** Value stored in the `zone` map layer (1 to 5; 0 is unzoned). */
  layerValue: number;
  density: 'low' | 'medium';
  /** What grows there, in a line for the zone tool. */
  blurb: string;
  /** Lot shapes the subdivider tries, best first. */
  lots: LotDef[];
  /** Overlay tint: a packages/art palette token name. */
  token: string;
  /** R1: the rank before it may be painted (Shops and Townhouses: Village); open at founding when absent. */
  requires?: { rank?: RankName };
  /**
   * R2 (R2F): how frontage on each class of road is cut (13-ledger.md, Lots). A class left out cuts
   * `lots` as C4B did, gaps and all; `street` covers avenues too.
   */
  roads?: { street?: RoadLotsDef; lane?: RoadLotsDef; path?: RoadLotsDef };
}

/** R2 (R2F): how a zone's frontage along one class of road is cut into lots. */
export interface RoadLotsDef {
  /** Lot shapes along this class of road: widths 1 to 3 along it, depths 2 to 4 back from it. */
  lots: LotDef[];
  /**
   * True: each frontage run is cut into lots that touch, one row with no gaps, with garden lots in
   * the block behind and a corner lot where two roads meet (V3B joins and draws them).
   */
  row?: boolean;
}

/** A lot shape for a zone: a footprint facing the road. */
export interface LotDef {
  /** Width along the road and depth away from it, in tiles. */
  size: [w: number, d: number];
  /** Relative weight when several shapes fit. */
  weight: number;
}

/** An NPC neighbor town (docs/spec/13-ledger.md, Trade). */
export interface NeighborDef {
  id: string;
  name: string;
  blurb: string;
  /** Playtest item 9: its character in one line, for the Trade book's Deals page. */
  character?: string;
  /** Goods it sells to the valley, with a price factor on base in percent (90 = cheap there). */
  sells: [good: string, percent: number][];
  /** Goods it buys from the valley, with a price factor on base in percent (120 = keen buyer). */
  buys: [good: string, percent: number][];
  /** Seasonal price factors in percent: [good, season 0 to 3, percent]. */
  seasonal?: [good: string, season: number, percent: number][];
  /** Days a caravan takes there and back. */
  days: number;
  /** Rank needed before it trades (Port Amberly waits for Town). */
  rank?: RankName;
  /**
   * R1 (R1A): the deals it offers, one a season in turn (docs/spec/13-ledger.md, The carrier and
   * trade): the carrier buys a family from it (`buy`) or sells a family to it (`sell`) at `percent`
   * of its regional price for the season, when the season plan takes the deal.
   */
  deals?: [family: GoodFamily, side: 'buy' | 'sell', percent: number][];
}

/** Technology that arrives through conditions in the town (docs/spec/15-progression.md). */
export interface InnovationDef {
  id: string;
  name: string;
  /** One line for the inventor's notebook. */
  blurb: string;
  /** Unlocks when this holds (checked hourly). */
  condition: Condition;
  /** A named progress measure in the sim (systems/innovations) for the bar; 0 until done when absent. */
  measure?: string;
  /** Building, method, road or capability ids it unlocks ('street', 'cart-shed', 'porter-carry-6'). */
  unlocks: string[];
  /** Rank it can first progress at. */
  rank: RankName;
}

/** A goal on a Charter board, with the lane icon it shows. */
export interface CharterGoal {
  id: string;
  text: string;
  lane: 'hearth' | 'ledger' | 'shared';
  /** What is counted and the target (progress shows count / target). */
  measure: {
    what: CountWhat;
    ref?: string;
    /** R1A: counts nothing until this many Food flavors are on offer (the Village's food goal). */
    flavors?: number;
  };
  target: number;
}

/** The goals for the next rank (docs/spec/15-progression.md, Ranks and Charters). */
export interface CharterDef {
  id: string;
  /** The rank it grants. */
  rank: RankName;
  /** The rank you hold while working on it. */
  from: RankName;
  goals: CharterGoal[];
  /** Content and capability ids unlocked on reaching the rank. */
  unlocks: string[];
  /** Words for the rank-up moment (Chronicle and letter), with {town}. */
  proclamation: string;
  /** I3 (C5.0): the trial that seals it (the Village's first winter). */
  trial?: TrialDef;
}

/** A fixed resident for a story arc (docs/spec/11-residents.md, Story characters). */
export interface ResidentTemplate {
  given: string;
  family: string;
  species: string;
  traits: string[];
  stage: 'young' | 'adult' | 'elder';
  bio: string;
}

export interface Reward {
  mood?: number;
  bond?: number;
  /** Content ids unlocked (decor, buildings, styles). */
  unlock?: string[];
  /** Innovation ids completed outright. */
  innovation?: string[];
  coins?: number;
  /** I3 (C5.0): renown points (C5B's addRenown). */
  renown?: number;
}

export interface StoryStep {
  /** The letter that opens the step, with {seat} (the reader's name) and {town}. */
  letter: string;
  goal: Condition;
  reward: Reward;
  /** Shown in the story panel while the step is open. */
  hint: string;
}

export interface StoryArc {
  id: string;
  character: ResidentTemplate;
  /** When they move in. */
  arrival: Condition;
  /** The letter they send on arrival. */
  hello: string;
  /** 4 to 6 steps. */
  steps: StoryStep[];
  finale: Reward & { letter: string };
  /**
   * R3 (R3B, additive): the trade (or specialized building's def id) the character is a master of by
   * their arc, once the arc is done (its finale given; 11-residents.md, Story characters). A story
   * master counts for Master of the House but not against a trade's one new master a season. Absent:
   * none.
   */
  mastery?: string;
}

/** A cart (docs/spec/13-ledger.md, Logistics; Streets and traffic). */
export interface CartDef {
  id: string;
  name: string;
  /** Units carried. */
  capacity: number;
  /** Ticks per tile by road id; carts use lanes and streets only. */
  ticksPerTile: [road: string, ticks: number][];
  art: ArtRef;
}

/**
 * A district style for grown buildings (docs/spec/12-hearth.md, District styles). I2 (C4B): the
 * growth pass picks one per lot from the land and the street around it, and new lots follow their
 * neighbors, so a street reads as one place; C4E draws the materials. Hearth assigns styles by
 * hand from I4.
 */
export interface DistrictStyleDef {
  id: string;
  name: string;
  /** One line for the style picker. */
  blurb: string;
  /** Where the style comes naturally: by water, up the hillside, on streets, among gardens, by zone. */
  suits: { water?: boolean; high?: boolean; street?: boolean; nature?: boolean; zones?: string[] };
}

// ---------------------------------------------------------------------------------------------
// I3 content types (C5.0). docs/spec/14-challenge.md (Seasons, Weather and events, Threats,
// Defenses), 12-hearth.md (Festivals, Nature), 13-ledger.md (I3 goods, River Dock, Commissions),
// 15-progression.md (Renown, trials), 10-world-and-building.md (Customization phase 2).
// C5.0 seeds ids and names; the owning tracks write the numbers.

/** Permille: 1000 is x1. */
export type Permille = number;

/** One season (docs/spec/14-challenge.md, Seasons). `index` is the SeasonIndex. */
export interface SeasonDef {
  id: string;
  name: string;
  index: number;
  /** Days of the season grain is sown and harvested (1 to 6), when it is. */
  sow?: [from: number, to: number];
  harvest?: [from: number, to: number];
  river: 'high' | 'best' | 'normal' | 'freezes';
  /** Firewood per household per day (winter). */
  warmth?: number;
  /** Events that can come this season (content.events ids). */
  events: string[];
  /** This season's festival (content.festivals id). */
  festival: string;
}

/** A daily weather kind with its odds per season and its effects (C5A). */
export interface WeatherDef {
  id: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'heat';
  name: string;
  /** Chance per day by season index, permille. */
  odds: [season: number, chance: Permille][];
  /** Named effects the systems read: ['farm', 1100], ['leisure', 500], ['walk', 1300] (snow: permille of tile ticks). */
  effects: [name: string, factor: Permille][];
}

/** A weather event (C5A): flood, drought, early frost, cold snap, travelling circus. */
export interface EventDef {
  id: string;
  name: string;
  /** Season index it comes in. */
  season: number;
  /** Rank needed (the circus waits for a Village). */
  rank?: RankName;
  /** Chance per season, permille (times the dial). */
  odds: Permille;
  /** Days of warning, and how long it lasts. */
  forecastDays: [min: number, max: number];
  durationDays: [min: number, max: number];
  effects: [name: string, factor: Permille][];
  /** One line for the season card and the barometer. */
  blurb: string;
  /** R1 (R1A): may come every year (the closed pass); others never come two of their seasons running. */
  yearly?: true;
}

/** A seasonal festival (C5B). */
export interface FestivalDef {
  id: string;
  name: string;
  season: number;
  /** One line for the planner. */
  blurb: string;
  /** Festival piece decor ids that suit it best. */
  pieces: string[];
}

/** A rotating festival twist (C5B): a secondary goal so no two festivals feel alike. */
export interface FestivalTwistDef {
  id: string;
  name: string;
  blurb: string;
  /** Seasons it can come in; any when absent. */
  seasons?: number[];
  /** What earns the twist bonus. */
  goal?: Condition;
  /**
   * R3 (R3.0): a custom's twist (docs/spec/19-evenings.md, The Town Book: a custom can be a festival's
   * twist): offered only once this custom's page is found (a content custom id).
   */
  custom?: string;
}

export type HabitatName = 'pollinator' | 'wetland' | 'hedgerow' | 'woodland' | 'meadow' | 'garden';

/** A Field Guide species (C5C). */
export interface WildlifeDef {
  id: string;
  name: string;
  kind: 'bird' | 'insect' | 'mammal' | 'amphibian' | 'fish';
  /** Habitat scores (0 to 255) it needs nearby. */
  habitats: [habitat: HabitatName, min: number][];
  /** Season indexes it shows in. */
  seasons: number[];
  /** Hours it is about: [from, to), wrapping past midnight. */
  hours: [from: number, to: number];
  /** Chance per hour when everything suits it, permille. */
  rarity: Permille;
  /** Something it needs besides habitat ('hive' for the honeybee). */
  needs?: string;
  /** Named effects once sighted ('orchardYield', 1100). */
  effect?: [name: string, factor: Permille][];
  /** The Field Guide's line. */
  flavor: string;
  /** C5C (additive): the Field Guide's hint before it is found, in words a player can act on. */
  hint?: string;
}

/** A habitat (C5C): its name and what makes it, for the overlay and the Field Guide. */
export interface HabitatDef {
  id: HabitatName;
  name: string;
  blurb: string;
}

/**
 * What adds to a chunk's habitat score (C5C), summed per chunk and capped at 255. `from` says what
 * is counted and `ref` which: a decor or building tag (each piece, in the chunk of its tile or its
 * footprint's center), a module id (each building wearing it), a map terrain name or water name
 * (each tile), a tree stage name ('grown' or 'mature', each tile), a pattern id (each site anchored
 * in the chunk), or 'windowBoxes' (each building with window boxes on).
 */
export interface HabitatSource {
  habitat: HabitatName;
  from: 'decor' | 'building' | 'module' | 'terrain' | 'water' | 'tree' | 'site' | 'custom';
  ref: string;
  points: number;
}

/** A threat (C5D). Raiders are a gang, not a species. */
export interface ThreatDef {
  id: string;
  name: string;
  spawn: ('forest' | 'road' | 'edge')[];
  /** Ticks per tile. */
  speed: number;
  morale: number;
  /** Units each carries. */
  carry: number;
}

/** What a defense piece does (C5D). */
export interface DefenseDef {
  hp?: number;
  /** Blocks walking (walls). */
  blocks?: boolean;
  /** Gates let residents and carts through while open. */
  passable?: 'gate';
  /** Watchtowers: morale range in tiles. */
  towerRange?: number;
  /** Extra days of raid warning. */
  warningDays?: number;
  trap?: 'pit' | 'net';
}

export type ModuleSlot = 'roof' | 'front' | 'side' | 'top' | 'wall';

/** A module for customization phase 2 (C5C): porch, dormer, bay window, extra floor, tower... */
export interface ModuleDef {
  id: string;
  name: string;
  slot: ModuleSlot;
  cost?: Cost;
  charm?: CharmSource[];
  art: ArtRef;
}

/**
 * One rung of the ladder homes climb by themselves (P1, systems/dressing). `custom` steps switch on a
 * customization field (`ref`: 'windowBoxes'); `module` steps fit the module `ref` free, in its slot.
 * Steps are tried in order; each needs the door charm (radius 3 average) at `charm` or more, and a town
 * of at least `rank`. `notice` is the gentle line sent when a home takes the step ({family}).
 */
export interface DressingStep {
  id: string;
  kind: 'custom' | 'module';
  ref: string;
  charm: number;
  rank: RankName;
  notice: string;
}

/** A commission a neighbor or notable visitor asks for (C5B). */
export interface CommissionDef {
  id: string;
  name: string;
  /** A neighbor id, or 'visitor'. */
  from: string;
  /** What is asked: goods delivered, or a condition met. */
  ask: { goods: [good: string, qty: number][] } | { condition: Condition };
  deadlineDays: number;
  reward: Reward;
  /** Renown level needed before it is offered. */
  renown?: number;
  // C5B additions.
  /** A notable visitor's name, for asks `from: 'visitor'`. */
  visitor?: string;
  /** A building the town must be able to build before it is offered (a `Condition` ask's subject). */
  builds?: string;
  /** One line for the commission card, in the asker's voice. */
  blurb?: string;
}

/**
 * Festival scoring and rewards (C5B; docs/spec/12-hearth.md, Festivals). The sim and the tests read
 * these numbers rather than pinning them.
 */
export interface FestivalTuning {
  /** Joy weights for the five parts, summing to 100. */
  weights: { site: number; variety: number; menu: number; music: number; twist: number };
  /** Score (0 to 100) needed for 2, 3, 4 and 5 stars; below the first is 1 star. */
  stars: [number, number, number, number];
  /** Tiles (Chebyshev) from a resident's home door to the site that count as walking reach. */
  reach: number;
  /** Attendance by today's weather, permille; kinds not listed are 1000. */
  weather: [kind: string, permille: number][];
  /** Attendance at mood 0, permille, rising in a straight line to 1000 at mood 100. */
  moodFloor: number;
  /** Average site charm that earns the whole site part; a pattern site adds `patternBonus` points. */
  siteCharm: number;
  patternBonus: number;
  /** Distinct festival piece defs on the site for the whole variety part. */
  varietyFull: number;
  /** Menu: distinct goods for full variety (half the part), units a guest for full sufficiency (the other half). */
  menuGoods: number;
  perGuest: number;
  /** Music part by source. */
  music: { none: number; resident: number; bandstand: number; both: number };
  /** The twist part when the twist's goal holds (0 otherwise). */
  twist: number;
  /** The score is joy x turnout: permille at no turnout, 1000 when everyone in reach came. */
  turnoutFloor: number;
  /** Town mood bonus by stars (index 0 to 5; 0 unused), held `moodDays` days. */
  mood: number[];
  moodDays: number;
  /** Renown points by stars (index 0 to 5). */
  renown: number[];
  /** Unlocks the first time a festival reaches a number of stars. */
  unlocks: [stars: number, ids: string[]][];
  /** Units a Generous resident with savings gives to the menu (they buy it at the market). */
  donation: number;
}

/** A renown level and what it brings (C5B). */
export interface RenownDef {
  level: number;
  name: string;
  /** Points needed. */
  points: number;
  effects: [name: string, value: number][];
}

/** The trial that seals a Charter (C5A for winter, C5D for raids). */
export interface TrialDef {
  kind: 'winter' | 'raid' | 'flood';
  name: string;
  /** One line for the trial card. */
  blurb: string;
}

/** A step of the first days guide (C5H). */
export interface GuideStep {
  id: string;
  /** Whose lane it teaches. */
  lens: 'hearth' | 'ledger' | 'both';
  letter: string;
  goal: Condition;
  hint: string;
  point?: GuidePoint;
}

/** What the guide's arrow points at (C5H): a tool, a panel, an overlay or a place. */
export interface GuidePoint {
  tool?: string;
  panel?: string;
  overlay?: string;
  tile?: 'start' | 'gate' | 'storehouse';
}

/** The first days guide (C5H): letters from a County surveyor, one step at a time. */
export interface GuideDef {
  id: string;
  from: ResidentTemplate;
  steps: GuideStep[];
  /** C5H: the last letter, once every step is done ({town}); Pippa Quill is on her way. */
  farewell?: string;
  /** C5H: the last letter when Pippa Quill already lives in the valley. */
  farewellAfterPippa?: string;
}

// --- The evening round (R2.0) -----------------------------------------------------------------
// docs/spec/19-evenings.md. Every number of its R2 sections lives in `PLACES` (content/places.ts) or
// the gap table, never in a system, so R2X tunes in one file. All *(tune)*.

/** R2 (R2.0): the evening round's numbers (docs/spec/19-evenings.md, The day in two acts to Gaps). */
export interface PlacesTuning {
  // The day in two acts
  /** The evening: from this hour to `homeHour` folk make their round. */
  eveningHour: number;
  /** Folk set off home (21:00), and on a festival night at `festivalHomeHour` (22:00). */
  homeHour: number;
  festivalHomeHour: number;
  /** Minutes after `eveningHour` over which grown-ups plan, each at their own minute (30). */
  planMinutes: number;
  /** Builders and porters plan at this hour (19:00). */
  latePlanHour: number;
  /** The lingering evening: the clock runs at this percent of the chosen speed from `eveningHour` to `homeHour` (50). */
  lingerPercent: number;
  // Where places come from
  /** Seat pieces in no pattern site within this many tiles of each other make one sitting spot (3)... */
  spotRadius: number;
  /** ...of at most this many pieces (4). */
  spotMaxPieces: number;
  /** A porch's seats, for its own household (2). */
  porchSeats: number;
  /** The skating ice's standing room (12). */
  iceStanding: number;
  /** A walk holds one stroller for every this many tiles (2). */
  walkTilesPerStroller: number;
  /** Beyond its seats a place has standing room for this percent of them again (50), at least `standingMin` (2). */
  standingShare: number;
  standingMin: number;
  /** Outlets with Treats within this many tiles serve a place (3). */
  serveRadius: number;
  /** Water within this many tiles makes a place a view (3). */
  waterRadius: number;
  // Draw (0 to 100)
  /** Charm counts up to this (70). */
  charmCap: number;
  /** A pattern site (8). */
  siteBonus: number;
  /** Each kind of piece in it (2), up to `pieceKindMax` (8). */
  pieceKindBonus: number;
  pieceKindMax: number;
  /** Water within `waterRadius` (5). */
  waterBonus: number;
  /** Its lanterns lit from `litHour` (5 from 18:00). */
  litBonus: number;
  litHour: number;
  /** It serves Treats (4). */
  treatsBonus: number;
  /** Open air in winter with no fire and no ice (20 off). */
  winterPenalty: number;
  // The round
  /** Leisure radius in tiles (12; Curious 18; Homebody 6). */
  radius: number;
  curiousRadius: number;
  homebodyRadius: number;
  /** A resident's taste for a place, species and traits as built, kept within these (-10 to 15). */
  tasteMin: number;
  tasteMax: number;
  /** A friend is going (8). */
  friendBonus: number;
  /** Off the score per tile of Manhattan distance, in hundredths (35). */
  distanceHundredths: number;
  /** Off for every seat's worth of crowd beyond its room (20). */
  crowdPenalty: number;
  /** The whim: up to this many points either way, from the `round` stream (4). */
  whim: number;
  /** Under this a place is not worth the walk: they stay in (20). */
  minScore: number;
  /** Percent of residents (by id and day) who take their second best first (50). */
  secondBestPercent: number;
  /** A second and third stop, each within this many tiles of the last (8), up to `maxStops` (3). */
  nextStopRadius: number;
  maxStops: number;
  /** A stop lasts about this many minutes (60). */
  stopMinutes: number;
  /** An evening at a friend's home draws this (30), with no bonus for meeting the friend. */
  visitDraw: number;
  /** In rain this percent of residents skip open-air places (50); in a storm everyone stays in. */
  rainSkipPercent: number;
  // Routes
  /** Tiles at this charm or more (40), and evening streets, cost what they always do... */
  pleasantCharm: number;
  /** ...plain tiles this percent (125)... */
  plainCostPercent: number;
  /** ...and tiles with noise `noisyNoise` (3) or more this percent (150). */
  noisyCostPercent: number;
  noisyNoise: number;
  // Evening trade
  /** Passing within this many tiles of an outlet with Treats (1), a resident still owed one buys one time in `passingOneIn` (5). */
  passingRadius: number;
  passingOneIn: number;
  /** The doorstep errand: at this hour and minute (21:30) a household that bought nothing on the round sends for this percent of what it is owed (33). */
  doorstepHour: number;
  doorstepMinute: number;
  doorstepPercent: number;
  // Shops follow the walkers
  /** A Shops lot's desirability gains up to this for evening footfall at its frontage (30)... */
  footfallDesirability: number;
  /** ...in full when this percent of the town's grown-ups pass (10). */
  footfallFullPercent: number;
  /** And this for a place within `placeNearShopRadius` tiles (10 within 3). */
  placeNearShop: number;
  placeNearShopRadius: number;
  /** The Shops bar counts each place that drew this many visitors (8) with nothing to sell them. */
  unservedVisitors: number;
  /** A shop of this level (2) whose door is within `cafeRadius` tiles (2) of `cafeSeats` seats (2) puts tables out. */
  cafeLevel: number;
  cafeRadius: number;
  cafeSeats: number;
  /** Every this many evening steps past a shop's door count as one more customer for its level (10). */
  stepsPerCustomer: number;
  /**
   * R3X: units of a market outlet's storage porters keep free of food and Wares until its Treats fill them
   * (12), so a full pantry never leaves its shelf without a Treat for the round. Absent: 12.
   */
  treatsRoom?: number;
  // Good evenings
  /** Staying in scores this, every evening's floor (20). */
  stayInScore: number;
  /** Meeting a friend at a stop (8), a treat (8), a second kind of stop (4), standing (10 off). */
  friendScore: number;
  treatScore: number;
  secondKindScore: number;
  standingPenalty: number;
  /** The evenings need starts here for a newcomer (50) and moves this fraction of the way to the evening's score at `homeHour` (1 in 3). */
  needStart: number;
  needStepOneIn: number;
  /** Its weight in mood, in beauty's place (15). */
  needWeight: number;
  /** An evening at this score or more is a good one (60); `goodForHeart` (4) of a season's six give a heart, up to `heartsMax` (5). */
  goodEvening: number;
  goodForHeart: number;
  heartsMax: number;
  /** Tiers ask their grown-ups' average evening (NeedsBasket.evenings) this many days running (3). */
  tierDays: number;
  /** R2B: a household staying at its tier is forgiven this much under the tier's evenings (10), as charm had its slack. */
  eveningsSlack: number;
  // Places remembered
  /** A place the pass no longer finds keeps its row this many days (6). */
  forgetDays: number;
  // R2A additions (additive): what the place pass and the planner read beyond the spec's table.
  /** Elders and residents without work make a round in the afternoon, planned from this hour (14) to `eveningHour`. */
  afternoonHour: number;
  /** Pattern ids that are linear walks (kind `walk`, strollers by length). */
  walkPatterns: string[];
  /** Pattern ids where folk gather (kind `meet`: a green, a square, a well). */
  meetPatterns: string[];
  /** Decor ids that make a place a `view` wherever they stand (a lookout). */
  viewPieces: string[];
  /** What the skating ice offers. */
  iceKinds: PlaceKind[];
  /** The festival site's standing room on its night, beside the seats of the pieces on it (40). */
  festivalStanding: number;
  /** A place with room only later in the evening scores this much less for every hour they would wait at home first (2). */
  waitPerHour: number;
  /**
   * R2X: newcomers follow good evenings. A town of this many households or more builds homes for
   * newcomers only as fast as its recent fair evenings send folk out (optional: absent, homes come
   * at the jobs' pace).
   */
  growthFreeHouseholds?: number;
  /**
   * R2X: the share of grown-ups out on recent fair evenings, percent, at which homes come at the jobs'
   * full pace. 0 switches the evenings term off.
   */
  growthFullOutPercent?: number;
  /** R2X: homes the open jobs always get waiting at once, however quiet the evenings (the jobs keep filling). */
  growthBareHomes?: number;
}

/** R2 (R2.0): the gaps (docs/spec/19-evenings.md, Gaps). Index order is the sim's GAP_KINDS; append-only. */
export type GapKind = 'nothingToSell' | 'nobodyPasses' | 'nowhereToGo' | 'shortOfSupplies';

/** R2 (R2.0): a gap's rule and words (content/gaps.ts; R2C writes the words and opens them). */
export interface GapDef {
  kind: GapKind;
  /** The iteration that builds it: R3's row is in the table but never opens before R3. */
  from: 'R2' | 'R3';
  /** Whose work usually closes it (the feed's ink): the Ledger's outlet, the Hearth's place. */
  lane: 'hearth' | 'ledger';
  /** The rule's number: 8 visitors, under 4 customers, 6 households. */
  threshold: number;
  /** Evenings running the rule must hold before it opens (2, 3, 3), and the closing rule before it closes. */
  openAfter: number;
  closeAfter: number;
  /** What it reads like, variants picked deterministically; placeholders {place}, {shop}, {street}, {n}; R2C adds {folk} ("nobody", "one soul", "3 folk"). */
  text: string[];
  /** What would close it, in words. */
  closes: string;
  /**
   * R2 (R2C, additive): the evening edition's line when it closes, crediting the seats who closed
   * it ({closers}, "Kat" or "Kat and Sam"); placeholders as `text`. Absent: the edition says it plainly.
   */
  closed?: string;
  /** R2 (R2C, additive): the closing line when nobody is credited (the place was credited this season). */
  closedQuiet?: string;
}

/**
 * R2 (R2A): the words and numbers behind generated street names (`packages/sim/src/systems/places/streets.ts`).
 * A name is a word and a suffix ("Mill Lane"); the sim holds no words.
 */
export interface StreetNamesTuning {
  /** A run of road is a street from this many tiles. */
  minTiles: number;
  /** How far from the run, in tiles, a thing counts as standing along it. */
  reach: number;
  /** A family names a street when this many of its homes stand along it. */
  homeMin: number;
  /** "Row" instead of the road kind's suffix when homes of that family line this share (percent) of the run. */
  rowShare: number;
  /** Trees along a run (tiles) before they name it. */
  treeMin: number;
  /** Fruit trees along a run before they name it. */
  orchardMin: number;
  /** The longest generated name. */
  maxLength: number;
  /** Building def ids that are homes (a family can name a street by them). */
  homeDefs: readonly string[];
  /** Notable buildings, in priority order: [building def id, first word]. */
  buildingWords: readonly (readonly [def: string, word: string])[];
  /** Notable trades (a business answers to its trade), after the building words: [trade id, first word]. */
  tradeWords: readonly (readonly [trade: string, word: string])[];
  /** Water beside a run: [water layer value, words]; one is picked by the run's anchor. */
  waterWords: readonly (readonly [water: number, words: readonly string[]])[];
  /** Fruit tree decor def ids and the word they give. */
  orchardDecor: readonly string[];
  orchardWord: string;
  /** Forest trees beside a run: [tree species (1 oak, 2 birch, 3 pine), word]. */
  treeWords: readonly (readonly [species: number, word: string])[];
  /** Plain first words when nothing notable stands along a run. */
  fallbackWords: readonly string[];
  /** Tried before any other fallback when a name is taken. */
  prefixes: readonly string[];
  /** Suffixes by road layer value (1 path, 2 lane, 3 street, 4 avenue); one is picked by the run's anchor. */
  suffixes: readonly (readonly [road: number, words: readonly string[]])[];
  /** The suffix when a family names the street and homes line it. */
  rowSuffix: string;
}

/** R2A: the phrase templates for place names and what a place still wants (content/placeWords.ts). */
export interface PlaceWords {
  /** "by the Underbank cottage" ({family} {home}). */
  byFamily: string;
  /** No family near, water within reach. */
  byWater: string;
  /** No family near, no water. */
  atEdge: string;
  /** {pattern} {piece} {building} {festival} {family} are filled by the sim. */
  site: string;
  seats: string;
  host: string;
  fire: string;
  ice: string;
  festival: string;
  porch: string;
  /** Prefixes when a name is taken ({stem}): "the other bench", "the third bench". */
  other: string;
  third: string;
  /** "on Mill Lane" when a street can be read ({street}). */
  onStreet: string;
  /** Appended to a taken name, in order: " (the second)". */
  ordinals: string[];
  /** Appended past the ordinals, once per repeat. */
  again: string;
  /** What a place still wants; {n} is filled by the sim. */
  wantStall: string;
  wantBench: string;
  wantSeats: string;
  wantLantern: string;
  wantBrazier: string;
}

// ---------------------------------------------------------------------------------------------
// R3 content types (R3.0). docs/spec/19-evenings.md, Supplies, Masters, The Town Book;
// docs/spec/15-progression.md, Callings. Every number is *(tune)* and lives here, never in a system.

/** R3: the supplies' numbers (content/supplies.ts, `SUPPLIES`). */
export interface SuppliesTuning {
  /** Pieces draw on the town's goods from this rank; below it every piece is supplied for nothing (village). */
  fromRank: RankName;
  /** The settling: at this hour and minute (17:30) the night's candles, and which lanterns get them, are decided. */
  settleHour: number;
  settleMinute: number;
  /** Settled lanterns count as lit for every rule (charm, the draw, raiders) from this hour (18) to `outHour` (7). */
  litHour: number;
  outHour: number;
  /** One lamplighter job for every this many supplied lanterns, rounded up (40); at least one from `fromRank` once a lantern stands. */
  lanternsPerLamplighter: number;
  /** Ticks the lamplighter stands at each lantern to light it (the walk between is the residents' pace). */
  lightTicks: number;
  /** A household's candle (one unit of candles, bought within its Wares) lasts this many nights (5). */
  candleNights: number;
  /** A home with a candle lights every window from dusk until this hour (22, bedtime). */
  candleUntilHour: number;
  /** A faded or dry piece keeps this percent of its charm (50). */
  restCharmPercent: number;
  /**
   * R3A (additive): ticks a tile the lamplighter's walk is reckoned at when the settling gives each
   * lamp its reach tick, from where he stands at the settling; a lamp he cannot reach before
   * `litHour` comes on then with the rest. Absent reads 5.
   */
  walkTicks?: number;
  /**
   * R3A (additive): how often a kind of piece wants its good, for the fourth gap's words ("6 candles
   * a night"): nightly, evening and season kinds.
   */
  gapWhen?: { nightly: string; evening: string; season: string };
}

/**
 * R3: what a master brings (docs/spec/19-evenings.md, Masters; content/masters.ts, `MASTERS`). One
 * row for each trade and each specialized building that has masters.
 */
export interface MasterDef {
  /** A trade id (content.trades) or a specialized building's def id (the Fishery, the Quarry, the Windmill). */
  of: string;
  /** What the town calls one ("master baker"), lower case, for sentences. */
  title: string;
  /**
   * The master's good (a content good id): made in the same building from the raw good the trade
   * already takes (a land trade from what it grows), sold like any flavor. Absent: no good.
   */
  good?: string;
  /** How the master's good is made, while a master is on the crew (inputs are raw goods only, rule 2). */
  method?: ProductionMethod;
  /** Their business may reach level 3 (`13-ledger.md`, Levels). */
  level3?: boolean;
  /** They take apprentices, so the trade spreads. */
  apprentices?: boolean;
  /** Hearth pieces a master unlocks (the quarryman's carved stone, the forester's ornamental trees). */
  unlocks?: string[];
  /** Room for one more business of this trade in the reach of their building (the miller: one more baker). */
  room?: string;
}

/** R3: masters' numbers (content/masters.ts, `MASTERY`). */
export interface MasteryTuning {
  /** Hearts a resident needs (4)... */
  hearts: number;
  /** ...and working days in one trade (20), apprentice days counting `apprenticeWeight` (2) times. */
  days: number;
  apprenticeWeight: number;
  /** In a business of this level or more (2), or at a specialized building. */
  level: number;
  /** New masters a trade a season (1). */
  perTradeSeason: number;
  /** An apprentice who served a season under a master becomes one after this many working days of their own (10). */
  apprenticeDays: number;
  /** A business keeps its level this many days after its last master leaves or retires (6), then slides. */
  graceDays: number;
  /**
   * R3X (additive): units of a master's good the town keeps before the carrier sells the rest
   * (8; the carrier also keeps twice what households bought of it yesterday). Absent reads 8.
   */
  exportKeep?: number;
}

/** R3: what a Town Book page leans to; three of one leaning earn that calling. Index order is the sim's LEANINGS. */
export type Leaning = 'industry' | 'gardens' | 'pilgrimage';

/**
 * R3: a specialty's pair (docs/spec/19-evenings.md, The Town Book): a Treat sold at a place of this
 * pattern to `TownBookTuning.specialtyCustomers` customers on `specialtyEvenings` evenings of a season.
 */
export interface SpecialtyDef {
  id: string;
  /** The pattern the place is a site of (a content pattern id). */
  pattern: string;
  /** The flavor (a content good id of the Treats family: what the round sells). */
  good: string;
  /** Its name in the book ("Orchard Walk Cider"); {street} and {family} are filled from the place when present. */
  name: string;
  leaning: Leaning;
  /** The page's words once found, in the town's voice. */
  text: string;
  /** The hint before it is found. */
  hint: string;
}

/**
 * R3: a custom (docs/spec/19-evenings.md, The Town Book): a habit the town falls into. `day`: the same
 * place drawing `customVisitors`+ on the same day of the season, `customSeasons` seasons running.
 * `supply`: a place's pieces of `supply` kind kept every night of a season ("the Lantern Round").
 */
export interface CustomDef {
  id: string;
  kind: 'day' | 'supply';
  /** day: the pattern the place is a site of; absent with `host`, or for any place. */
  pattern?: string;
  /** day: a host building's def id (the tavern) instead of a pattern. */
  host?: string;
  /** supply: which supply was kept. */
  supply?: SupplyKind;
  /** Its name ("Market Night"); {place} and {day} are filled by the sim. */
  name: string;
  leaning: Leaning;
  text: string;
  hint: string;
}

/** R3: the Town Book's numbers (content/townBook.ts, `TOWN_BOOK`). */
export interface TownBookTuning {
  /** A specialty: this many customers (10) on this many evenings of a season (4); then it adds `specialtyDraw` (5) to the place's draw. */
  specialtyCustomers: number;
  specialtyEvenings: number;
  specialtyDraw: number;
  /** A custom: this many visitors (20) on the same day of `customSeasons` (3) seasons running; on its day the place draws `customDraw` (15) more. */
  customVisitors: number;
  customSeasons: number;
  customDraw: number;
  /** Renown for a page, as for a pattern (2). */
  pageRenown: number;
  /** Hints shown at once for pages not yet found (3). */
  hints: number;
  /** Pages of one leaning that earn its calling (3). */
  pagesForCalling: number;
  /** Garden Village's day visitors (P1's numbers): the hour they spend, pennies per average door charm point and per renown level, the daily cap, and how often the feed says so. */
  visitors: { hour: number; perCharm: number; perRenown: number; cap: number; noticeEveryDays: number };
}

/**
 * R3: a calling, earned when `TownBookTuning.pagesForCalling` pages of its leaning are found
 * (docs/spec/15-progression.md, Callings). P1's three, ids unchanged; no command picks one.
 */
export interface CallingDef {
  id: string;
  name: string;
  blurb: string;
  /** Glyph id for the Charter board (apps/client/src/ui/icons). */
  icon: string;
  leaning: Leaning;
  /** Plain words, one line per effect, for the Charter board. */
  effectLines: string[];
  /** The decor piece it unlocks (a locked decor id). */
  signature: string;
  /** Garden Village: day visitors spend each afternoon (TownBookTuning.visitors). */
  visitors?: boolean;
  /** Pilgrims' Rest: festivals draw more guests (permille added to each resident's chance) and give more renown. */
  festival?: { guestsPermille: number; renown: number; minStars: number };
  /** Pilgrims' Rest: added to the night value of every lit lantern's light charm. */
  lanternCharm?: number;
  /** Mill Town: room for `extra` more businesses in the reach of each of these specialized buildings (the mills). */
  room?: { buildings: string[]; extra: number };
  /** The district style lean: kept for I4's districts, unread before them. */
  styleWeights?: [style: string, weight: number][];
}
