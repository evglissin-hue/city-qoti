// Words and small helpers for the village panels (I2, C4F): ranks, zones, prices, lanes and life
// events. Warm, dry and short, like the rest of the valley's paperwork.
import { content } from '@qoti/content';
import { RANKS, TICKS_PER_DAY, type MarketLine, type RankId, type SeatView } from '@qoti/sim';
import { seatLabel } from './format';

export const RANK_WORD: Record<RankId, string> = {
  hamlet: 'Hamlet',
  village: 'Village',
  town: 'Town',
  marketTown: 'Market Town',
  city: 'City',
};

export function rankIndex(rank: RankId | undefined): number {
  return Math.max(0, RANKS.indexOf(rank ?? 'hamlet'));
}

/** The valley holds at least this rank. */
export function rankAtLeast(rank: RankId | undefined, min: RankId): boolean {
  return rankIndex(rank) >= RANKS.indexOf(min);
}

/** Ink for each zone's palette token (content `ZoneDef.token`), for swatches, outlines and the minimap. */
export const ZONE_INK: Record<string, string> = {
  rose: '#d07f6c',
  plum: '#8a5d78',
  teal: '#3f7f7a',
  ochre: '#c48a3f',
  moss: '#6e7f4e',
};

export function zoneInk(zoneId: string): string {
  return ZONE_INK[content.zoneById.get(zoneId)?.token ?? ''] ?? '#8a7a66';
}

export function zoneInkByValue(value: number): string | null {
  const z = content.zoneByValue.get(value);
  return z ? (ZONE_INK[z.token] ?? '#8a7a66') : null;
}

export const LANE_WORD = { hearth: 'Hearth', ledger: 'Ledger', shared: 'Together' } as const;

// --- Money and prices ---------------------------------------------------------------------------

/** A price in coins: "2", "2.6", "2.45". */
export function priceText(pennies: number): string {
  const p = Math.round(pennies);
  const digits = p % 100 === 0 ? 0 : p % 10 === 0 ? 1 : 2;
  return (p / 100).toFixed(digits);
}

export type PriceMood = 'bargain' | 'cheap' | 'fair' | 'dear' | 'steep';

/** How a price sits against the usual one, in a word the stallholders would use. */
export function priceMood(price: number, base: number): PriceMood {
  const r = price / Math.max(1, base);
  if (r >= 1.6) return 'steep';
  if (r >= 1.15) return 'dear';
  if (r > 0.87) return 'fair';
  if (r > 0.6) return 'cheap';
  return 'bargain';
}

export const MOOD_WORD: Record<PriceMood, string> = {
  bargain: 'a bargain',
  cheap: 'cheap',
  fair: 'fair',
  dear: 'dear',
  steep: 'steep',
};

/** Days of cover in words ("less than a day", "about 3 days", "plenty"). */
export function coverText(days: number, demand: number): string {
  if (demand <= 0) return 'nobody is asking for it';
  if (days < 0.5) return 'barely any in store';
  if (days < 1) return 'less than a day in store';
  if (days < 1.5) return 'about a day in store';
  if (days >= 8) return 'plenty in store';
  return `about ${Math.round(days)} days in store`;
}

/** A market line is worth showing when someone wants it, it moved, or it is capped. */
export function inPlay(l: MarketLine): boolean {
  if (l.demand > 0 || l.price !== l.base || l.cap > 0 || l.subsidy > 0) return true;
  return l.history.some((p) => p !== l.base);
}

/** Goods in the order the ledger reads them: foods first, then the rest by content order. */
export function goodOrder(a: string, b: string): number {
  const ga = content.goodById.get(a);
  const gb = content.goodById.get(b);
  const fa = ga?.food ? 0 : 1;
  const fb = gb?.food ? 0 : 1;
  if (fa !== fb) return fa - fb;
  return (content.goodIndex.get(a) ?? 99) - (content.goodIndex.get(b) ?? 99);
}

// --- Seats and time -----------------------------------------------------------------------------

/** "Bo", "you", or the partner's name when the seat is unknown. */
export function who(seats: readonly SeatView[], seat: number, me: number): string {
  return seatLabel(seats, seat, me);
}

/** The other seat's name, for "not yet seen by Bo". */
export function partnerName(seats: readonly SeatView[], me: number): string {
  const p = seats.find((s) => s.seat !== me);
  return p?.name || 'your partner';
}

/** "today", "yesterday", "3 days ago" from two ticks. */
export function daysAgo(tick: number, now: number): string {
  const d = Math.floor(now / TICKS_PER_DAY) - Math.floor(tick / TICKS_PER_DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

/** Day index (0-based) of a tick, the way requests count `byDay`. */
export function dayOf(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

// --- Lives --------------------------------------------------------------------------------------

export const LIFE_ICON: Record<string, string> = {
  couple: 'heart',
  wedding: 'rings',
  birth: 'baby',
  apprentice: 'apprentice',
  retired: 'home',
  seaside: 'seaside',
};

/** The zone tool's variant that unzones instead of painting. */
export const UNZONE = 'clear';
