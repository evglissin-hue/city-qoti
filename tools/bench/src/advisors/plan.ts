// The plan advisor (R1F): the Ledger's season card (docs/spec/13-ledger.md, The season plan). On the
// first morning of each season it answers the card's questions in one `season.setPlan`, and only
// when an answer changes:
// - The winter reserve, each summer and autumn: the default 8 days, or 10 days of Food while the
//   carrier brings more than a third of what the town eats (the pass closes in winter, so a town
//   living on imports puts more by).
// - This season's deal, when one pays: a neighbor's terms for the family the carrier buys (or sells)
//   most of, valued against the carrier's own terms.
// - Where to build first: Farmland while the larder is short of a winter, else the zone of the
//   fullest lit demand bar, else nowhere in particular.
// It also keeps the seasons advisor's duties (C5A, which it replaces): new buildings keep off the
// floodplain while a flood is forecast, the festival menu leaves the winter's food alone from late
// spring, and `larderShort` tells the land advisor to put up a fishery before the frost.
import {
  calendar,
  CARRIER_DAYS,
  DAYS_PER_SEASON,
  familyIndex,
  larder,
  meetsRequires,
  rankAtLeast,
  TICKS_PER_DAY,
  type DealOffer,
  type SeasonPlanInput,
  type WorldState,
} from '@qoti/sim';
import { content } from '@qoti/content';
import { importPrice, type Planner } from '../planner';
import { count, FOODS } from '../town';
import { BAR_ZONES } from '../village';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Days of food a resident the menu leaves, and wanted in the larder, before winter. */
export const WINTER_FOOD_DAYS = 8;
/** Days of Food the carrier's reserve is set to, once, at Village rank (the default is three). */
const HELD_FOOD_DAYS = 6;
/** Coins in the treasury a town wants before it sets it. */
const PUT_BY_COINS = 250;
/** The Food mark a town that lives on imports sets (the default reserve is 8). */
export const IMPORTED_FOOD_MARK = 10;

/** True from a flood's forecast until it ends. */
export function floodInSight(w: WorldState): boolean {
  return w.weather.events.some((e) => e.event === 'flood' && e.forecastTick <= w.tick && e.end > w.tick);
}

/** Units of a family the carrier bought (or sold) a day over its window. */
function carried(w: WorldState, family: string, side: 'buy' | 'sell'): number {
  const days = side === 'buy' ? w.carrier.bought : w.carrier.sold;
  let n = 0;
  for (const day of days) day.forEach((q, g) => (content.goods[g]?.family === family ? (n += q) : 0));
  return n / Math.max(1, Math.min(CARRIER_DAYS, days.length));
}

/**
 * What a deal saves a day, in percent-units: the units the carrier moves of its family times how much
 * better its terms are than the carrier's own (it buys at 140%, or 120% with a Trading Post, and
 * sells at 60%, or 85%).
 */
export function dealValue(w: WorldState, o: DealOffer): number {
  const post = count(w, 'trading-post', true) > 0;
  if (o.side === 'buy') return carried(w, o.family, 'buy') * ((post ? 120 : 140) - o.percent);
  return carried(w, o.family, 'sell') * (o.percent - (post ? 85 : 60));
}

class Plan implements Advisor {
  /** The food reserve before winter raised it, restored in spring. */
  private base: number | null = null;
  /** The season (counted from the first) whose card was last answered. */
  private answered = -1;

  constructor(readonly p: Planner) {}

  visit(v: Visit): void {
    if (v.afternoon) return;
    const p = this.p;
    const w = p.w;
    const { season, day } = calendar(w.tick);
    p.keepOffFloodplain = floodInSight(w);
    this.menu(season, day);
    const s = Math.floor(w.tick / TICKS_PER_DAY / DAYS_PER_SEASON);
    if (s === this.answered || w.settings.mode !== 'standard') return;
    this.answered = s;
    const plan = w.seasonPlan;
    const answer: SeasonPlanInput = {};
    // The winter reserve, from summer to the first frost.
    if (season === 1 || season === 2) {
      const eaten = FOODS.reduce((n, g) => n + (w.economy.yesterday.consumed[g] ?? 0), 0);
      const food = carried(w, 'food', 'buy') * 3 > eaten && eaten > 0 ? IMPORTED_FOOD_MARK : null;
      if (food !== plan.food) answer.food = food;
    }
    // This season's deal, when one pays.
    let best: DealOffer | null = null;
    for (const o of w.carrier.offers)
      if (
        familyIndex(o.family) >= 0 &&
        dealValue(w, o) > 0 &&
        (!best || dealValue(w, o) > dealValue(w, best))
      )
        best = o;
    const current = w.carrier.offers.some((o) => o.id === plan.deal) ? plan.deal : null;
    if ((best?.id ?? null) !== current) answer.deal = best?.id ?? null;
    // Where to build first.
    let first: string | null = p.larderShort ? 'farms' : null;
    let bar = 0;
    BAR_ZONES.forEach((zone, i) => {
      if (first === 'farms' || !w.demand.lit[i] || w.demand.bars[i]! <= bar) return;
      if (!meetsRequires(w, content.zoneById.get(zone)?.requires)) return;
      bar = w.demand.bars[i]!;
      first = zone;
    });
    // A card left on its last zone when nothing is lit is no chore sent (seven answers in seventy days, not nine).
    if (first !== null && first !== plan.buildFirst) answer.buildFirst = first;
    if (Object.keys(answer).length > 0)
      p.do('answer the season card', [{ t: 'season.setPlan', plan: answer }]);
  }

  /** The winter's larder: kept from the festival menu from late spring, and `larderShort` before the frost. */
  private menu(season: number, day: number): void {
    const p = this.p;
    const w = p.w;
    const putBy = season >= 1 || day >= 4;
    if (putBy) {
      this.base ??= p.foodReserveDays;
      p.foodReserveDays = Math.max(this.base, WINTER_FOOD_DAYS);
    } else if (this.base !== null) {
      p.foodReserveDays = this.base;
      this.base = null;
    }
    // The carrier's own Food reserve is set once, as a player sets it (the Ledger's lever): the cart
    // then buys toward it all year, and Farmland reads it as the days of cover to grow toward, so
    // the fields are not all the larder the frost finds (the cart alone buys toward the winter mark
    // from autumn day 4 and Farmland reads four days, and a town that met winter with five days in
    // store ran out at the thaw: hazel, day 48, 100 for 105). Only at Village rank, from late
    // spring (the menu's put-by) and with coins to spare, so a young town keeps its building money.
    const food = w.carrier.families[0]!;
    if (putBy && rankAtLeast(w, 'village') && food.reserve < HELD_FOOD_DAYS && p.coins() >= PUT_BY_COINS)
      p.do('keep a larder in the cart', [
        { t: 'carrier.setReserve', family: 'food', reserve: HELD_FOOD_DAYS },
      ]);
    const pop = w.residents.length;
    const mark = w.seasonPlan.food ?? w.seasonPlan.reserve;
    // The coins the carrier will need for the winter's food: what the mark asks beyond the larder, at
    // the carrier's price, from the summer's fourth day until the thaw.
    const eaten = FOODS.reduce((n, g) => n + (w.economy.yesterday.consumed[g] ?? 0), 0);
    const short =
      (season === 1 && day >= 4) || season >= 2 ? Math.max(0, mark * Math.max(eaten, pop) - larder(w)) : 0;
    const price = FOODS.reduce((n, g) => n + importPrice(w, g), 0) / Math.max(1, FOODS.length);
    p.winterFood = Math.ceil(short * price);
    p.larderShort = (season === 1 || season === 2) && pop > 0 && pop * mark > larder(w);
  }
}

export const plan: AdvisorDef = {
  id: 'plan',
  lane: 'ledger',
  // Where the seasons advisor was: after the Hamlet's homes (50), before the Hearth's decor (60).
  slot: 55,
  plays: (_opts, w) => w.settings.mode === 'standard',
  create: (p) => new Plan(p),
};
