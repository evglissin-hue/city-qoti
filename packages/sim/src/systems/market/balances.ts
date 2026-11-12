// The five balances (docs/spec/13-ledger.md, Households: amount and variety, rule 4; R1A owns it).
// The cross-track API (docs/build/r1-wave-notes.md): R1B's need term, R1D's counts (Porridge No More,
// the Village's food goal) and R1F's audit read familyCover and flavorsOnOffer; the carrier, the
// tiers and the Balances view read the rest. Kept cheap: one pass over buildings or households.
//
// - Use, a day, in hundredths of a unit (familyUseHundredths): Food, Wares and Treats are what every
//   household's basket wants (a resident's amount times its members, or a household's), plus, for
//   each tier the valley has unlocked that no household has reached yet, one household in ten as if
//   it had (so the carrier's one-day reserve of Treats is never a reserve of nothing). Fuel is one
//   firewood a household in every season, so the balance reads the same in June as in January, or
//   yesterday's firewood burned if more (the Brickworks' kiln). Materials are what open sites still
//   need, or yesterday's use if more.
// - Stock: everything in store, on shelves and in output buffers (townStock), plus Food and Fuel in
//   the pantries: the winter reserve counts them wherever they lie.
// - Variety: a household sees a flavor on a day when it is on a shelf in reach of its home (a stall,
//   square or shop whose food coverage reaches the door, or any of the town's stores, which stay
//   open to all) or in its pantry; `Household.seen` keeps the last day it saw each good, and the
//   family's flavors on offer are those seen in the last VARIETY_DAYS days. Wool is only an input
//   and never counts. markSeen runs at the 18:00 household pass.
import { content } from '@qoti/content';
import { GOOD_FAMILIES, MAP_SIZE, TIERS } from '../../constants';
import type { Household, TierId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { GOODS_BY_FAMILY } from '../../state/zones';
import { townStock } from '../../view/hamlet';
import { dayIndex } from '../economy/time';
import { doorTile } from '../movement/api';

/** Days a flavor stays on offer to a household after it last saw it (today and the two before). */
export const VARIETY_DAYS = 3;
/** A newly opened tier with no household yet counts one household in this many as if it had. */
export const NEW_TIER_SHARE = 10;
/** Goods only ever an input, never on a shelf (wool is the weaver's). */
export const INPUT_ONLY: ReadonlySet<string> = new Set(['wool']);

const FOOD = 0;
const FUEL = 1;
const MATERIALS = 2;

/** Good indexes of a family that a household can buy (every one but an input-only good). */
export const SHELF_GOODS: readonly (readonly number[])[] = GOOD_FAMILIES.map((_, f) =>
  GOODS_BY_FAMILY[f]!.filter((g) => !INPUT_ONLY.has(content.goods[g]!.id)),
);

/** The tiers whose baskets the town buys: those its households hold, then the unlocked ones none has. */
export function tierCounts(state: WorldState): number[] {
  const n = TIERS.map(() => 0);
  for (const h of state.households) n[Math.max(0, TIERS.indexOf(h.tier))]! += 1;
  return n;
}

/** True when the valley has opened the tier (Settlers always; the Village Charter opens Craftsfolk). */
export function tierOpen(state: WorldState, tier: TierId): boolean {
  return tier === 'settler' || (content.basketByTier.has(tier) && state.hearth.unlocked.includes(tier));
}

/** Units a day the town uses of a family (GOOD_FAMILIES index), in hundredths. See the header. */
export function familyUseHundredths(state: WorldState, family: number): number {
  return familyUses(state)[family]!;
}

/** The goods a pantry keeps that count toward the balances: Food and Fuel. */
export const LARDER_GOODS: readonly number[] = [...GOODS_BY_FAMILY[FOOD]!, ...GOODS_BY_FAMILY[FUEL]!];

/** A tier's index in TIERS. */
const TIER_INDEX: ReadonlyMap<string, number> = new Map(TIERS.map((t, i) => [t, i]));

/** Each tier's wants as [family index, hundredths a day, per household], in TIERS order. */
const WANTS: readonly (readonly [number, number, boolean][])[] = TIERS.map((tier) =>
  (content.basketByTier.get(tier)?.wants ?? []).map((w): [number, number, boolean] => [
    GOOD_FAMILIES.indexOf(w.family),
    Math.round(w.amount * 100),
    !!w.perHousehold,
  ]),
);

/**
 * Every family's use a day in hundredths, in GOOD_FAMILIES order, in one pass over the households.
 * With `larder`, it also adds each pantry's Food and Fuel into it, by good (the carrier's count).
 */
export function familyUses(state: WorldState, siteTotal?: number, larder?: number[]): number[] {
  const out = GOOD_FAMILIES.map(() => 0);
  const counts = TIERS.map(() => 0);
  const residents = state.residents.length;
  const households = state.households.length;
  // Indexed loops: this runs once a day per caller and seldom gets past the interpreter.
  const hs = state.households;
  const lg = LARDER_GOODS;
  const nl = lg.length;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i]!;
    const t = h.tier === 'settler' ? 0 : (TIER_INDEX.get(h.tier) ?? 0);
    counts[t]! += 1;
    // The carrier's pantry count rides the same pass (Food and Fuel in every pantry, by good).
    if (larder) {
      const p = h.pantry;
      for (let k = 0; k < nl; k++) {
        const g = lg[k]!;
        larder[g]! += p[g] ?? 0;
      }
    }
    const members = Math.max(1, h.members.length);
    const wants = WANTS[t]!;
    for (let k = 0; k < wants.length; k++) {
      const w = wants[k]!;
      out[w[0]]! += w[1] * (w[2] ? 1 : members);
    }
  }
  // A newly opened tier: one household in ten (rounded up) as if it had arrived. Fuel's want is a
  // winter one and the balance reads a firewood a household all year, so it is set below instead.
  for (let t = 1; t < TIERS.length; t++) {
    const tier = TIERS[t]!;
    if (counts[t]! > 0 || !tierOpen(state, tier) || households === 0) continue;
    for (const w of content.basketByTier.get(tier)?.wants ?? []) {
      const share = w.perHousehold
        ? Math.ceil(households / NEW_TIER_SHARE)
        : Math.ceil(residents / NEW_TIER_SHARE);
      out[GOOD_FAMILIES.indexOf(w.family)]! += Math.round(w.amount * 100) * share;
    }
  }
  const y = state.economy.yesterday.consumed;
  out[FUEL] = Math.max(households * 100, (y[GOODS_BY_FAMILY[FUEL]![0]!] ?? 0) * 100);
  // Materials: what open sites still need (the carrier passes it from its own pass).
  let sites = siteTotal ?? 0;
  if (siteTotal === undefined) {
    for (const b of state.buildings) for (const x of b.rt?.construction?.needs ?? []) sites += x;
  }
  let used = 0;
  for (const g of GOODS_BY_FAMILY[MATERIALS]!) used += y[g] ?? 0;
  out[MATERIALS] = Math.max(sites, used) * 100;
  return out;
}

/** Units a day the town uses of a family, rounded up. */
export function familyUse(state: WorldState, family: number): number {
  return Math.ceil(familyUseHundredths(state, family) / 100);
}

/** The town's stock by good: townStock, plus Food and Fuel in the pantries. */
export function balanceStock(state: WorldState): number[] {
  const stock = townStock(state);
  const pantry = [...GOODS_BY_FAMILY[FOOD]!, ...GOODS_BY_FAMILY[FUEL]!];
  for (const h of state.households) for (const g of pantry) stock[g]! += h.pantry[g] ?? 0;
  return stock;
}

/** Units of a family in a stock array (its shelf goods: wool, only an input, is not Wares in hand). */
export function familyStock(stock: readonly number[], family: number): number {
  let n = 0;
  for (const g of SHELF_GOODS[family]!) n += stock[g] ?? 0;
  return n;
}

/** Days of cover of a family, in hundredths (0 when the town uses none). */
export function familyCover(
  state: WorldState,
  family: number,
  stock?: readonly number[],
  useHundredths?: number,
): number {
  const use = useHundredths ?? familyUseHundredths(state, family);
  if (use <= 0) return 0;
  const have = familyStock(stock ?? balanceStock(state), family);
  return Math.floor((have * 10000) / use);
}

// --- Variety -----------------------------------------------------------------------------------

/** Free units on an outlet's shelf (stock not promised to porters). */
function shelfFree(rt: { store: number[]; reservedOut: number[] }, g: number): boolean {
  return (rt.store[g] ?? 0) - (rt.reservedOut[g] ?? 0) > 0;
}

/**
 * The day's sighting: every household with a home marks today against each good on a shelf in
 * reach of its door or in its pantry. Runs at the 18:00 household pass, in any standard valley.
 */
export function markSeen(state: WorldState): void {
  const n = content.goods.length;
  const today = dayIndex(state.tick);
  // Stores are open to all: one union. Stalls, squares and shops by their food coverage.
  const open = new Array<boolean>(n).fill(false);
  const stalls: { x: number; z: number; r2: number; goods: boolean[] }[] = [];
  for (const b of state.buildings) {
    const rt = b.rt;
    if (b.stage !== 'built' || !rt) continue;
    const def = content.buildingById.get(b.def);
    if (!def?.tags?.includes('outlet')) continue;
    if (def.tags.includes('market')) {
      const goods = new Array<boolean>(n).fill(false);
      let any = false;
      for (let g = 0; g < n; g++) if (shelfFree(rt, g)) any = goods[g] = true;
      if (!any) continue;
      const door = doorTile(b, def);
      const r = def.coverage?.find((c) => c.kind === 'food')?.radius ?? 14;
      stalls.push({ x: door % MAP_SIZE, z: Math.floor(door / MAP_SIZE), r2: r * r, goods });
    } else {
      for (let g = 0; g < n; g++) if (!open[g] && shelfFree(rt, g)) open[g] = true;
    }
  }
  for (const h of state.households) {
    if (!h.homeId) continue;
    const home = findById(state.buildings, h.homeId);
    if (!home) continue;
    if (!h.seen || h.seen.length !== n) h.seen = new Array<number>(n).fill(-1);
    const seen = h.seen;
    for (let g = 0; g < n; g++) if (open[g] || (h.pantry[g] ?? 0) > 0) seen[g] = today;
    if (stalls.length === 0) continue;
    const door = doorTile(home);
    const x = door % MAP_SIZE;
    const z = Math.floor(door / MAP_SIZE);
    for (const s of stalls) {
      const dx = s.x - x;
      const dz = s.z - z;
      if (dx * dx + dz * dz > s.r2) continue;
      for (let g = 0; g < n; g++) if (s.goods[g]) seen[g] = today;
    }
  }
}

/** True when the household saw the good (by index) in the last VARIETY_DAYS days. */
export function seenLately(state: WorldState, h: Household, good: number): boolean {
  const d = h.seen?.[good] ?? -1;
  return d >= 0 && dayIndex(state.tick) - d < VARIETY_DAYS;
}

/** A household's variety: the family's flavors it could buy in the last three days. */
export function householdVariety(state: WorldState, h: Household, family: number): number {
  let n = 0;
  for (const g of SHELF_GOODS[family]!) if (seenLately(state, h, g)) n++;
  return n;
}

/** By good index: on a shelf in reach of some home, or in a pantry, in the last three days. */
export function onOfferGoods(state: WorldState): boolean[] {
  const n = content.goods.length;
  const latest = new Array<number>(n).fill(-1);
  for (const h of state.households) {
    const seen = h.seen;
    if (!seen) continue;
    for (let g = 0; g < n; g++) if ((seen[g] ?? -1) > latest[g]!) latest[g] = seen[g]!;
  }
  const today = dayIndex(state.tick);
  return latest.map((d, g) => d >= 0 && today - d < VARIETY_DAYS && !INPUT_ONLY.has(content.goods[g]!.id));
}

/**
 * Flavors of a family on offer: goods on a shelf in reach of some home, or in a pantry, over the
 * last three days (wool, only an input, never counts).
 */
export function flavorsOnOffer(state: WorldState, family: number, offered?: readonly boolean[]): number {
  const on = offered ?? onOfferGoods(state);
  let n = 0;
  for (const g of SHELF_GOODS[family]!) if (on[g]) n++;
  return n;
}

/**
 * The most flavors of a family any tier in town wants: the tiers its households hold, and every
 * tier the valley has opened (a newly opened tier is wanted before anyone qualifies for it); for
 * Food, also what the Charter being worked toward asks.
 */
export function wantedVariety(
  state: WorldState,
  family: number,
  counts: readonly number[] = tierCounts(state),
): number {
  const id = GOOD_FAMILIES[family]!;
  let most = 0;
  // The Charter being worked toward may ask for Food flavors (the Village's "5 days of Food with 3
  // flavors"): a Hamlet wants them before any tier does, so the carrier can help it get there.
  if (family === FOOD) {
    for (const g of content.charterById.get(state.charter.charter)?.goals ?? []) {
      if ((g.measure.flavors ?? 0) > most) most = g.measure.flavors!;
    }
  }
  for (let t = 0; t < TIERS.length; t++) {
    const tier = TIERS[t]!;
    if (counts[t]! === 0 && !tierOpen(state, tier)) continue;
    const v = content.basketByTier.get(tier)?.wants.find((w) => w.family === id)?.variety ?? 0;
    if (v > most) most = v;
  }
  return most;
}
