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
  /** Jobs at this building and who fills them. */
  jobs?: { count: number; role: JobRole };
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
  | 'togetherSites';

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
