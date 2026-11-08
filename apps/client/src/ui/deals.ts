// Playtest item 9: one-click trade deals. A deal is a standing order whose numbers the client
// works out from the town as it is now (population, yesterday's use, the season), so a player
// never touches a price. The functions here are pure; `syncDeals` is the one piece that talks to
// the session, re-sending a deal's order when the town has drifted away from it.
import { content, dealUse, dealUseDefault } from '@qoti/content';
import { calendar, type StandingOrderInput } from '@qoti/sim';
import type { Session } from '../app/session';

export type DealSide = 'buy' | 'sell';
export type DealVia = 'post' | 'dock';

/** What a deal needs to know about the town. */
export interface DealTown {
  population: number;
  /** Yesterday's consumption of the good, or undefined when the stocks view has none. */
  consumedYesterday?: number;
  /** 0 spring, 1 summer, 2 autumn, 3 winter. */
  season: number;
}

/** Days of use a buy deal keeps on the shelf at the least, and tops up to. */
export const BUY_MIN_DAYS = 3;
export const BUY_MAX_DAYS = 6;
/** Days of use a sell deal keeps back; it sells what is above. */
export const SELL_KEEP_DAYS = 5;
/** Percent of base price: the cheapest a deal sells at, and the dearest it buys at. */
export const FLOOR_PERCENT = 80;
export const CEILING_PERCENT = 160;
export const WINTER_FIREWOOD_CEILING_PERCENT = 250;
/** A live order is re-sent when a number is off from the fresh one by more than this share. */
export const DRIFT_SHARE = 0.25;

/** Units of a good the town goes through in a day: yesterday's use, else residents times a rate. */
export function dailyUse(good: string, town: DealTown): number {
  const seen = town.consumedYesterday ?? 0;
  if (seen > 0) return seen;
  return town.population * (dealUse[good] ?? dealUseDefault);
}

/** The order a deal writes for a good, from the town now. `neighbor` is who it deals with. */
export function dealOrder(
  good: string,
  side: DealSide,
  town: DealTown,
  neighbor: string,
): StandingOrderInput {
  const use = dailyUse(good, town);
  const base = content.goodById.get(good)?.basePrice ?? 100;
  const winterWood = good === 'firewood' && town.season >= 2;
  const ceiling = Math.round((base * (winterWood ? WINTER_FIREWOOD_CEILING_PERCENT : CEILING_PERCENT)) / 100);
  const floor = Math.round((base * FLOOR_PERCENT) / 100);
  if (side === 'sell')
    return { min: 0, max: Math.max(1, Math.ceil(use * SELL_KEEP_DAYS)), floor, ceiling, neighbor };
  const min = Math.max(1, Math.ceil(use * BUY_MIN_DAYS));
  return { min, max: Math.max(min + 1, Math.ceil(use * BUY_MAX_DAYS)), floor, ceiling, neighbor };
}

/** Which way a standing order trades: it buys when it keeps a minimum, else it sells the spare. */
export function orderSide(o: Pick<StandingOrderInput, 'min'>): DealSide {
  return o.min > 0 ? 'buy' : 'sell';
}

type Numbers = Pick<StandingOrderInput, 'min' | 'max' | 'floor' | 'ceiling' | 'neighbor'>;

const same = (a: Numbers, b: Numbers) =>
  a.min === b.min &&
  a.max === b.max &&
  a.floor === b.floor &&
  a.ceiling === b.ceiling &&
  a.neighbor === b.neighbor;

const off = (now: number, fresh: number) =>
  Math.abs(fresh - now) > 2 && Math.abs(fresh - now) > now * DRIFT_SHARE;

/** The town has moved on from this order by more than a quarter (or the season changed its ceiling). */
export function dealDrifted(order: Numbers, fresh: Numbers): boolean {
  return (
    off(order.min, fresh.min) ||
    off(order.max, fresh.max) ||
    order.ceiling !== fresh.ceiling ||
    order.floor !== fresh.floor
  );
}

/**
 * Is this live order one of ours to keep tuned? Its prices must be the ones a deal writes (80% and
 * 160% or 250% of base), and if we remember what we last sent for the good, it must still be that.
 * A player who changes a number by hand in Standing orders breaks one or the other.
 */
export function isManagedDeal(good: string, order: Numbers, last: Numbers | undefined): boolean {
  const base = content.goodById.get(good)?.basePrice ?? 100;
  const floor = Math.round((base * FLOOR_PERCENT) / 100);
  const ceilings = [CEILING_PERCENT, WINTER_FIREWOOD_CEILING_PERCENT].map((p) =>
    Math.round((base * p) / 100),
  );
  if (order.floor !== floor || !ceilings.includes(order.ceiling)) return false;
  return last === undefined || same(order, last);
}

/** The town as a deal sees it, from the mirror. */
export function townFor(session: Session, good: string): DealTown {
  const m = session.mirror;
  return {
    population: m.residents.size,
    consumedYesterday: m.stocks.value?.lines.find((l) => l.good === good)?.consumedYesterday,
    season: calendar(m.tick.value).season,
  };
}

/** Units of a good in the town's stores, from the stocks view. */
export function stockOf(session: Session, good: string): number {
  return session.mirror.stocks.value?.lines.find((l) => l.good === good)?.stock ?? 0;
}

const markKey = (via: DealVia, good: string) => `${via}:${good}`;

/** Sends (or drops) a deal and remembers the numbers it sent. */
export function setDeal(
  session: Session,
  via: DealVia,
  good: string,
  order: StandingOrderInput | null,
): void {
  const marks = session.ui.dealMarks;
  if (order) marks.set(markKey(via, good), order);
  else marks.delete(markKey(via, good));
  session.submit({ t: 'trade.setStandingOrder', good, order, ...(via === 'dock' ? { via } : {}) });
}

/** Turns a deal on for a neighbor, or off when it is already on. */
export function toggleDeal(
  session: Session,
  via: DealVia,
  good: string,
  side: DealSide,
  neighbor: string,
): void {
  const orders =
    via === 'dock' ? (session.mirror.dock.value?.orders ?? []) : (session.mirror.trade.value?.orders ?? []);
  const live = orders.find((o) => o.good === good);
  const on =
    live &&
    orderSide(live) === side &&
    (via === 'dock' || ('neighbor' in live && live.neighbor === neighbor));
  setDeal(
    session,
    via,
    good,
    on ? null : dealOrder(good, side, townFor(session, good), via === 'dock' ? '' : neighbor),
  );
}

/**
 * Re-sends every deal the town has drifted away from. Run when the Trade book opens and on each
 * new day. Orders a player edited by hand are left alone (see `isManagedDeal`).
 */
export function syncDeals(session: Session): number {
  const m = session.mirror;
  let sent = 0;
  const post = m.trade.value?.orders ?? [];
  const d = m.dock.value;
  // The river's frozen or no dock stands: the command would be refused, so leave the dock be.
  const dock = d && d.built !== false && !d.frozen ? (d.orders ?? []) : [];
  const run = (
    via: DealVia,
    orders: readonly (Omit<Numbers, 'neighbor'> & { good: string; neighbor?: string })[],
  ) => {
    for (const o of orders) {
      const cur: Numbers = { ...o, neighbor: o.neighbor ?? '' };
      if (via === 'post' && !cur.neighbor) continue;
      const last = session.ui.dealMarks.get(markKey(via, o.good));
      if (!isManagedDeal(o.good, cur, last)) continue;
      const fresh = dealOrder(o.good, orderSide(cur), townFor(session, o.good), cur.neighbor);
      if (!dealDrifted(cur, fresh)) continue;
      setDeal(session, via, o.good, fresh);
      sent++;
    }
  };
  run('post', post);
  run('dock', dock);
  return sent;
}
