// Evening trade (docs/spec/19-evenings.md, Evening trade). R2B owns this file; R2A's place pass reads
// which outlets serve a place through it, never the shelves itself.
//
// Treats leave the 18:00 household pass and are bought on the evening round: at a stop, from passing
// trade, and by the 21:30 doorstep errand. Free in a Hamlet; paid through `purchase` from Village rank.
// The `baskets` system (baskets.ts) dispatches the work: Treats accrue at 17:00, the trade pass runs
// every ROUND_EVERY ticks from 17:00 to 21:00, the doorstep errand and the settling run at 21:30
// (the passes themselves are in trade.ts; this file stays a leaf, which the place pass imports).
//
// Which takes first (R2B decides; docs/build/r2-wave-notes.md, Evening trade and the carrier): the
// carrier comes at 10:00 and takes surplus only from makers' output buffers and the storehouses,
// never from a stall's or shop's shelf; the round takes only from those shelves (store minus
// reservedOut, never what porters or the carrier reserved). R3A: a tavern's shelf is its pouring
// stock (`rt.input`, delivered by porters as ever; `shelfOf`), with nothing reserved: no second shelf. One stock, two buffers: porters
// restock the shelves through the day, the round sells off them in the evening, and at 21:30 the
// doorstep errand goes to the next outlet in reach when a shelf is empty.
//
// Purity: nothing is cached across ticks and nothing draws from an RNG stream here. Passing trade
// rolls a hash of (resident, outlet, day), so the odds do not depend on how long they stand by a door.
import { content } from '@qoti/content';
import { GOOD_FAMILIES } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { GOODS_BY_FAMILY } from '../../state/zones';

/** The baskets system runs every this many ticks: a walker spends 4 or more on any tile (road 5, Sporty 0.8). */
export const ROUND_EVERY = 4;
/** The Treats group's id in a basket. */
export const TREATS_GROUP = 'treats';

/** The Treats goods, by good index. */
export const TREATS: readonly number[] = GOODS_BY_FAMILY[GOOD_FAMILIES.indexOf('treats')] ?? [];
const TREAT_SET: ReadonlySet<number> = new Set(TREATS);

/**
 * Whether a building sells Treats to the round at all: the tavern, and any 'market' outlet (the
 * stall, the Market Square, the shop) where, for a business with a trade that lists what it `sells`
 * by level, its level's shelf includes Treats (a shop from level 2). Storehouses, granaries and the
 * Trading Post are 'outlet' but never sell to the round. Structural only, never stock: the place
 * index may cache it.
 */
export function sellsTreats(_state: WorldState, b: Building): boolean {
  if (b.stage !== 'built') return false;
  const kind = treatsKind(b.def);
  if (kind === TreatsKind.tavern) return true;
  if (kind === TreatsKind.never) return false;
  const trade = content.tradeById.get(b.trade ?? (kind === TreatsKind.shop ? 'shop' : ''));
  if (!trade?.sells) return true;
  const level = Math.max(1, Math.min(trade.sells.length, b.level ?? 1));
  return trade.sells[level - 1]!.includes('treats');
}

/** What a def's tags say about Treats: never, a tavern (always), a market, or a shop (a market whose trade defaults to 'shop'). */
const TreatsKind = { never: 0, tavern: 1, market: 2, shop: 3 } as const;
type TreatsKind = (typeof TreatsKind)[keyof typeof TreatsKind];

/** R2X: by def, found once (the place signature asks for every building every tick it is read). */
const treatsKinds = new Map<string, TreatsKind>();

function treatsKind(def: string): TreatsKind {
  let k = treatsKinds.get(def);
  if (k === undefined) {
    const tags = content.buildingById.get(def)?.tags ?? [];
    k = tags.includes('tavern')
      ? TreatsKind.tavern
      : !tags.includes('market')
        ? TreatsKind.never
        : tags.includes('shop')
          ? TreatsKind.shop
          : TreatsKind.market;
    treatsKinds.set(def, k);
  }
  return k;
}

/**
 * The buffer a building sells Treats from, and what is promised away from it (R3A): a tavern's
 * pouring stock (`rt.input`, nothing reserved), everyone else's `store` less `reservedOut`.
 */
export function shelfOf(b: Building): { stock: number[]; reserved: number[] | null } | null {
  const rt = b.rt;
  if (!rt) return null;
  return treatsKind(b.def) === TreatsKind.tavern
    ? { stock: rt.input, reserved: null }
    : { stock: rt.store, reserved: rt.reservedOut };
}

/** Whether it has a Treat on the shelf right now (read live; never cache it). */
export function treatsOnShelf(_state: WorldState, b: Building): boolean {
  const shelf = shelfOf(b);
  if (!shelf) return false;
  for (const g of TREATS) if ((shelf.stock[g] ?? 0) - (shelf.reserved?.[g] ?? 0) > 0) return true;
  return false;
}

/** True when a good (by index) is in the Treats family. */
export function isTreat(good: number): boolean {
  return TREAT_SET.has(good);
}
