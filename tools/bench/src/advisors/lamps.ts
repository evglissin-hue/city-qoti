// The lamps advisor (R3E): the Hearth keeps its places alive. From Village rank a lantern burns a
// candle and a fire burns firewood (docs/spec/19-evenings.md, Supplies), so the Hearth's own small
// economy is what to keep alive tonight: when candles fall short of the lanterns it sets the
// busiest places to `keep` and lets the far, quiet ones `rest`, and puts a `rest` back to `normal`
// once the candles cover every lantern. It sends `place.setPriority` and nothing else: no zone, no
// carrier rule, no business (the Ledger's supplies advisor makes what places burn).
//
// The module also holds the Hearth's gates, which `hearth.ts`, `places.ts` and `together.ts` ask
// before they set a lantern or a brazier down: `candlesAllow` and `firewoodAllows`, and the siting
// hint `specialtyNear` (a place beside a trade that could make a Town Book page).
//
// On the stand-ins (R3A to R3C not merged) every lantern burns, nothing rests and no page is found;
// this advisor reads only views and saved fields (`placesView`, `PlaceView.priority`, `townStock`,
// the carrier's families), never a stand-in's internals, so it does the right thing once they land.
import { content, type DecorDef } from '@qoti/content';
import {
  doorTile,
  familyCover,
  familyUse,
  methodOf,
  placesView,
  rankAtLeast,
  townStock,
  winterMark,
  type Building,
  type PlaceView,
  type WorldState,
} from '@qoti/sim';
import type { Planner } from '../planner';
import { G, S } from '../town';
import type { Advisor, AdvisorDef } from './types';

/** Commands one visit may send (as the places advisor's VISIT_COMMANDS). */
const VISIT_COMMANDS = 3;
/** Candles a built chandler is counted to make a day (honey-limited: a hive pair feeds about two cycles). */
export const CHANDLER_DAILY = 6;
/** Days of Fuel use a brazier may draw on top of the reserve and the winter mark. */
const FIRE_SPARE_DAYS = 1;
/** A business within this many tiles of a place's site counts as "beside" it for a specialty (the round's reach, 3 to 8). */
export const SPECIALTY_REACH = 8;
/** Patterns the places advisor can compose a site for; a specialty of one of these weighs double. */
const COMPOSABLE = ['corner-cafe'];

const fuelFamily = 1;

/** Whether a decor def burns a candle a night (any lantern: hanging lanterns and lamp posts too). */
export function isLantern(def: DecorDef | undefined): boolean {
  return def?.supply?.kind === 'nightly' && def.supply.good === 'candles';
}

/** The lantern decor ids standing, as a set (a place's members are matched against it). */
function lanternIds(w: WorldState): Set<number> {
  const out = new Set<number>();
  for (const d of w.decor) if (isLantern(content.decorById.get(d.def))) out.add(d.id);
  return out;
}

/** Candles in town: storehouses, stalls and the chandlers' output buffers, as the sim counts stock. */
export function candleStock(w: WorldState): number {
  return townStock(w)[G('candles')] ?? 0;
}

/** Candles the town's chandlers make a day, roughly (built businesses of the trade). */
export function candlesMadeDaily(w: WorldState): number {
  let n = 0;
  for (const b of w.buildings) if (b.stage === 'built' && b.trade === 'chandler') n += CHANDLER_DAILY;
  return n;
}

/** The nightly draw of `n` lanterns, in candles: `qty` for every `per`, rounded up. */
function nightlyDraw(n: number): number {
  const s = content.decorById.get('lantern')?.supply;
  const per = s?.per ?? 4;
  const qty = s?.qty ?? 1;
  return Math.ceil(n / per) * qty;
}

/** Lanterns the town's candle stock lights tonight. */
export function lanternCover(w: WorldState): number {
  const s = content.decorById.get('lantern')?.supply;
  return Math.floor(candleStock(w) / (s?.qty ?? 1)) * (s?.per ?? 4);
}

/**
 * Whether the town's candles cover `more` further lanterns on top of those standing: the stock plus
 * what the chandlers make a day against a night's draw. Below the supplies' rank a lantern burns for
 * nothing, so it always does.
 */
export function candlesAllow(w: WorldState, more = 1): boolean {
  if (!rankAtLeast(w, content.supplies.fromRank)) return true;
  const standing = lanternIds(w).size;
  return nightlyDraw(standing + more) <= candleStock(w) + candlesMadeDaily(w);
}

/**
 * Whether firewood in town is above the winter mark (and the reserve) with a day to spare for a
 * fire: the Hearth sets a brazier down only then. Below the supplies' rank a fire is free.
 */
export function firewoodAllows(w: WorldState): boolean {
  if (!rankAtLeast(w, content.supplies.fromRank)) return true;
  const f = w.carrier.families[fuelFamily];
  const days = Math.max(winterMark(w, fuelFamily) ?? 0, f?.reserve ?? 0) + FIRE_SPARE_DAYS;
  // Nobody burns anything yet (no use to count days against): any firewood in hand will do.
  if (familyUse(w, fuelFamily) === 0) return (townStock(w)[G('firewood')] ?? 0) > 0;
  return familyCover(w, fuelFamily) >= days * 100;
}

/** The Treat goods (indexes) a specialty names, weighed 2 for a pattern the Hearth can compose and 1 otherwise. */
function specialtyWeights(): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of content.specialties) {
    const g = content.goodIndex.get(s.good);
    if (g === undefined || content.goods[g]?.family !== 'treats') continue;
    out.set(g, Math.max(out.get(g) ?? 0, COMPOSABLE.includes(s.pattern) ? 2 : 1));
  }
  return out;
}

/** The Treats of a specialty that a business makes by its method or holds on its shelf, by weight. */
function treatWeight(b: Building, weights: Map<number, number>): number {
  if (b.stage !== 'built') return 0;
  let best = 0;
  for (const [id] of methodOf(b)?.outputs ?? []) {
    const g = content.goodIndex.get(id);
    if (g !== undefined) best = Math.max(best, weights.get(g) ?? 0);
  }
  const store = b.rt?.store;
  if (store) for (const [g, wt] of weights) if ((store[g] ?? 0) > 0) best = Math.max(best, wt);
  return best;
}

/**
 * How well a site at `tile` sits beside trades that could make a Town Book page: the summed weight
 * of the businesses within `SPECIALTY_REACH` (Manhattan, to their doors) that make or sell a Treat a
 * specialty names. 0 when none (the places advisor then keeps its old choice).
 */
export function specialtyNear(w: WorldState, tile: number): number {
  const weights = specialtyWeights();
  if (weights.size === 0) return 0;
  const x = tile % S;
  const z = Math.floor(tile / S);
  let sum = 0;
  for (const b of w.buildings) {
    const wt = treatWeight(b, weights);
    if (wt === 0) continue;
    const d = doorTile(b);
    if (Math.abs((d % S) - x) + Math.abs(Math.floor(d / S) - z) <= SPECIALTY_REACH) sum += wt;
  }
  return sum;
}

const visitedTotal = (pl: PlaceView): number => pl.visitors.reduce((a, v) => a + v, 0);

type Priority = 'keep' | 'normal' | 'rest';

/** The priority each place with lanterns should hold when candles run short, keeps first. */
function wanted(live: PlaceView[], w: WorldState): [place: PlaceView, priority: Priority][] {
  const lanterns = lanternIds(w);
  const lit = (pl: PlaceView): number => {
    const nightly = pl.supplies?.find((s) => s.kind === 'nightly');
    if (nightly) return nightly.pieces;
    let n = 0;
    for (const id of pl.members) if (lanterns.has(id)) n++;
    return n;
  };
  const withLamps = live.filter((pl) => lit(pl) > 0);
  const cover = lanternCover(w);
  // Covered: every rest goes back to normal.
  if (cover >= lanterns.size)
    return withLamps.filter((pl) => pl.priority === 'rest').map((pl) => [pl, 'normal']);
  // Short: the busiest places the stock covers are kept, the rest rest, the far and quiet ones first.
  const busiest = [...withLamps].sort((a, b) => visitedTotal(b) - visitedTotal(a) || (a.id < b.id ? -1 : 1));
  const keep = new Set<PlaceView>();
  let left = cover;
  for (const pl of busiest) {
    const n = lit(pl);
    if (n > left) continue;
    keep.add(pl);
    left -= n;
  }
  const homes = w.buildings.filter((b) => b.stage === 'built' && content.buildingById.get(b.def)?.housing);
  const far = (pl: PlaceView): number => {
    let best = Infinity;
    for (const h of homes) {
      const d = doorTile(h);
      best = Math.min(
        best,
        Math.abs((d % S) - (pl.tile % S)) + Math.abs(Math.floor(d / S) - Math.floor(pl.tile / S)),
      );
    }
    return best === Infinity ? 0 : best;
  };
  const rest = withLamps
    .filter((pl) => !keep.has(pl))
    .sort((a, b) => far(b) - far(a) || visitedTotal(a) - visitedTotal(b) || (a.id < b.id ? -1 : 1));
  // A stale keep is let go first, then the new keeps, then the rests.
  const out: [PlaceView, Priority][] = [];
  for (const pl of withLamps) if (!keep.has(pl) && pl.priority === 'keep') out.push([pl, 'normal']);
  for (const pl of busiest) if (keep.has(pl)) out.push([pl, 'keep']);
  for (const pl of rest) out.push([pl, 'rest']);
  return out;
}

/**
 * The priority commands a visit would send: from Village rank, and only changes (a place whose
 * priority already reads so is left alone; absent reads normal), at most `VISIT_COMMANDS`.
 */
export function priorityChanges(
  w: WorldState,
  live: PlaceView[] = placesView(w).places,
): {
  place: PlaceView;
  priority: Priority;
}[] {
  if (!rankAtLeast(w, content.supplies.fromRank) || live.length === 0) return [];
  return wanted(live, w)
    .filter(([pl, priority]) => (pl.priority ?? 'normal') !== priority)
    .slice(0, VISIT_COMMANDS)
    .map(([place, priority]) => ({ place, priority }));
}

class Lamps implements Advisor {
  constructor(readonly p: Planner) {}

  visit(): void {
    for (const { place, priority } of priorityChanges(this.p.w))
      this.p.do(`${place.name} to ${priority}`, [{ t: 'place.setPriority', id: place.id, priority }]);
  }
}

export const lamps: AdvisorDef = {
  id: 'lamps',
  lane: 'hearth',
  slot: 63,
  plays: (opts) => opts.hearth !== false,
  create: (p) => new Lamps(p),
};
