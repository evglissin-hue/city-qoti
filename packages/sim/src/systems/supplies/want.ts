// What places want of the town's goods tonight (R3A): the carrier's buying for places (10:00) and the
// fourth gap's words read it. Pure: reads saved state and the derived places only.
import { content } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { dayIndex } from '../economy/time';
import { Kind, pieceRanks, Rank, seasonOfDay, suppliedIndex, suppliesDraw } from './pieces';

/**
 * Units by good index places want tonight: a candle for every `per` lanterns not let rest, a fire's
 * firewood in its seasons, the cloth of pieces not yet put up this season. Pieces in a place set to
 * let rest want nothing; in a Hamlet nothing is wanted (every piece is supplied for nothing).
 */
export function placesWant(state: WorldState): number[] {
  const want = new Array<number>(state.economy.today.produced.length).fill(0);
  if (!suppliesDraw(state)) return want;
  const ix = suppliedIndex(state);
  if (ix.list.length === 0) return want;
  const ranks = pieceRanks(state);
  const season = seasonOfDay(dayIndex(state.tick));
  // Lanterns wanting a candle, by good (one candle serves `per` of them).
  const lanterns = new Map<number, { n: number; per: number }>();
  for (let i = 0; i < ix.list.length; i++) {
    if (ranks[i]! <= Rank.rest) continue;
    const d = ix.list[i]!;
    const supply = content.decorById.get(d.def)?.supply;
    const g = supply?.good ? content.goodIndex.get(supply.good) : undefined;
    if (!supply || g === undefined) continue;
    const qty = supply.qty ?? 1;
    if (ix.kind[i] === Kind.nightly) {
      const row = lanterns.get(g) ?? { n: 0, per: supply.per ?? 1 };
      row.n += 1;
      lanterns.set(g, row);
    } else if (ix.kind[i] === Kind.evening) {
      if (supply.seasons?.includes(season % 4)) want[g]! += qty;
    } else if (ix.kind[i] === Kind.season) {
      if (!clothUp(state, d.id, season)) want[g]! += qty;
    }
  }
  // Map order is insertion order, which follows the pieces' ids: deterministic.
  for (const [g, row] of lanterns) want[g]! += Math.ceil(row.n / row.per);
  return want;
}

/** A season piece's cloth is up this season (its record says so). */
function clothUp(state: WorldState, id: number, season: number): boolean {
  const list = state.supplies.pieces;
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid]!.id;
    if (v === id) return list[mid]!.cloth === season;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}
