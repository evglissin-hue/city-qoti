// V3.0: the dressing rules, as data (docs/spec/17-presentation.md, Visual direction, second pass,
// item 4; docs/spec/20-architecture.md, V3 contracts). Each rule says who gets a piece, at which of
// the plot's anchors, how many and how they vary; the resolver (packages/art/src/dressing.ts) turns
// a building's shared state into placements and the dressing layer draws them. Nothing here touches
// the sim: rules read only what every seat's Mirror already holds.
//
// Not to be confused with `dressing.ts` beside it, the P1 ladder the sim climbs (window boxes, a
// porch, ivy): that one is sim content; this one is look data, owned by V3A for the V3 wave (agreed
// with R2's master, who does not edit it). The table ships empty in V3.0; V3A fills it, and V3B adds
// street furniture rows through V3A, one row each. Rule ids are append-only: they seed placements
// and show up in tests and shots. Add a rule as one line in its place (grouped by who it dresses).

/** Who a building is for the dressing: a home, a business on a zoned lot, or a specialized building. */
export type DressingKind = 'home' | 'business' | 'specialized';

/** The plot anchors a rule can name (the art package's `ANCHOR_NAMES`, kept equal by a test). */
export type DressingAnchor = 'door' | 'yard' | 'walls' | 'sills' | 'front' | 'garden' | 'eaves';

/** The seasons in calendar order. */
export type DressingSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** Household tiers (the sim's `TierId`, kept equal by the client's type check). */
export type DressingTier = 'settler' | 'craftsfolk' | 'merchant' | 'patron';

/**
 * A number about a building that a rule's count can scale with. Each is listed in `DRESSING_STATS`
 * with where the client reads it, or the stand-in it uses where the Mirror has a gap.
 */
export type DressingStat =
  'births' | 'cloth' | 'fill' | 'firewood' | 'level' | 'members' | 'stock' | 'workers';

export interface DressingStatDef {
  id: DressingStat;
  /** `read`: the Mirror carries it. `stand-in`: it does not yet; `from` says what stands in. */
  status: 'read' | 'stand-in';
  /** Every stat is shared state, the same in both seats' Mirrors: no rule reads one seat's own. */
  scope: 'shared';
  /** Where the client reads it (or what stands in), and its unit. */
  from: string;
  /** For a stand-in: the field the sim would need (a gap for R2X's list, never a V3 sim edit). */
  gap?: string;
}

/** Every stat a rule can read, alphabetical (docs/build/v3-wave-notes.md, What the sim exposes). */
export const DRESSING_STATS: readonly DressingStatDef[] = [
  {
    id: 'births',
    status: 'read',
    scope: 'shared',
    from: "children in the home's household born in the last 28 days (ResidentView.bornDay)",
  },
  {
    id: 'cloth',
    status: 'stand-in',
    scope: 'shared',
    from: "the household's tier above settler, 0 to 3 (HouseholdView.tier)",
    gap: "a household's cloth (or clothing) on hand",
  },
  {
    id: 'fill',
    status: 'read',
    scope: 'shared',
    from: "a store's units held as a percent of its capacity, 0 to 100 (rt.store over BuildingDef.capacity)",
  },
  {
    id: 'firewood',
    status: 'stand-in',
    scope: 'shared',
    from: "the household's members, doubled in autumn and winter (HouseholdView.members, the clock's season)",
    gap: "a household's firewood in the pantry",
  },
  { id: 'level', status: 'read', scope: 'shared', from: "a business's level, 1 to 3 (BuildingView.level)" },
  {
    id: 'members',
    status: 'read',
    scope: 'shared',
    from: "the home's household members (HouseholdView.members)",
  },
  {
    id: 'stock',
    status: 'read',
    scope: 'shared',
    from: "a business's finished goods waiting, units (rt.output)",
  },
  { id: 'workers', status: 'read', scope: 'shared', from: 'hands at work there (rt.workers)' },
];

/**
 * Who a rule dresses. Every field set must match (and each list matches any of its entries); an
 * empty `who` matches every home, business and specialized building.
 */
export interface DressingWho {
  kind?: readonly DressingKind[];
  /** Building def ids (a granary, a storehouse), for pieces tied to one building. */
  def?: readonly string[];
  /** Trade ids (content `trades`), for a business. */
  trade?: readonly string[];
  /** The least business level, 1 to 3. */
  minLevel?: number;
  /**
   * Place kinds (R2's places, `19-evenings.md`). A gap until R2X: no building has a place kind in
   * the Mirror on `main`, so a rule with `place` matches nothing until it does.
   */
  place?: readonly string[];
  /** The household's tier, for a home. */
  tier?: readonly DressingTier[];
  season?: readonly DressingSeason[];
}

/**
 * How many pieces: `base` plus `perUnit` for each unit of `stat`, rounded down, never more than
 * `max` (and never more than `DRESSING_MAX_PER_RULE`). A woodpile as big as its firewood is
 * `{ base: 0, stat: 'firewood', perUnit: 0.5, max: 6 }`.
 */
export interface DressingCount {
  base: number;
  stat?: DressingStat;
  perUnit?: number;
  max: number;
}

/** The piece: an art kit (a props or decor kit) and the params it is built with. */
export interface DressingPiece {
  kit: string;
  params?: Readonly<Record<string, number | string | boolean>>;
}

export interface DressingRule {
  /** Stable, append-only id; it seeds the rule's placements. */
  id: string;
  who: DressingWho;
  anchor: DressingAnchor;
  piece: DressingPiece;
  count: DressingCount;
  /** Mixed into the building's seed so rules on one plot vary apart. Any integer, unique per rule. */
  seed: number;
  /** The share of matching buildings that get it at all, 0 to 1 (absent is every one): "now and then a cat". */
  chance?: number;
  /** Kept on Low, which draws only signs and stock piles (`QualityPreset.dressing` 'some'). */
  low?: true;
}

/** The most pieces one rule puts on one plot, whatever its `max`. */
export const DRESSING_MAX_PER_RULE = 24;

/** The rules, empty until V3A. */
export const dressingRules: readonly DressingRule[] = [];
