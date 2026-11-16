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
    from: "a store's units held as a percent of its capacity, 0 to 100 (rt.store over BuildingDef.storage)",
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

/** Every trade that keeps a shop front or a workshop on the street, for awnings and bigger yards. */
const STREET_TRADES = ['baker', 'carpenter', 'chandler', 'cider-maker', 'shop', 'weaver'];

/**
 * A level 2 business's painted sign and goods out front, one pair of rules per trade, the emblem
 * and the goods by what it makes. The orchard has none: it belongs to the valley (P2-E2), no lot.
 */
function levelTwo(trade: string, good: string, seed: number): DressingRule[] {
  return [
    {
      id: `sign-${trade}`,
      who: { kind: ['business'], trade: [trade], minLevel: 2 },
      anchor: 'door',
      piece: { kit: 'yard-sign', params: { emblem: good } },
      count: { base: 1, max: 1 },
      seed,
      low: true,
    },
    {
      id: `goods-${trade}`,
      who: { kind: ['business'], trade: [trade], minLevel: 2 },
      anchor: 'front',
      piece: { kit: 'goods-display', params: { good } },
      count: { base: 1, max: 1 },
      seed: seed + 1,
    },
  ];
}

/**
 * V3A: the rules. Grouped by who they dress; within a group, one line each in its place. Counts read
 * the stats in `DRESSING_STATS` (firewood and cloth are stand-ins until R2X). A yard is a few well
 * chosen things: chances keep homes from all looking stamped from one mold.
 */
// prettier-ignore
export const dressingRules: readonly DressingRule[] = [
  // By trade (the fishery is a building, not a trade: it matches by def).
  { id: 'baker-loaves', who: { trade: ['baker'] }, anchor: 'sills', piece: { kit: 'yard-loaf-tray' }, count: { base: 1, stat: 'stock', perUnit: 0.5, max: 3 }, seed: 101 },
  { id: 'baker-sacks', who: { trade: ['baker'] }, anchor: 'eaves', piece: { kit: 'goods-sacks' }, count: { base: 1, max: 1 }, seed: 102 },
  { id: 'carpenter-chair', who: { trade: ['carpenter'] }, anchor: 'yard', piece: { kit: 'yard-chair-half' }, count: { base: 1, stat: 'workers', perUnit: 0.5, max: 2 }, seed: 103 },
  { id: 'chandler-candles', who: { trade: ['chandler'] }, anchor: 'yard', piece: { kit: 'goods-candle-rack' }, count: { base: 1, max: 1 }, seed: 104 },
  { id: 'cider-apples', who: { trade: ['cider-maker'] }, anchor: 'yard', piece: { kit: 'goods-apple-crate' }, count: { base: 1, stat: 'stock', perUnit: 0.25, max: 3 }, seed: 105 },
  { id: 'cider-barrels', who: { trade: ['cider-maker'] }, anchor: 'eaves', piece: { kit: 'barrels' }, count: { base: 1, max: 1 }, seed: 106 },
  { id: 'dairy-churns', who: { trade: ['dairy'] }, anchor: 'door', piece: { kit: 'goods-churns' }, count: { base: 1, max: 1 }, seed: 107 },
  { id: 'grain-sacks', who: { trade: ['grain-farm'] }, anchor: 'eaves', piece: { kit: 'goods-sacks' }, count: { base: 1, stat: 'stock', perUnit: 0.2, max: 3 }, seed: 108 },
  { id: 'hives-skeps', who: { trade: ['hives'] }, anchor: 'yard', piece: { kit: 'yard-skep' }, count: { base: 2, stat: 'workers', perUnit: 1, max: 5 }, seed: 109 },
  { id: 'market-garden-barrow', who: { trade: ['market-garden'] }, anchor: 'yard', piece: { kit: 'yard-wheelbarrow' }, count: { base: 1, max: 1 }, seed: 110 },
  { id: 'sheep-fleece', who: { trade: ['sheep-run'] }, anchor: 'eaves', piece: { kit: 'goods-fleece' }, count: { base: 1, stat: 'stock', perUnit: 0.25, max: 3 }, seed: 111 },
  { id: 'weaver-cloth', who: { trade: ['weaver'] }, anchor: 'yard', piece: { kit: 'yard-cloth-frame' }, count: { base: 1, stat: 'workers', perUnit: 0.5, max: 2 }, seed: 112 },
  { id: 'fishery-nets', who: { def: ['fishery'] }, anchor: 'yard', piece: { kit: 'yard-nets' }, count: { base: 1, max: 1 }, seed: 113 },
  { id: 'fishery-fish', who: { def: ['fishery'] }, anchor: 'eaves', piece: { kit: 'goods-fish-rack' }, count: { base: 1, max: 1 }, seed: 114 },

  // By household: a woodpile as big as the firewood, washing once there is cloth, a pram after a
  // birth, and the odd pair of boots, cat, water butt or chopping block. Lamps join the night.
  { id: 'home-woodpile', who: { kind: ['home'] }, anchor: 'eaves', piece: { kit: 'yard-woodpile' }, count: { base: 0.5, stat: 'firewood', perUnit: 0.5, max: 4 }, seed: 201 },
  { id: 'home-washing', who: { kind: ['home'] }, anchor: 'yard', piece: { kit: 'yard-washing-line' }, count: { base: 0, stat: 'cloth', perUnit: 1, max: 1 }, seed: 202 },
  { id: 'home-pram', who: { kind: ['home'] }, anchor: 'yard', piece: { kit: 'yard-pram' }, count: { base: 0, stat: 'births', perUnit: 1, max: 1 }, seed: 203 },
  { id: 'home-boots', who: { kind: ['home'], tier: ['settler', 'craftsfolk'] }, anchor: 'door', piece: { kit: 'yard-boots' }, count: { base: 1, max: 1 }, seed: 204, chance: 0.45 },
  { id: 'home-cat', who: { kind: ['home'] }, anchor: 'yard', piece: { kit: 'yard-cat' }, count: { base: 1, max: 1 }, seed: 205, chance: 0.16 },
  { id: 'home-chopping', who: { kind: ['home'], tier: ['settler', 'craftsfolk'] }, anchor: 'yard', piece: { kit: 'yard-chopping-block' }, count: { base: 1, max: 1 }, seed: 206, chance: 0.3 },
  { id: 'home-water-butt', who: { kind: ['home'] }, anchor: 'eaves', piece: { kit: 'yard-water-butt' }, count: { base: 1, max: 1 }, seed: 207, chance: 0.35 },
  { id: 'home-barrow', who: { kind: ['home'] }, anchor: 'garden', piece: { kit: 'yard-wheelbarrow' }, count: { base: 1, max: 1 }, seed: 208, chance: 0.12 },
  { id: 'home-lamp', who: { kind: ['home'], tier: ['merchant', 'patron'] }, anchor: 'yard', piece: { kit: 'yard-lamp' }, count: { base: 1, max: 1 }, seed: 209, chance: 0.6 },
  { id: 'home-sill-lamp', who: { kind: ['home'] }, anchor: 'sills', piece: { kit: 'yard-sill-lamp' }, count: { base: 1, max: 1 }, seed: 210, chance: 0.3 },

  // By level: a level 2 business hangs a painted sign and sets goods out front; level 3 adds an
  // awning (on the street trades) and a bigger yard.
  ...levelTwo('baker', 'bread', 301),
  ...levelTwo('carpenter', 'chair', 303),
  ...levelTwo('chandler', 'candles', 305),
  ...levelTwo('cider-maker', 'cider', 307),
  ...levelTwo('dairy', 'cheese', 309),
  ...levelTwo('grain-farm', 'grain', 311),
  ...levelTwo('hives', 'honey', 313),
  ...levelTwo('market-garden', 'veg', 315),
  ...levelTwo('sheep-run', 'wool', 317),
  ...levelTwo('shop', 'sundries', 319),
  ...levelTwo('weaver', 'cloth', 321),
  { id: 'awning-l3', who: { kind: ['business'], trade: STREET_TRADES, minLevel: 3 }, anchor: 'front', piece: { kit: 'yard-awning' }, count: { base: 1, max: 1 }, seed: 351 },
  { id: 'yard-l3', who: { kind: ['business'], trade: [...STREET_TRADES, 'dairy', 'grain-farm', 'hives', 'market-garden', 'sheep-run'], minLevel: 3 }, anchor: 'yard', piece: { kit: 'crates' }, count: { base: 1, max: 2 }, seed: 352 },

  // By stock: sacks and barrels pile up at granaries and storehouses as they fill (kept on Low).
  { id: 'granary-sacks', who: { def: ['granary'] }, anchor: 'yard', piece: { kit: 'goods-sacks' }, count: { base: 0, stat: 'fill', perUnit: 0.08, max: 8 }, seed: 401, low: true },
  { id: 'storehouse-crates', who: { def: ['storehouse'] }, anchor: 'yard', piece: { kit: 'crates' }, count: { base: 0, stat: 'fill', perUnit: 0.05, max: 5 }, seed: 402, low: true },
  { id: 'storehouse-barrels', who: { def: ['storehouse'] }, anchor: 'eaves', piece: { kit: 'barrels' }, count: { base: 0, stat: 'fill', perUnit: 0.03, max: 3 }, seed: 403, low: true },
  { id: 'storehouse-sacks', who: { def: ['storehouse'] }, anchor: 'yard', piece: { kit: 'goods-sacks' }, count: { base: 0, stat: 'fill', perUnit: 0.04, max: 4 }, seed: 404, low: true },
];
