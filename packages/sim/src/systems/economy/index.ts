// The books (docs/spec/13-ledger.md, Budget). At 00:00 the day rolls over (stock history, the
// season at its end), residents pay their taxes and buildings their upkeep; at 10:00 the peddler
// buys what the Ledger marked for sale. While the treasury is below zero the valley is in lean
// times: no new construction, unpaid upkeep wears buildings down, residents feel it. Never a game
// over: taxes keep coming, and the next day in the black ends it.
import { content } from '@qoti/content';
import { DAYS_PER_SEASON, LEDGER_CATEGORIES, MAP_SIZE, TICKS_PER_HOUR } from '../../constants';
import type { LedgerPeriod, System, TickCtx, WorldState } from '../../contracts';
import { emptyPeriod, goodsArray, isStandard } from '../../state/hamlet';
import { townStock } from '../../view/hamlet';
import { defOf, isStorehouse } from '../logistics/stores';
import { addMoodModifier, moodTaxPercent, removeMoodModifier } from '../residents/api';
import { overdraftLimit, isLean } from '../loans/credit';
import { marketOpen } from '../market/api';
import { tradingPost } from '../trade/post';
import { book } from './api';
import { pay } from './money';
import { economyDial, upkeepPennies } from './dial';
import { emitChangedBuildings, emitMoney, emitReports } from './emit';
import { dayIndex, tickOfDay } from './time';

export const PEDDLER_HOUR = 10;
export const PEDDLER_UNITS = 40;
/** Percent of the base price the peddler pays. */
export const PEDDLER_PERCENT = 60;
export const LEAN_MOOD = -5;
export const LEAN_MODIFIER = 'lean-times';
/** Days of stock history kept for the sparklines. */
export const STOCK_HISTORY_DAYS = 14;

const BUILDINGS_OFFSET = 40;
const LEAN_OFFSET = 60;
const REPORTS_OFFSET = 180;

export const economy: System = {
  id: 'economy',
  order: 60,
  every: 1,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const tod = tickOfDay(state.tick);
    if (tod === 0) midnight(state, ctx);
    if (tod === PEDDLER_HOUR * TICKS_PER_HOUR) peddler(state, ctx);
    if (state.economy.leanTimes !== isLean(state)) setLean(state, ctx);
    const minute = tod % TICKS_PER_HOUR;
    if (minute === LEAN_OFFSET && state.economy.leanTimes) leanForNewcomers(state);
    if (minute === BUILDINGS_OFFSET) emitChangedBuildings(state, ctx);
    if (minute === REPORTS_OFFSET) emitReports(state, ctx, false);
  },
};

function midnight(state: WorldState, ctx: TickCtx): void {
  const e = state.economy;
  e.stockHistory.push(townStock(state));
  if (e.stockHistory.length > STOCK_HISTORY_DAYS) e.stockHistory.shift();
  e.yesterday = e.today;
  e.today = emptyPeriod();
  for (const b of state.buildings) b.rt?.producedToday.fill(0);
  if (dayIndex(state.tick) % DAYS_PER_SEASON === 0) {
    if (income(e.season) > expenses(e.season)) e.seasonsInSurplus += 1;
    e.lastSeason = e.season;
    e.season = emptyPeriod();
  }

  // I1's flat tax, until the market opens at Village rank: then income tax on wages (C4A, at
  // 17:00 with the wages) takes its place.
  if (!marketOpen(state)) {
    let taxes = 0;
    for (const r of state.residents) taxes += moodTaxPercent(state, r.id);
    book(state, 'taxes', taxes);
  }

  // Upkeep is paid while the treasury is in the black, or within the County Bank's credit line
  // from Village rank (it may tip it past); in lean times it goes unpaid and the buildings wear.
  const paying = e.treasury >= -overdraftLimit(state);
  const decay = economyDial(state.settings.economy).leanDecay;
  let upkeep = 0;
  for (const b of state.buildings) {
    const def = defOf(b);
    if (b.stage !== 'built' || !b.rt || !def?.upkeep) continue;
    if (paying) upkeep += upkeepPennies(state, def.upkeep);
    else b.rt.condition = Math.max(0, b.rt.condition - decay);
  }
  payUpkeep(state, upkeep);
  if (e.leanTimes !== isLean(state)) setLean(state, ctx);
  emitReports(state, ctx, true);
}

/**
 * Upkeep leaves the valley in a Hamlet (I1). Once the market opens at Village rank (C4X) it stays
 * home: the village pays its own folk to mend roofs, sweep the wells and grease the mill, shared
 * evenly between households, so the coins come back through the shops and the income tax instead of
 * draining a Village that has no flat tax left to refill it.
 */
function payUpkeep(state: WorldState, upkeep: number): void {
  const n = state.households.length;
  if (upkeep <= 0) return;
  if (!marketOpen(state) || n === 0) {
    book(state, 'upkeep', upkeep);
    return;
  }
  const share = Math.floor(upkeep / n);
  let rest = upkeep - share * n;
  for (const h of state.households) {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    pay(state, 'treasury', { household: h.id }, share + extra, 'upkeep');
  }
}

export function income(p: LedgerPeriod): number {
  let n = 0;
  for (let i = 0; i < LEDGER_CATEGORIES.length; i++)
    if (LEDGER_CATEGORIES[i]!.kind === 'income') n += p.money[i]!;
  return n;
}

export function expenses(p: LedgerPeriod): number {
  let n = 0;
  for (let i = 0; i < LEDGER_CATEGORIES.length; i++)
    if (LEDGER_CATEGORIES[i]!.kind === 'expense') n += p.money[i]!;
  return n;
}

function setLean(state: WorldState, ctx: TickCtx): void {
  const lean = isLean(state);
  state.economy.leanTimes = lean;
  const credit = overdraftLimit(state) > 0;
  for (const r of state.residents) {
    if (lean) addMoodModifier(state, r.id, { kind: LEAN_MODIFIER, value: LEAN_MOOD, ticks: 0 });
    else removeMoodModifier(state, r.id, LEAN_MODIFIER);
  }
  ctx.events.push({
    e: 'notify',
    kind: lean ? 'lean-times' : 'lean-times-over',
    text: lean
      ? credit
        ? "Lean times: the treasury has run past the County Bank's credit line. New building waits, upkeep goes unpaid, wages come out of what the till takes in, and supper is a little quieter. Trade, a loan or a firmer tax will turn it round."
        : 'Lean times: the treasury is below zero. New building waits, upkeep goes unpaid, and supper is a little quieter.'
      : credit
        ? "The treasury is back within the County Bank's good graces. Lean times are over, and the builders have found their good hammers."
        : 'The treasury is back above zero. Lean times are over, and the builders have found their good hammers.',
  });
  emitMoney(state, ctx);
}

/** Residents who arrived during lean times feel them too. */
function leanForNewcomers(state: WorldState): void {
  for (const r of state.residents) {
    if (!r.modifiers.some((m) => m.kind === LEAN_MODIFIER)) {
      addMoodModifier(state, r.id, { kind: LEAN_MODIFIER, value: LEAN_MOOD, ticks: 0 });
    }
  }
}

/** Pennies the peddler pays for one unit of a good. */
export function peddlerPrice(good: number): number {
  return Math.floor(((content.goods[good]?.basePrice ?? 0) * PEDDLER_PERCENT) / 100);
}

/**
 * The peddler buys up to PEDDLER_UNITS units of goods marked for sale from the storehouses, one
 * unit at a time from whichever marked good the valley holds most of, so a sale spreads over
 * what is plentiful. Goods promised to porters stay.
 */
function peddler(state: WorldState, ctx: TickCtx): void {
  const e = state.economy;
  // I2 (C4A): a valley with a Trading Post trades through its caravans; the peddler retires.
  if (tradingPost(state)) return;
  const houses = state.buildings.filter((b) => b.stage === 'built' && b.rt && isStorehouse(defOf(b)));
  if (houses.length === 0 || !e.forSale.some(Boolean)) return;
  const sold = goodsArray();
  let units = 0;
  while (units < PEDDLER_UNITS) {
    let good = -1;
    let most = 0;
    for (let g = 0; g < e.forSale.length; g++) {
      if (!e.forSale[g]) continue;
      let have = 0;
      for (const h of houses) have += h.rt!.store[g]! - h.rt!.reservedOut[g]!;
      if (have > most) {
        most = have;
        good = g;
      }
    }
    if (good < 0) break;
    let from = houses[0]!;
    for (const h of houses) {
      if (h.rt!.store[good]! - h.rt!.reservedOut[good]! > from.rt!.store[good]! - from.rt!.reservedOut[good]!)
        from = h;
    }
    from.rt!.store[good]! -= 1;
    sold[good]! += 1;
    units++;
  }
  if (units === 0) return;
  let pennies = 0;
  const parts: string[] = [];
  for (let g = 0; g < sold.length; g++) {
    if (!sold[g]) continue;
    pennies += sold[g]! * peddlerPrice(g);
    parts.push(`${sold[g]} ${content.goods[g]!.name.toLowerCase()}`);
  }
  book(state, 'peddler', pennies);
  const [gx, gz] = state.meta.valleyGate;
  ctx.events.push({
    e: 'notify',
    kind: 'peddler',
    text: `The peddler's cart rattled off with ${listText(parts)}, leaving ${coinsText(pennies)} behind.`,
    at: [Math.min(MAP_SIZE - 1, gx), Math.min(MAP_SIZE - 1, gz)],
  });
  emitMoney(state, ctx);
}

function listText(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** "12 coins", "7.20 coins". */
export function coinsText(pennies: number): string {
  const whole = Math.floor(pennies / 100);
  const rest = pennies % 100;
  const n = rest === 0 ? `${whole}` : `${whole}.${rest < 10 ? '0' : ''}${rest}`;
  return `${n} ${n === '1' ? 'coin' : 'coins'}`;
}
