// The trade score (docs/spec/13-ledger.md, Choosing a trade): for a lot about to grow, each trade the
// valley's rank and innovations allow scores need x supply x site x keeper, and the best positive
// score grows. Integer throughout: need and supply in permille, site 0 or 1, keeper in percent, so
// a score runs 0 to 1,250 (docs/build/r1-wave-notes.md, Cross-track APIs: `tradeScore`).
//
// - need: how short its good is, the strongest of: its own shortage against three days of what the
//   town wants of it (while its makers fall behind); for a flavor households buy, days of the
//   family's cover under the carrier's reserve (while the family's makers fall behind its use); a
//   tier the valley has unlocked wanting more flavors of the family than are on offer, this one
//   missing (a new tier with no household yet counts one household in ten); what the carrier had to
//   bring in the last three days (a third of the use a day is full need). Design note (a): a made
//   good no business makes yet, while its raw good is made here, counts as FIRST_MAKER_NEED, so a
//   windmill in a grain town gets its first baker even when the town is well fed.
// - supply: 1 when each raw good it takes is made in the valley or two days of it are in store,
//   0.5 when the carrier would bring it (the rule of the family of the good the trade makes), else 0.
// - site: the lot meets the trade's wants (./site).
// - keeper: 1, or KEEPER_KEEN when a resident who keeps no business wants the trade (a fitting
//   trait, or a finished apprenticeship in it); that resident is named the keeper.
import { content, type TradeDef } from '@qoti/content';
import { GOOD_FAMILIES, TARGET_COVER } from '../../constants';
import type { EntityId, Lot, Resident, WorldState } from '../../contracts';
import { familyIndex, GOODS_BY_FAMILY, methodOf } from '../../state/zones';
import { rankAtLeast } from '../../state/village';
import { townStock } from '../../view/hamlet';
import { carrierBrought } from '../carrier/api';
import { familyUse, flavorsOnOffer } from '../market/balances';
import { isWorkingAge } from '../residents/places';
import { dayIndex } from '../residents/time';
import { shopNeed } from './outlets';
import { shortages, wants } from './recipes';
import { SiteCache, siteMeets } from './site';

/** Full need, in permille. */
export const NEED_FULL = 1000;
/** Design note (a): a made good nobody makes yet while its raw good is made here. */
export const FIRST_MAKER_NEED = 250;
/** A flavor an unlocked tier still lacks. */
export const VARIETY_NEED = 500;
/** Supply in permille: made here or in store; by carrier. */
export const SUPPLY_HERE = 1000;
export const SUPPLY_CARRIER = 500;
/** Keeper in percent: nobody keen; a keen resident. */
export const KEEPER_PLAIN = 100;
export const KEEPER_KEEN = 125;
/** Days of a raw good in store that count as supply. */
export const SUPPLY_STORE_DAYS = 2;
/** Working hours a day a workshop is reckoned at, for a day of its raw good. */
export const TRADE_DAY_HOURS = 8;
/** Days the carrier's purchases are read over. */
export const CARRIER_NEED_DAYS = 3;
/** A newly opened tier with no household yet counts one household in this many. */
export const NEW_TIER_SHARE = 10;
/** Below this many days of Food in hand, Farmland asks for land (Food's need reads at least this). */
export const FARM_FOOD_DAYS = 4;

/** Why a trade scored what it did, for the demand bars and R1F's advisors. */
export type NeedCode = 'short' | 'firstMaker' | 'variety' | 'imported' | 'cover' | 'custom';

export interface TradeTerms {
  /** Permille. */
  need: number;
  /** Permille. */
  supply: number;
  /** 0 or 1. */
  site: number;
  /** Percent. */
  keeper: number;
  /** need x supply x site x keeper, 0 to 1,250. */
  score: number;
  /** The strongest reason behind the need, or null when there is none. */
  code: NeedCode | null;
  /** The resident who would keep it (keeper above 100), else 0. */
  keeperId: EntityId;
}

/** What the town wants and has tonight, read once per pass. */
export interface TownNeeds {
  stock: number[];
  /** Units a day wanted per good (market demand or use, plus site needs). */
  want: number[];
  /** Shortage per good in hundredths of a day (recipes.shortages). */
  short: number[];
  /** Made yesterday, per good. */
  made: number[];
  /** Buildings (built or going up) whose method makes the good. */
  makers: number[];
  /** A built building's method makes the good. */
  madeHere: boolean[];
  /** Per family: units used a day (the tiers' wants), units in stock, made yesterday. */
  famUse: number[];
  famStock: number[];
  famMade: number[];
  /** Per family: flavors the valley's unlocked tiers want on offer, and how many are (read when asked). */
  variety: number[];
  onOffer: (family: number) => number;
  /** Units the carrier brought of each good over CARRIER_NEED_DAYS days. */
  brought: number[];
  /** The resident keen to keep each trade (lowest id), found when asked. */
  keen: KeenResidents;
  /** Shops: full need while households lack an outlet or outlets are crowded. */
  shopNeed: number;
  /** needOf by trade id, tonight (cleared when the makers change). */
  memo: Map<string, { need: number; code: NeedCode | null }>;
}

/** True for a good households buy (not Materials, not wool, which is only an input). */
export function isFlavor(g: number): boolean {
  const good = content.goods[g]!;
  return good.family !== 'materials' && !(good.family === 'wares' && good.raw);
}

/** Tiers the valley has unlocked: Settlers always, the rest once `hearth.unlocked` names them. */
function unlockedTiers(state: WorldState): string[] {
  return content.baskets
    .map((b) => b.tier)
    .filter((t) => t === 'settler' || state.hearth.unlocked.includes(t));
}

/**
 * Units a day the households want of a family, every unlocked tier counted: its households, or one
 * household in ten while it has none yet (docs/spec/13-ledger.md, Choosing a trade). The larger of
 * this and the balances' own reading (R1A's familyUse).
 */
function tierUse(state: WorldState, family: number): number {
  const fam = GOOD_FAMILIES[family]!;
  let use = 0;
  const households = state.households.length;
  for (const tier of unlockedTiers(state)) {
    const want = content.basketByTier.get(tier as never)?.wants.find((w) => w.family === fam);
    if (!want || want.amount <= 0 || want.season !== undefined) continue;
    let homes = 0;
    let folk = 0;
    for (const h of state.households) {
      if (h.tier !== tier) continue;
      homes++;
      folk += h.members.length;
    }
    if (homes === 0) {
      if (tier === 'settler') continue;
      homes = Math.ceil(households / NEW_TIER_SHARE);
      folk = Math.ceil(state.residents.length / NEW_TIER_SHARE);
    }
    use += want.amount * (want.perHousehold ? homes : folk);
  }
  return Math.max(Math.ceil(use), familyUse(state, family));
}

/** Flavors of a family the unlocked tiers want on offer (the most any of them asks). */
function varietyWanted(state: WorldState, family: number): number {
  const fam = GOOD_FAMILIES[family]!;
  let v = 0;
  for (const tier of unlockedTiers(state)) {
    const want = content.basketByTier.get(tier as never)?.wants.find((w) => w.family === fam);
    if (want && want.variety > v) v = want.variety;
  }
  return v;
}

/**
 * The keen residents, found when asked (a keen resident is usually among the first few dozen, so a
 * night that scores a few trades walks a few dozen residents, not the town): for each trade, the
 * lowest-id resident of working age who keeps no business yet and has a fitting trait (Sweet Tooth
 * bakes) or a finished apprenticeship in it.
 */
export class KeenResidents {
  private readonly found = new Map<string, EntityId>();
  private taken: Set<EntityId> | null = null;
  private learned: Resident[] | null = null;

  constructor(private readonly state: WorldState) {}

  /** The keen resident for the trade, if any. */
  get(trade: string): EntityId | undefined {
    let id = this.found.get(trade);
    if (id === undefined) {
      id = this.find(trade);
      this.found.set(trade, id);
    }
    return id || undefined;
  }

  has(trade: string): boolean {
    return this.get(trade) !== undefined;
  }

  /** The resident now keeps a business (named keeper of a new one): keen for nothing more tonight. */
  forget(resident: EntityId): void {
    this.taken ??= keepersTaken(this.state);
    this.taken.add(resident);
    for (const [trade, id] of [...this.found]) if (id === resident) this.found.delete(trade);
  }

  private find(trade: string): EntityId {
    const state = this.state;
    this.taken ??= keepersTaken(state);
    const traits = content.tradeById.get(trade)?.keepers ?? [];
    const today = dayIndex(state.tick);
    // Finished apprentices, once a night (few), in id order.
    this.learned ??= state.residents.filter((r) => !!r.apprentice && r.apprentice.untilDay <= today);
    let best = 0;
    for (const r of this.learned) {
      if (r.apprentice!.trade !== trade || !isWorkingAge(r) || this.taken.has(r.id)) continue;
      best = r.id;
      break;
    }
    if (traits.length === 0) return best;
    // Residents are in id order: the first keen one by trait, unless an apprentice came first.
    for (const r of state.residents) {
      if (best && r.id >= best) break;
      if (!isWorkingAge(r) || this.taken.has(r.id)) continue;
      if (traits.some((k) => r.traits.includes(k))) return r.id;
    }
    return best;
  }
}

/** Residents who already keep a business (or are named to keep one going up). */
export function keepersTaken(state: WorldState): Set<EntityId> {
  const out = new Set<EntityId>();
  for (const b of state.buildings) if (b.trade && b.keeperId) out.add(b.keeperId);
  return out;
}

/** Flavors on offer by family, read from the balances (R1A's flavorsOnOffer) once each, when asked. */
function lazyOnOffer(state: WorldState): (family: number) => number {
  const seen: (number | undefined)[] = [];
  return (f) => (seen[f] ??= flavorsOnOffer(state, f));
}

/** Makers per good (built or going up) and whether a built one makes it, written into `n`. */
export function countMakers(
  state: WorldState,
  n: Pick<TownNeeds, 'makers' | 'madeHere'> & { memo?: Map<string, unknown> },
): void {
  n.memo?.clear();
  n.makers.fill(0);
  n.madeHere.fill(false);
  for (const b of state.buildings) {
    const m = methodOf(b);
    if (!m) continue;
    for (const [id] of m.outputs) {
      const g = content.goodIndex.get(id);
      if (g === undefined) continue;
      n.makers[g]!++;
      if (b.stage === 'built') n.madeHere[g] = true;
    }
  }
}

/** Tonight's needs. `shopNeed` comes from the growth pass (outlets and households). */
export function townNeeds(state: WorldState, shopNeed = 0): TownNeeds {
  const n = content.goods.length;
  const stock = townStock(state);
  const want = wants(state).map((w) => Math.ceil(w));
  const makers = new Array<number>(n).fill(0);
  const madeHere = new Array<boolean>(n).fill(false);
  countMakers(state, { makers, madeHere });
  const made = state.economy.yesterday.produced.slice();
  const famUse = GOOD_FAMILIES.map((_, f) => tierUse(state, f));
  const famStock = GOOD_FAMILIES.map((_, f) => {
    let s = 0;
    for (const g of GOODS_BY_FAMILY[f]!) if (isFlavor(g)) s += stock[g] ?? 0;
    return s;
  });
  const famMade = GOOD_FAMILIES.map((_, f) => {
    let s = 0;
    for (const g of GOODS_BY_FAMILY[f]!) if (isFlavor(g)) s += made[g] ?? 0;
    return s;
  });
  const brought = new Array<number>(n);
  for (let g = 0; g < n; g++) brought[g] = carrierBrought(state, g, CARRIER_NEED_DAYS);
  return {
    stock,
    want,
    short: shortages(state, stock),
    made,
    makers,
    madeHere,
    famUse,
    famStock,
    famMade,
    variety: GOOD_FAMILIES.map((_, f) => varietyWanted(state, f)),
    onOffer: lazyOnOffer(state),
    brought,
    keen: new KeenResidents(state),
    shopNeed,
    memo: new Map(),
  };
}

/** The need term of a trade, in permille, with its strongest reason. */
export function needOf(
  state: WorldState,
  t: TradeDef,
  n: TownNeeds,
): { need: number; code: NeedCode | null } {
  if (!t.makes) return { need: n.shopNeed, code: n.shopNeed > 0 ? 'custom' : null };
  const g = content.goodIndex.get(t.makes);
  if (g === undefined) return { need: 0, code: null };
  const good = content.goods[g]!;
  const f = familyIndex(good.family);
  let need = 0;
  let code: NeedCode | null = null;
  const raise = (v: number, c: NeedCode): void => {
    if (v > need) {
      need = Math.min(NEED_FULL, v);
      code = c;
    }
  };
  // Its own shortage, while its makers fall behind what the town wants.
  if (n.short[g]! > 0 && n.made[g]! < n.want[g]!) {
    raise(Math.floor((n.short[g]! * NEED_FULL) / (TARGET_COVER * 100)), 'short');
  }
  if (isFlavor(g)) {
    // The family's days of cover under the carrier's reserve, while its makers fall behind its use.
    const use = n.famUse[f]!;
    const held = state.carrier.families[f]?.reserve ?? 0;
    // Food reads at least the Farmland bar's days, so the bar never asks for land nothing would take.
    const reserve = good.family === 'food' ? Math.max(held, FARM_FOOD_DAYS) : held;
    if (use > 0 && reserve > 0 && good.family !== 'fuel' && n.famMade[f]! < use) {
      const cover = Math.floor((n.famStock[f]! * 100) / use);
      if (cover < reserve * 100)
        raise(Math.floor(((reserve * 100 - cover) * NEED_FULL) / (reserve * 100)), 'cover');
    }
    // A flavor an unlocked tier still lacks (read only when it could raise the need).
    if (need < VARIETY_NEED && n.stock[g] === 0 && n.variety[f]! > 0 && n.onOffer(f) < n.variety[f]!) {
      raise(VARIETY_NEED, 'variety');
    }
  }
  // What the carrier had to bring: a third of the use a day is full need.
  if (n.brought[g]! > 0) {
    const ref = Math.max(1, isFlavor(g) ? Math.max(n.want[g]!, Math.ceil(n.famUse[f]! / 3)) : n.want[g]!);
    raise(Math.floor((n.brought[g]! * NEED_FULL) / (CARRIER_NEED_DAYS * ref)), 'imported');
  }
  // Design note (a): the first maker of a made good whose raw good is made here.
  if (need < FIRST_MAKER_NEED && !good.raw && n.makers[g] === 0) {
    if (t.from.some((id) => n.madeHere[content.goodIndex.get(id) ?? -1]))
      raise(FIRST_MAKER_NEED, 'firstMaker');
  }
  return { need, code };
}

/** A day of a raw good at a workshop of the trade (level 1, TRADE_DAY_HOURS of work). */
function dayOf(t: TradeDef, id: string): number {
  const m = t.method;
  if (!m) return 0;
  const qty = m.inputs.find(([g]) => g === id)?.[1] ?? 0;
  return qty * Math.ceil(TRADE_DAY_HOURS / Math.max(1, m.hours));
}

/** The supply term, in permille. */
export function supplyOf(state: WorldState, t: TradeDef, n: TownNeeds): number {
  let supply = SUPPLY_HERE;
  for (const id of t.from) {
    const g = content.goodIndex.get(id);
    if (g === undefined) return 0;
    if (n.madeHere[g] || n.stock[g]! >= SUPPLY_STORE_DAYS * Math.max(1, dayOf(t, id), n.want[g]!)) continue;
    // The rule that counts is the one for the family of the good the trade makes.
    const makes = t.makes ? content.goodById.get(t.makes) : undefined;
    const rule = makes ? state.carrier.families[familyIndex(makes.family)]?.rule : 'never';
    if (rule === 'never') return 0;
    supply = Math.min(supply, SUPPLY_CARRIER);
  }
  return supply;
}

/** The four terms and the score of a trade on a lot. `self` is the business standing on it, if any. */
export function tradeTerms(
  state: WorldState,
  lot: Lot,
  t: TradeDef,
  n: TownNeeds,
  cache: SiteCache,
  self: EntityId = 0,
): TradeTerms {
  const { need, code } = needOf(state, t, n);
  const supply = supplyOf(state, t, n);
  const keeperId = n.keen.get(t.id) ?? 0;
  const keeper = keeperId ? KEEPER_KEEN : KEEPER_PLAIN;
  const base = Math.floor((need * supply) / NEED_FULL);
  // The site is the dearest term to read, so it is read only when it could matter.
  const site = base > 0 && siteMeets(cache, lot, t, self) ? 1 : 0;
  return { need, supply, site, keeper, score: Math.floor((base * site * keeper) / 100), code, keeperId };
}

/**
 * A trade's score for a lot about to grow: need x supply x site x keeper (0 to 1,250). The
 * cross-track API (R1F's advisors may ask why a lot grew what it did); reads the town afresh.
 */
export function tradeScore(state: WorldState, lot: Lot, trade: TradeDef): number {
  const shops = rankAtLeast(state, 'village') ? shopNeed(state) : 0;
  return tradeTerms(state, lot, trade, townNeeds(state, shops), new SiteCache(state)).score;
}
