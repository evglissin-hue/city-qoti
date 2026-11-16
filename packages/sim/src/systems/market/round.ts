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
// never from a stall's, shop's or the tavern's shelf; the round takes only from those shelves (store
// minus reservedOut, never what porters or the carrier reserved). One stock, two buffers: porters
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
  const tags = content.buildingById.get(b.def)?.tags ?? [];
  if (tags.includes('tavern')) return true;
  if (!tags.includes('market')) return false;
  const trade = content.tradeById.get(b.trade ?? (tags.includes('shop') ? 'shop' : ''));
  if (!trade?.sells) return true;
  const level = Math.max(1, Math.min(trade.sells.length, b.level ?? 1));
  return trade.sells[level - 1]!.includes('treats');
}

/** Whether it has a Treat on the shelf right now (read live; never cache it). */
export function treatsOnShelf(_state: WorldState, b: Building): boolean {
  const store = b.rt?.store;
  if (!store) return false;
  for (const g of TREATS) if ((store[g] ?? 0) - (b.rt?.reservedOut[g] ?? 0) > 0) return true;
  return false;
}

/** True when a good (by index) is in the Treats family. */
export function isTreat(good: number): boolean {
  return TREAT_SET.has(good);
}

