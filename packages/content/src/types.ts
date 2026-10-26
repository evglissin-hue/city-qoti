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
  /** At least one footprint tile lies on this deposit. NEEDS_DEPOSIT. */
  | { kind: 'deposit'; deposit: DepositKind }
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
}
