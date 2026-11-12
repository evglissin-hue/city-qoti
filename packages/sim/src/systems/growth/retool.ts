// Retooling (docs/spec/13-ledger.md, Choosing a trade): a business retools to another trade only
// when its own good has been in surplus for SURPLUS_DAYS and another is short, one a night across
// the town, keeping its keeper; a trade the Ledger pinned never changes. A business whose site wants
// stop being met (its windmill was moved, or no longer has room for it) retools after
// SITE_FAIL_DAYS, pinned or not. The counters (`surplusDays`, `siteDays`) are kept here, at 01:00.
import { content, type TradeDef } from '@qoti/content';
import { BuildingStatus } from '../../constants';
import type { Building, Lot, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { emptyCounters } from '../../state/zones';
import { businessView } from '../../view/businesses';
import { emitBuilding } from '../economy/emit';
import { clearFields, fieldsOf } from '../production/fields';
import { isFrozen } from '../seasons/api';
import type { SiteCache } from './site';
import { siteMeets } from './site';
import { needOf, tradeTerms, type TownNeeds } from './trades';

/** Days in surplus before a business retools to a trade the town is short of. */
export const SURPLUS_DAYS = 6;
/** Days its site wants go unmet before a business retools, pinned or not. */
export const SITE_FAIL_DAYS = 3;
/** Need (permille) another trade must have to count as short. */
export const RETOOL_SHORT_NEED = 500;
/** Days of what the town wants of a good in store that read as a surplus. */
export const SURPLUS_COVER_DAYS = 6;

/** True when the business's own good is in surplus: nobody needs it, and it piles up. */
function inSurplus(state: WorldState, b: Building, t: TradeDef, n: TownNeeds): boolean {
  if (!t.makes) return false;
  const g = content.goodIndex.get(t.makes);
  if (g === undefined || needOf(state, t, n).need > 0) return false;
  const full = ((b.rt?.status ?? 0) & BuildingStatus.outputFull) !== 0;
  return full || n.stock[g]! > SURPLUS_COVER_DAYS * Math.max(1, n.want[g]!);
}

/** Other trades of its zone the valley allows, best first (score, then content order). */
function alternatives(
  state: WorldState,
  b: Building,
  lot: Lot,
  trades: readonly TradeDef[],
  n: TownNeeds,
  cache: SiteCache,
): { t: TradeDef; score: number; need: number; site: boolean }[] {
  const out: { t: TradeDef; score: number; need: number; site: boolean }[] = [];
  for (const t of trades) {
    if (t.id === b.trade || t.building !== b.def) continue;
    const terms = tradeTerms(state, lot, t, n, cache, b.id);
    const site = terms.site === 1 || siteMeets(cache, lot, t, b.id);
    out.push({ t, score: terms.score, need: terms.need, site });
  }
  // Stable sort keeps content order among equals.
  return out.sort((p, q) => q.score - p.score);
}

/** Turns the business to another trade, keeping its keeper and level; the Ledger's pin lifts. */
export function retool(state: WorldState, ctx: TickCtx, b: Building, t: TradeDef): void {
  const def = content.buildingById.get(b.def);
  const was = b.trade ? content.tradeById.get(b.trade) : undefined;
  // A grain farm turning to something else lets its fields go.
  if (def && was?.method?.kind === 'farm' && t.method?.kind !== 'farm') {
    clearFields(state, ctx, fieldsOf(state, b, def));
  }
  b.trade = t.id;
  delete b.pinned;
  if (b.rt) b.rt.progress = 0;
  const c = (b.counters ??= emptyCounters());
  c.levelDays = 0;
  c.surplusDays = 0;
  c.siteDays = 0;
  emitBuilding(state, ctx, b);
  ctx.events.push({ e: 'business.updated', b: businessView(state, b) });
}

/**
 * Keeps the night's counters and retools: every business whose site has failed SITE_FAIL_DAYS, and
 * at most one in surplus. `tradesFor(zoneId)` gives the trades the valley allows. Returns how many.
 */
export function retoolPass(
  state: WorldState,
  ctx: TickCtx,
  n: TownNeeds,
  cache: SiteCache,
  tradesFor: (zoneId: string) => readonly TradeDef[],
): number {
  const frozen = isFrozen(state);
  const failed: [Building, Lot][] = [];
  let surplus: [Building, Lot] | null = null;
  for (const b of state.buildings) {
    if (!b.trade || b.stage !== 'built' || !b.lot) continue;
    const lot = findById(state.lots, b.lot);
    const t = content.tradeById.get(b.trade);
    if (!lot || !t) continue;
    const c = (b.counters ??= emptyCounters());
    // A frozen river saws by hand for one carpenter fewer: the carpenter left out waits for the thaw.
    const waits = frozen && t.wants.reach === 'sawmill';
    if (siteMeets(cache, lot, t, b.id)) c.siteDays = 0;
    else if (!waits) c.siteDays++;
    if (inSurplus(state, b, t, n)) c.surplusDays++;
    else c.surplusDays = 0;
    if (c.siteDays >= SITE_FAIL_DAYS) failed.push([b, lot]);
    else if (!b.pinned && c.surplusDays >= SURPLUS_DAYS) {
      if (!surplus || c.surplusDays > surplus[0].counters!.surplusDays) surplus = [b, lot];
    }
  }
  let n0 = 0;
  for (const [b, lot] of failed) {
    const zoneId = content.zoneByValue.get(lot.zone)?.id ?? '';
    const next = alternatives(state, b, lot, tradesFor(zoneId), n, cache).find((a) => a.site);
    if (!next) continue;
    retool(state, ctx, b, next.t);
    cache.retooled(b);
    n0++;
  }
  if (surplus) {
    const [b, lot] = surplus;
    const zoneId = content.zoneByValue.get(lot.zone)?.id ?? '';
    const next = alternatives(state, b, lot, tradesFor(zoneId), n, cache).find(
      (a) => a.score > 0 && a.need >= RETOOL_SHORT_NEED,
    );
    if (next) {
      retool(state, ctx, b, next.t);
      cache.retooled(b);
      n0++;
    }
  }
  return n0;
}
