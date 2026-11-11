// R1 (R1D): which twists a festival may be planned with (docs/spec/12-hearth.md, Festivals, the
// [R1] note): a twist that names a good the town cannot yet make is not offered (the costume parade
// asks for cloth; the pie contest waits for a master baker, R3, and is in no season). Pure.
import { content, type Condition } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { townStock } from '../../view/hamlet';
import { placeableNow, tradeAvailable } from '../hearth/wishes/achievable';

/** Goods a twist's goal names (stock goals and menu goals), by id. */
export function goodsNamed(cond: Condition, out: string[] = []): string[] {
  if ('all' in cond) for (const c of cond.all) goodsNamed(c, out);
  else if ('any' in cond) for (const c of cond.any) goodsNamed(c, out);
  else if ('stock' in cond) out.push(cond.stock.good);
  else if ('code' in cond && cond.code === 'festivalMenu' && cond.ref) out.push(cond.ref);
  return out;
}

/**
 * The town has the good, or can make it now: it is in stock, a standing building or business
 * makes it, a trade that makes it could open (its zone open, its reach to be had) with its raw
 * goods to hand by the same test, or a building that makes it can be placed.
 */
export function goodMakeable(state: WorldState, good: string, depth = 0): boolean {
  const g = content.goodIndex.get(good);
  if (g === undefined) return false;
  if ((townStock(state)[g] ?? 0) > 0) return true;
  for (const b of state.buildings) {
    if (b.trade && content.tradeById.get(b.trade)?.makes === good) return true;
    const def = content.buildingById.get(b.def);
    if (def?.methods?.some((m) => m.outputs.some(([o]) => o === good))) return true;
  }
  if (depth < 3) {
    for (const t of content.trades) {
      if (t.makes !== good || !tradeAvailable(state, t)) continue;
      if (t.from.every((r) => goodMakeable(state, r, depth + 1))) return true;
    }
  }
  return content.buildings.some(
    (d) => d.methods?.some((m) => m.outputs.some(([o]) => o === good)) && placeableNow(state, d),
  );
}

/** True when the twist can be planned now: in this season, and every good it names can be had. */
export function twistOffered(state: WorldState, id: string): boolean {
  const t = content.twistById.get(id);
  if (!t) return false;
  if (t.seasons && !t.seasons.includes(seasonAt(state.tick).season)) return false;
  return (t.goal ? goodsNamed(t.goal) : []).every((g) => goodMakeable(state, g));
}

/** The twists offered now, in content order. */
export function twistsOffered(state: WorldState): string[] {
  return content.twists.filter((t) => twistOffered(state, t.id)).map((t) => t.id);
}
