// Content contract (docs/spec/31-parallel-development.md): additive changes only during parallel waves.
// Ids are kebab-case and stable forever, because saves reference them.

/** Which lens a piece belongs to. Shared pieces show in both lens toolbars. */
export type ContentLane = 'hearth' | 'ledger' | 'shared';

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
  | { kind: 'height'; min?: number; max?: number };

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
  /** Storage capacity in units, all goods together (storehouse 400, market stall 40). */
  storage?: number;
  /** Area services: water (well), food outlet (market stall), logistics (storehouse range). */
  coverage?: Coverage[];
  /** Production methods; the first is the default. */
  methods?: ProductionMethod[];
  /** Builder-hours of work to finish construction (standard valleys). */
  work?: number;
  /** Output buffer capacity per good (default 10; farms 30). */
  outputBuffer?: number;
  /** Charm sources at the building (well comfort, workshop noise). */
  charm?: CharmSource[];
  /** Behavior tags: 'bakery', 'workshop', 'smelly', 'outlet', 'storehouse', 'farm', 'builders'. */
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
  /** Rank or innovation needed before it can be placed or grown. */
  requires?: { rank?: RankName; innovation?: string };
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
  /** Append-only order: a good's index in this list is its index in every per-good array. */
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
}

// ---------------------------------------------------------------------------------------------
// I1 content types (C3.0). docs/spec/11-residents.md, 12-hearth.md, 13-ledger.md, 15-progression.md

export type ValleyMode = 'sandbox' | 'standard';

/** Who fills a building's jobs. Porters work at storehouses, builders at the town hall and yard. */
export type JobRole = 'worker' | 'builder' | 'porter' | 'vendor';

export type GoodCategory = 'material' | 'rawFood' | 'processed' | 'food' | 'fuel' | 'crafted' | 'treat';

export interface GoodDef {
  id: string;
  name: string;
  /** Short plural label for tight UI ("logs"). */
  label: string;
  category: GoodCategory;
  /** Base price in pennies (100 pennies = 1 coin). */
  basePrice: number;
  /** Units a porter carries in one trip. */
  carry: number;
  /** Residents eat it (fills the pantry). */
  food?: boolean;
  /** Spoils after this many days [I3]. */
  spoilsDays?: number;
  /** Art kit for carried bundles and stock piles (packages/art). */
  art?: ArtRef;
}

/**
 * How a building turns inputs into outputs. `kind` picks the production logic:
 * craft (inputs to outputs per cycle), gather (outputs from nothing, for example a quarry or fisher),
 * fell (woodcutter: fells a mature tree in range), plant (forester: plants a sapling in range),
 * farm (farmhouse: tends painted field tiles).
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
  /** Output is per worker present rather than per building (quarry, fisher, woodcutter). */
  perWorker?: boolean;
  /** Tiles: woodcutter and forester range, farm field reach. */
  range?: number;
  /** Bonus in percent at height level `heightMin` or more (windmill +25 at 4). */
  heightBonus?: { heightMin: number; percent: number };
}

export interface Coverage {
  kind: 'water' | 'food' | 'logistics';
  /** Tiles (straight-line for water and food, walking distance for logistics). */
  radius: number;
  /** Residents served (well 30). */
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
  /** Escape hatch to a named predicate in packages/sim/src/conditions/code.ts ('lanternRoute', 'pathRoute'). */
  | { code: string; params?: [name: string, value: number][] };

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
  /** Requests between seats fulfilled. */
  | 'requestsFulfilled'
  /** Distinct goods in stock at market outlets. */
  | 'goodsAtMarket'
  /** Innovations unlocked. */
  | 'innovations';

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
}

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

export type SwatchGroup = 'wall' | 'roof' | 'roofMaterial' | 'accent';

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
 * One line of a tier's needs basket: a need group (food, bread, firewood, cloth...) with the
 * quantity a household member uses per day and the goods that can satisfy it, with preference
 * weights (higher is preferred). Households buy the good with the best price / weight they can
 * afford; Thrifty households weigh price more.
 */
export interface NeedGroup {
  id: string;
  name: string;
  /** Units per resident per day; may be fractional (cloth 0.1). The sim accrues hundredths. */
  perDay: number;
  /** Per household rather than per resident (firewood). */
  perHousehold?: boolean;
  /** Only in this season (0 spring to 3 winter) [I3: winter warmth]; every season when absent. */
  season?: number;
  /** Substitutable goods and their preference weights (1 = plain, 2 = twice as wanted). */
  goods: [good: string, weight: number][];
}

/** What a tier needs beyond shelter, water and belonging (docs/spec/13-ledger.md, Population tiers). */
export interface NeedsBasket {
  tier: TierName;
  /** Need groups bought at the market (food is a group too). */
  groups: NeedGroup[];
  /** Service coverage this tier needs: 'social' (tavern), 'health' (herbalist), 'education' (school). */
  services: string[];
  /** Average charm around home this tier needs (0 to 100). */
  charm: number;
  /** Savings in coins a household needs before its home upgrades to this tier. */
  savings: number;
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
  measure: { what: CountWhat; ref?: string };
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
