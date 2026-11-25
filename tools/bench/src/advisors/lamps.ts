// The lamps advisor (R3E): the Hearth keeps its places alive. From Village rank a lantern burns a
// candle and a fire burns firewood (docs/spec/19-evenings.md, Supplies), so the Hearth's own small
// economy is what to keep alive tonight: when candles fall short of the lanterns it sets the
// busiest places to `keep` and lets the far, quiet ones `rest`, and puts a `rest` back to `normal`
// once the candles cover every lantern. It sends `place.setPriority` and, R3X, asks for an Apiary (a
// Hearth building) while the candles made fall short; no zone, no carrier rule, no business (the
// Ledger's supplies advisor makes what places burn).
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
  SUPPLY_KINDS,
  townStock,
  winterMark,
  type Building,
  type PlaceView,
  type WorldState,
} from '@qoti/sim';
import { costOf, type Planner } from '../planner';
import { count, G, S } from '../town';
import type { Advisor, AdvisorDef } from './types';

/** Commands one visit may send (as the places advisor's VISIT_COMMANDS). */
const VISIT_COMMANDS = 3;
/** Fires (braziers, bonfires) allowed whatever the woodpile. */
export const FIRE_FLOOR = 3;
/** Lanterns allowed whatever the candles (about four candles a night for a young Village's wishes). */
export const LANTERN_FLOOR = 16;
/** Days a place keeps a priority before the advisor changes it again (no flip-flopping as places merge and grow). */
const PRIORITY_DAYS = 4;
/** Candles a built chandler is planned to make a day (honey-limited: a hive pair feeds about two cycles). */
export const CHANDLER_DAILY = 8;
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

/** Nights the town's candles in hand are spread over when the lanterns' feed is reckoned (the crate's week). */
const FEED_NIGHTS = content.supplies.charterCrateNights ?? 7;
/** Candles a built chandler is counted to make a day at least, hands or no (a player sees a built workshop and waits a day). */
const CHANDLER_FLOOR = 2;
/** Apiaries the Hearth is asked for at most. */
const APIARIES_MAX = 3;

/** Candles the County's crate still holds at the Town Hall (a player reads them on its card). */
export function crateStock(w: WorldState): number {
  for (const b of w.buildings)
    if (b.def === 'town-hall' && b.stage === 'built' && b.rt) return b.rt.store[G('candles')] ?? 0;
  return 0;
}

/**
 * Candles the town's chandlers make a day, as a player reads it off the Ledger: what was made
 * yesterday, and at least `CHANDLER_FLOOR` for each chandler standing built (the first day of a new
 * workshop, or one that waits for honey).
 */
export function candlesMadeDaily(w: WorldState): number {
  let built = 0;
  for (const b of w.buildings) if (b.stage === 'built' && b.trade === 'chandler') built++;
  const yesterday = w.economy.yesterday.produced[G('candles')] ?? 0;
  return Math.max(yesterday, built * CHANDLER_FLOOR);
}

/** Lanterns the town's candles in hand light tonight (the County's crate at the Town Hall too: the settling draws it first). */
export function lanternCover(w: WorldState): number {
  const s = content.decorById.get('lantern')?.supply;
  return Math.floor((candleStock(w) + crateStock(w)) / (s?.qty ?? 1)) * (s?.per ?? 4);
}

/**
 * Lanterns the town's coming candles will feed a night: what its chandlers make a day, and the stock
 * and the County's crate spread over a week. A player stands lanterns to this, in a Hamlet as well
 * as a Village (a lantern costs nothing below Village rank, and a Village that stood a hundred
 * went dark the day the County stopped paying).
 */
export function lanternsFed(w: WorldState): number {
  const s = content.decorById.get('lantern')?.supply;
  // Stock is left out: much of what stands in town sits on shelves, which no lantern draws from.
  // The households' own candles come off what is made (they buy first, at the till).
  const homes = w.households.length / content.supplies.candleNights;
  const nights = Math.max(0, candlesMadeDaily(w) - homes) + crateStock(w) / FEED_NIGHTS;
  return Math.floor(nights / (s?.qty ?? 1)) * (s?.per ?? 4);
}

/**
 * Whether the town's coming candles feed `more` further lanterns on top of those standing (R3X: at
 * any rank). A first few lanterns the town can always light (a handful of candles a night: the
 * wishes for lanterns and the streets' charm do not wait on a chandler).
 */
export function candlesAllow(w: WorldState, more = 1): boolean {
  const standing = lanternIds(w).size;
  if (standing + more <= LANTERN_FLOOR) return true;
  return standing + more <= lanternsFed(w);
}

/** Whether the Charter is within two goals of met (or met): the County's crate comes with it. */
export function charterNear(w: WorldState): boolean {
  if (rankAtLeast(w, content.supplies.fromRank)) return false;
  const def = content.charterById.get(w.charter.charter);
  if (!def) return false;
  if (w.charter.ready) return true;
  let met = 0;
  def.goals.forEach((g, i) => {
    if ((w.charter.progress[i] ?? 0) >= g.target) met++;
  });
  return met >= def.goals.length - 2;
}

/**
 * Whether firewood in town is above the winter mark (and the reserve) with a day to spare for a
 * fire: the Hearth sets a brazier down only then. Below the supplies' rank a fire is free.
 */
export function firewoodAllows(w: WorldState): boolean {
  if (!rankAtLeast(w, content.supplies.fromRank)) return true;
  // The first few fires keep the winter's Craftsfolk warm whatever the woodpile (R2X's braziers).
  let fires = 0;
  for (const d of w.decor) {
    const sup = content.decorById.get(d.def)?.supply;
    if (sup?.kind === 'evening' && sup.good === 'firewood') fires++;
  }
  if (fires < FIRE_FLOOR) return true;
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

/** R3X: the place best kept of a supply kind this season: pieces of that kind, the longest kept record, then the busiest. */
export function supplyPlaceFor(w: WorldState, live: PlaceView[], kind: string): PlaceView | null {
  const k = SUPPLY_KINDS.indexOf(kind as (typeof SUPPLY_KINDS)[number]);
  let best: PlaceView | null = null;
  let bestScore = -1;
  for (const pl of live) {
    if (!pl.supplies?.some((s) => s.kind === kind && s.pieces > 0)) continue;
    const kept = w.places.find((r) => r.id === pl.id)?.supplied?.kept[k] ?? 0;
    const score = kept * 1000 + pl.visitors.reduce((a, x) => a + x, 0);
    if (score > bestScore) [best, bestScore] = [pl, score];
  }
  return best;
}

/**
 * R3X: the places the Town Book's hints point at (a custom's or specialty's place that fits it), so
 * the pair keep them lit first when candles run short and the Town Book advisor need not fight this
 * one over the same priority.
 */
export function bookPlaceIds(w: WorldState, live: PlaceView[]): Set<string> {
  const out = new Set<string>();
  for (const id of w.townBook.hints) {
    const custom = content.customById.get(id);
    const spec = content.specialtyById.get(id);
    if (custom?.kind === 'supply') {
      const at = supplyPlaceFor(w, live, custom.supply!);
      if (at) out.add(at.id);
    }
    for (const pl of live) {
      if (spec && pl.id.startsWith(`site:${spec.pattern}:`)) out.add(pl.id);
      if (custom?.kind === 'day') {
        if (custom.pattern !== undefined && pl.id.startsWith(`site:${custom.pattern}:`)) out.add(pl.id);
        if (custom.host !== undefined && pl.id.startsWith('host:')) {
          const b = w.buildings.find((x) => x.id === Number(pl.id.slice('host:'.length)));
          if (b?.def === custom.host) out.add(pl.id);
        }
      }
    }
  }
  return out;
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
  const book = bookPlaceIds(w, live);
  const busiest = [...withLamps].sort(
    (a, b) =>
      Number(book.has(b.id)) - Number(book.has(a.id)) ||
      visitedTotal(b) - visitedTotal(a) ||
      (a.id < b.id ? -1 : 1),
  );
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
  for (const pl of withLamps)
    if (!keep.has(pl) && pl.priority === 'keep' && !book.has(pl.id)) out.push([pl, 'normal']);
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
  /** The run day each place's priority last changed (a place is left alone for `PRIORITY_DAYS`). */
  private readonly sent = new Map<string, number>();

  constructor(readonly p: Planner) {}

  /** The run day an apiary was last asked for (one a day at most). */
  private apiaryDay = -1;

  /**
   * R3X: honey is the candles' raw good and the Treats shelves take the first of it, so while the
   * lanterns and the households' windows want more candles than the town makes, the Hearth keeps bees
   * of its own: an Apiary, one at a time (a Hearth building, so no farm is given up for hives).
   */
  private apiaries(): void {
    const w = this.p.w;
    const day = this.p.runDay;
    if (!rankAtLeast(w, content.supplies.fromRank) || day === this.apiaryDay) return;
    const lanterns = lanternIds(w).size;
    if (lanterns < LANTERN_FLOOR) return;
    const wanted = Math.ceil(lanterns / (content.decorById.get('lantern')?.supply?.per ?? 4));
    const windows = Math.ceil(w.households.length / content.supplies.candleNights);
    if (wanted + windows <= candlesMadeDaily(w) + crateStock(w) / FEED_NIGHTS) return;
    const standing = count(w, 'apiary');
    if (standing >= APIARIES_MAX || w.buildings.some((b) => b.def === 'apiary' && b.stage === 'construction'))
      return;
    this.apiaryDay = day;
    this.p.propose({
      def: 'apiary',
      priority: 4,
      cost: costOf('apiary'),
      pressing: true,
      essential: false,
    });
  }

  visit(): void {
    this.apiaries();
    const day = this.p.runDay;
    for (const { place, priority } of priorityChanges(this.p.w)) {
      if (day - (this.sent.get(place.id) ?? -PRIORITY_DAYS) < PRIORITY_DAYS) continue;
      if (this.p.do(`${place.name} to ${priority}`, [{ t: 'place.setPriority', id: place.id, priority }]))
        this.sent.set(place.id, day);
    }
  }
}

export const lamps: AdvisorDef = {
  id: 'lamps',
  lane: 'hearth',
  slot: 63,
  plays: (opts) => opts.hearth !== false,
  create: (p) => new Lamps(p),
};
