// Needs baskets (docs/spec/13-ledger.md, Market and prices; i2-wave-notes, Purchases). Each tier
// lists need groups with quantities per day and substitutable goods with preference weights.
// Households buy the good with the best price for how much they like it: Thrifty households care
// half as much which loaf it is, comfortable ones (savings in hand) a little more. The food group
// is bought on the residents' shopping outings (C3A) through `shopFood`; every other group at the
// 18:00 household pass, used up at supper. What a household could not get lowers that group's
// satisfaction (`household.basket`), and the `goods` need follows the basket's average.
// Demand for the price rule is what households want, not what they managed to buy: each day the
// household pass records every group's daily quantity, shared across its goods by preference
// weight, so an empty shelf still shows up as wanted (and its price climbs).
import { content, type NeedGroup, type NeedsBasket } from '@qoti/content';
import { PENNIES_PER_COIN, TICKS_PER_DAY } from '../../constants';
import type { EntityId, Household, Resident, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { calendar } from '../clock/calendar';
import { dailyOffset, dayIndex } from '../economy/time';
import { foodIndexes, pantryFood } from '../residents/needs';
import { announceHousehold } from '../residents/records';
import { marketOpen, outletFree, outletsWith, purchase, tillPrice } from './api';

/** NEED_IDS index of the `goods` need. */
export const GOODS_NEED = 5;
/** The food group's id: bought on outings, eaten at breakfast. */
export const FOOD_GROUP = 'food';
/** Savings per member, pennies, above which a household is comfortable and buys what it likes. */
export const COMFORTABLE_SAVINGS = 6 * PENNIES_PER_COIN;
/** Days a newly arrived household may eat on the slate while it finds its feet. */
export const SLATE_DAYS = 2;
/** 18:00, after wages at 17:00. */
export const BASKETS_OFFSET = dailyOffset(18);

export function basketOf(h: Household): NeedsBasket | undefined {
  return content.basketByTier.get(h.tier);
}

function isThrifty(state: WorldState, h: Household): boolean {
  for (const id of h.members) {
    const r = findById(state.residents, id);
    if (r && r.stage !== 'child' && r.traits.includes('thrifty')) return true;
  }
  return false;
}

/**
 * How much a household likes a good, in halves: Thrifty 1 + (w - 1) / 2, plain w, comfortable
 * 2w - 1 (a weight of 1 is 1 for everybody: bread is bread).
 */
export function likeHalves(weight: number, thrifty: boolean, comfortable: boolean): number {
  if (thrifty) return weight + 1;
  if (comfortable) return 4 * weight - 2;
  return 2 * weight;
}

/** Value for money: liking per penny, scaled to stay an integer. Higher is better. */
function valueOf(likes: number, price: number): number {
  return Math.floor((likes * 1_000_000) / Math.max(1, price));
}

interface Taste {
  thrifty: boolean;
  comfortable: boolean;
}

function tasteOf(state: WorldState, h: Household): Taste {
  return {
    thrifty: isThrifty(state, h),
    comfortable: h.savings >= COMFORTABLE_SAVINGS * Math.max(1, h.members.length),
  };
}

/** Keeps `basket` and `owed` the length of the household's basket (a new tier starts afresh). */
export function ensureBasket(h: Household): NeedsBasket | undefined {
  const b = basketOf(h);
  const n = b?.groups.length ?? 0;
  if (!h.basket || h.basket.length !== n) h.basket = new Array<number>(n).fill(100);
  if (!h.owed || h.owed.length !== n) h.owed = new Array<number>(n).fill(0);
  return b;
}

/** Moves a group's satisfaction halfway to `to`. */
function satisfy(h: Household, group: number, to: number): void {
  const s = h.basket![group] ?? 100;
  h.basket![group] = Math.round((s + to) / 2);
}

/** Average satisfaction over the basket's groups, 100 when it has none. */
export function basketScore(h: Household): number {
  const b = h.basket;
  if (!b || b.length === 0) return 100;
  let sum = 0;
  for (const s of b) sum += s;
  return Math.round(sum / b.length);
}

/**
 * A shopping outing at an outlet with the market open: the food the household likes best for the
 * price (a nudge toward what the pantry is short of, for variety), as much as it can pay for up
 * to `want`. A household that cannot pay for a single loaf and has too little for tomorrow's
 * breakfast takes it on the slate: the cheapest food, free, enough for breakfast, and the basket
 * remembers it. Returns the food carried home, or null.
 */
export function shopFood(
  state: WorldState,
  h: Household,
  outlet: EntityId,
  want: number,
): [good: number, qty: number] | null {
  if (want <= 0) return null;
  const basket = ensureBasket(h);
  const gi = basket?.groups.findIndex((g) => g.id === FOOD_GROUP) ?? -1;
  const group = gi >= 0 ? basket!.groups[gi] : undefined;
  const taste = tasteOf(state, h);
  let best = -1;
  let bestValue = -1;
  let cheapest = -1;
  let cheapestPrice = Infinity;
  for (const g of foodIndexes()) {
    if (outletFree(state, outlet, g) <= 0) continue;
    const price = tillPrice(state, g);
    if (price < cheapestPrice) {
      cheapestPrice = price;
      cheapest = g;
    }
    if (price > h.savings) continue;
    const id = content.goods[g]!.id;
    const weight = group?.goods.find(([x]) => x === id)?.[1] ?? 1;
    const likes = likeHalves(weight, taste.thrifty, taste.comfortable);
    // Variety: each unit already in the pantry makes another of it a little less tempting.
    const value = Math.floor((valueOf(likes, price) * 4) / (4 + (h.pantry[g] ?? 0)));
    if (value > bestValue) {
      bestValue = value;
      best = g;
    }
  }
  if (best >= 0) {
    const got = purchase(state, h, best, want, outlet);
    if (got > 0) {
      if (gi >= 0) satisfy(h, gi, 100);
      return [best, got];
    }
  }
  const short = Math.max(1, h.members.length) - pantryFood(h);
  if (cheapest < 0 || short <= 0 || !onTheSlate(state, h)) return null;
  // On the slate: nobody in the valley goes without breakfast for want of a coin.
  const n = Math.min(want, short, outletFree(state, outlet, cheapest));
  const rt = findById(state.buildings, outlet)?.rt;
  if (!rt || n <= 0) return null;
  rt.store[cheapest]! -= n;
  // Elders and children are the town's to look after; grown-ups without work feel it.
  if (gi >= 0 && canWork(state, h)) satisfy(h, gi, 0);
  return [cheapest, n];
}

/**
 * Who may eat on the slate: newcomers in their first SLATE_DAYS, and households with nobody in
 * work (elders, children, the jobless). A household with a wage coming in pays its way, so short
 * purses show up at the market (stock stays on the shelf, and the price eases) rather than vanish.
 */
export function onTheSlate(state: WorldState, h: Household): boolean {
  if (dayIndex(state.tick) - h.arrivedDay < SLATE_DAYS) return true;
  for (const id of h.members) if ((findById(state.residents, id)?.jobId ?? 0) !== 0) return false;
  return true;
}

/** True when someone in the household is of working age (young or adult). */
function canWork(state: WorldState, h: Household): boolean {
  for (const id of h.members) {
    const stage = findById(state.residents, id)?.stage;
    if (stage === 'young' || stage === 'adult') return true;
  }
  return false;
}

/** Units a group asks of a household per day, in hundredths. */
function perDayHundredths(g: NeedGroup, h: Household): number {
  return Math.round(g.perDay * 100) * (g.perHousehold ? 1 : Math.max(1, h.members.length));
}

/**
 * Buys up to `units` of a group's goods across outlets, best value first, falling back to the
 * next good when one runs out or costs more than the purse. Returns the units bought.
 */
function buyGroup(state: WorldState, h: Household, g: NeedGroup, units: number, taste: Taste): number {
  let left = units;
  const tried: number[] = [];
  while (left > 0) {
    let best = -1;
    let bestValue = -1;
    for (const [id, weight] of g.goods) {
      const gi = content.goodIndex.get(id);
      if (gi === undefined || tried.includes(gi)) continue;
      const price = tillPrice(state, gi);
      if (price > h.savings || outletsWith(state, gi).length === 0) continue;
      const value = valueOf(likeHalves(weight, taste.thrifty, taste.comfortable), price);
      if (value > bestValue) {
        bestValue = value;
        best = gi;
      }
    }
    if (best < 0) break;
    tried.push(best);
    const got = purchase(state, h, best, left);
    if (got > 0) {
      state.economy.today.consumed[best]! += got;
      state.economy.season.consumed[best]! += got;
      left -= got;
    }
  }
  return units - left;
}

/** Adds a group's day to the wanted tally, in hundredths of a unit per good, by weight. */
function want(g: NeedGroup, hundredths: number, tally: number[]): void {
  let total = 0;
  for (const [, w] of g.goods) total += w;
  if (total <= 0) return;
  for (const [id, w] of g.goods) {
    const gi = content.goodIndex.get(id);
    if (gi !== undefined) tally[gi]! += Math.floor((hundredths * w) / total);
  }
}

/**
 * A comfortable household treats itself at supper: up to one unit of its favorite food for each
 * member, while its purse stays above the comfortable mark. Purses that fill flow back
 * through the till instead of piling up, and the market hears what the well-off would like.
 */
function supperTreat(state: WorldState, h: Household, basket: NeedsBasket): void {
  const group = basket.groups.find((g) => g.id === FOOD_GROUP);
  if (!group) return;
  const reserve = COMFORTABLE_SAVINGS * Math.max(1, h.members.length);
  let left = h.members.length;
  while (left > 0) {
    let best = -1;
    let bestValue = -1;
    for (const [id, weight] of group.goods) {
      const gi = content.goodIndex.get(id);
      if (gi === undefined) continue;
      const price = tillPrice(state, gi);
      if (h.savings - price < reserve || outletsWith(state, gi).length === 0) continue;
      const value = valueOf(likeHalves(weight, false, true), price);
      if (value > bestValue) {
        bestValue = value;
        best = gi;
      }
    }
    if (best < 0 || purchase(state, h, best, 1) === 0) break;
    state.economy.today.consumed[best]! += 1;
    state.economy.season.consumed[best]! += 1;
    left--;
  }
}

/**
 * The household pass at 18:00: every group records what it asks for the day as demand; every
 * group but food (bought on outings) accrues it (fractions carry over) and buys the whole units it
 * owes; unmet units are let go, and the group's satisfaction moves halfway to the share it got.
 * The `goods` need of each member follows.
 */
export function shopBaskets(state: WorldState, ctx: TickCtx): void {
  const season = calendar(state.tick).season;
  const tally = new Array<number>(content.goods.length).fill(0);
  for (const h of state.households) {
    if (!h.homeId) continue;
    const basket = ensureBasket(h);
    if (!basket) continue;
    const taste = tasteOf(state, h);
    const before = h.savings;
    for (let i = 0; i < basket.groups.length; i++) {
      const g = basket.groups[i]!;
      if (g.season !== undefined && g.season !== season) continue;
      want(g, perDayHundredths(g, h), tally);
      if (g.id === FOOD_GROUP) continue;
      h.owed![i]! += perDayHundredths(g, h);
      const units = Math.floor(h.owed![i]! / 100);
      if (units <= 0) continue;
      const got = buyGroup(state, h, g, units, taste);
      h.owed![i]! -= units * 100;
      satisfy(h, i, Math.round((100 * got) / units));
    }
    if (taste.comfortable) supperTreat(state, h, basket);
    setGoodsNeed(state, h);
    if (h.savings !== before) announceHousehold(state, ctx, h.id);
  }
  const d = state.market.demandToday;
  for (let g = 0; g < tally.length; g++) d[g] = (d[g] ?? 0) + Math.round(tally[g]! / 100);
}

/** Every member's `goods` need: the basket's average, or 100 when the market is shut. */
export function setGoodsNeed(state: WorldState, h: Household): void {
  const score = marketOpen(state) ? basketScore(h) : 100;
  for (const id of h.members) {
    const r: Resident | undefined = findById(state.residents, id);
    if (r && r.needs.length > GOODS_NEED) r.needs[GOODS_NEED] = score;
  }
}

export const baskets: System = {
  id: 'baskets',
  order: 67,
  every: TICKS_PER_DAY,
  offset: BASKETS_OFFSET,
  tick(state, ctx) {
    if (marketOpen(state)) {
      shopBaskets(state, ctx);
      return;
    }
    // Before the market opens nothing is for sale, so nobody misses anything.
    if (state.settings.mode !== 'standard') return;
    for (const h of state.households) setGoodsNeed(state, h);
  },
};
