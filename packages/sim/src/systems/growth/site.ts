// The site term of the trade score (docs/spec/13-ledger.md, Choosing a trade): does a lot meet what
// a trade wants of its ground? Soil (average fertility), pollinators in its chunk, a specialized
// building's reach with room under its capacity, households in reach for a shop. A business already
// standing asks the same of its own lot, counting itself among the served, so a third baker in a
// windmill's reach of two finds no room while the first two do (`siteDays`, retooling).
import { content, type TradeDef } from '@qoti/content';
import { FIELD_GOOD_FERTILITY, HABITAT_IDS, MAP_SIZE, Zone } from '../../constants';
import type { Building, EntityId, Lot, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { doorTile } from '../movement/api';
import { FIELD_TILES_PER_WORKER } from '../production/fields';
import { chunkOfTile, scoreAt } from '../nature/habitats';
import { capacityOf, reachTest, withinReach } from '../specialized/api';
import { lotMiddle } from './desirability';

const S = MAP_SIZE;
const POLLINATOR = (HABITAT_IDS as readonly string[]).indexOf('pollinator');
/** Tiles around a lot a grain farm's fields may lie in (as the growth pass gives them). */
export const FIELD_WINDOW = 8;

/** Map tiles a side of the buckets specialized buildings are sorted into, and reach's hop (specialized/api). */
const NEAR_BUCKET = 16;
const REACH_HOP = 3;

/** Households whose door lies within this many tiles (straight line) of a shop lot's middle. */
export const SHOP_REACH = 14;

/** A trade's index in content order, and the specialized defs, for signatures. */
const TRADE_INDEX: ReadonlyMap<string, number> = new Map(content.trades.map((t, i) => [t.id, i]));
const SPECIALIZED: ReadonlySet<string> = new Set(
  content.buildings.filter((d) => d.specialized).map((d) => d.id),
);

/**
 * Served lists by def kept from one pass to the next with the signature of the town they were made
 * for (derived, never saved): a night in which nothing was built, moved or retooled reuses them, and
 * a reused list is always what walking the reaches again would give.
 */
const remembered = new WeakMap<
  WorldState,
  Map<string, { sig: Int32Array; lists: Map<EntityId, EntityId[]> }>
>();

function sameInts(a: Int32Array, b: Int32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Per-pass memory: each specialized building by def, its capacity and who it serves (ids in reach,
 * by id), the household doors and each lot's household count, so a night that checks many lots walks
 * each reach once. Derived, never saved; build one per pass and `reset()` it when a business grows
 * or retools (who is served changes).
 */
export class SiteCache {
  private readonly served = new Map<EntityId, EntityId[]>();
  private readonly capacity = new Map<EntityId, number>();
  private readonly households = new Map<EntityId, number>();
  private readonly byDef = new Map<string, Building[]>();
  private byTrade: Map<string, Building[]> | null = null;
  private doors: number[] | null = null;
  private homeBuckets: number[][] | null = null;
  private sig: Int32Array | null = null;
  private readonly doorOf = new Map<EntityId, number>();
  private readonly near = new Map<string, { n: number; buckets: Building[][] }>();

  /** Who is served changed in place tonight (a business grew or retooled). */
  private changed = false;

  constructor(
    readonly state: WorldState,
    homeDoors?: number[],
  ) {
    if (homeDoors) this.doors = homeDoors;
    // The town as it stands as the pass begins: what remembered lists must match (see recall).
    this.signature();
  }

  /** Who is served may have changed (a business grew or retooled): forget it. */
  reset(): void {
    this.changed = true;
    this.near.clear();
    this.served.clear();
    this.households.clear();
    this.byDef.clear();
    this.byTrade = null;
    this.doors = null;
    this.homeBuckets = null;
    this.sig = null;
  }

  /**
   * A business just grew: it joins the served lists of the specialized buildings whose reach holds
   * its door (cheaper than a reset, which walks every reach again).
   */
  /** A business turned to another trade: it leaves the lists it was on and joins those it now fits. */
  retooled(b: Building): void {
    this.beforeChange();
    for (const ids of this.served.values()) {
      const k = ids.indexOf(b.id);
      if (k >= 0) ids.splice(k, 1);
    }
    this.addBusiness(b);
  }

  /** A building's door tile, once a pass. */
  door(b: Building): number {
    let d = this.doorOf.get(b.id);
    if (d === undefined) {
      d = doorTile(b);
      this.doorOf.set(b.id, d);
    }
    return d;
  }

  addBusiness(b: Building): void {
    if (!b.trade) return;
    this.beforeChange();
    // The index is rebuilt when next asked; the lists already made are brought up to date here.
    this.byTrade = null;
    const door = this.door(b);
    for (const [id, ids] of this.served) {
      const sb = findById(this.state.buildings, id);
      const enables = sb ? content.buildingById.get(sb.def)?.enables : undefined;
      if (!sb || !enables?.includes(b.trade) || !withinReach(this.state, sb, door)) continue;
      let k = ids.length;
      while (k > 0 && ids[k - 1]! > b.id) k--;
      ids.splice(k, 0, b.id);
    }
  }

  /** Businesses by trade (and buildings by their def's tags, for a reach that names a tag). */
  private tradeIndex(): Map<string, Building[]> {
    if (!this.byTrade) {
      this.byTrade = new Map();
      for (const b of this.state.buildings) {
        const keys = b.trade ? [b.trade, b.def] : [b.def];
        for (const k of keys) {
          const list = this.byTrade.get(k);
          if (list) list.push(b);
          else this.byTrade.set(k, [b]);
        }
        for (const tag of content.buildingById.get(b.def)?.tags ?? []) {
          const list = this.byTrade.get(tag);
          if (list) list.push(b);
          else this.byTrade.set(tag, [b]);
        }
      }
    }
    return this.byTrade;
  }

  /** Built buildings of a def (the specialized buildings a trade's reach names). */
  built(defId: string): readonly Building[] {
    let list = this.byDef.get(defId);
    if (!list) {
      list = this.state.buildings.filter((b) => b.def === defId && b.stage === 'built');
      this.byDef.set(defId, list);
    }
    return list;
  }

  /** How many `sb` may serve tonight. */
  capacityOf(sb: Building): number {
    let n = this.capacity.get(sb.id);
    if (n === undefined) {
      n = capacityOf(this.state, sb);
      this.capacity.set(sb.id, n);
    }
    return n;
  }

  /** Businesses of the trades `sb` enables whose door lies in its reach, sorted by id. */
  servedBy(sb: Building): EntityId[] {
    let ids = this.served.get(sb.id);
    if (!ids) {
      if (!this.recall(sb.def)) {
        this.serveAll(sb.def);
        this.keep(sb.def);
      }
      ids = this.served.get(sb.id) ?? [];
    }
    return ids;
  }

  /** The town's buildings as served lists depend on them: id, trade and stage of each. */
  private signature(): Int32Array {
    if (!this.sig) {
      const list = this.state.buildings;
      const sig = new Int32Array(list.length * 3 + 1);
      sig[0] = this.state.networkVersion;
      for (let i = 0; i < list.length; i++) {
        const b = list[i]!;
        sig[1 + i * 3] = b.id;
        sig[2 + i * 3] = b.trade ? (TRADE_INDEX.get(b.trade) ?? -2) : -1;
        // A business counts going up or built alike; only a specialized building's stage matters.
        sig[3 + i * 3] = b.stage === 'built' && SPECIALIZED.has(b.def) ? 1 : 0;
      }
      this.sig = sig;
    }
    return this.sig;
  }

  /**
   * Last pass's served lists for the def, when nothing they depend on has changed since. Only before
   * tonight changes anything in place: after that, lists not yet loaded are made afresh.
   */
  private recall(defId: string): boolean {
    if (this.changed) return false;
    const kept = remembered.get(this.state)?.get(defId);
    if (!kept || !sameInts(kept.sig, this.signature())) return false;
    for (const [id, ids] of kept.lists) this.served.set(id, ids.slice());
    return true;
  }

  /** Before the first change in place: load every list last pass kept that still holds. */
  private beforeChange(): void {
    if (this.changed) return;
    for (const defId of remembered.get(this.state)?.keys() ?? []) {
      const sb = this.built(defId)[0];
      if (sb && !this.served.has(sb.id)) this.recall(defId);
    }
    this.changed = true;
  }

  /**
   * The pass is over: keep every served list made tonight, as brought up to date in place, against
   * the town as it now stands, for the next pass to reuse.
   */
  persist(): void {
    this.sig = null;
    this.changed = false;
    const defs = new Set<string>();
    for (const id of this.served.keys()) {
      const sb = findById(this.state.buildings, id);
      if (sb) defs.add(sb.def);
    }
    for (const def of [...defs].sort()) this.keep(def);
  }

  /** Keeps tonight's served lists for the def (copies: the night's may change in place). */
  private keep(defId: string): void {
    let perState = remembered.get(this.state);
    if (!perState) {
      perState = new Map();
      remembered.set(this.state, perState);
    }
    const lists = new Map<EntityId, EntityId[]>();
    for (const sb of this.built(defId)) lists.set(sb.id, (this.served.get(sb.id) ?? []).slice());
    perState.set(defId, { sig: this.signature(), lists });
  }

  /**
   * As servedIds (specialized/api), for every built building of the def in one sweep: each business
   * of an enabled trade asks only the buildings of the def standing near its door.
   */
  private serveAll(defId: string): void {
    const enables = content.buildingById.get(defId)?.enables ?? [];
    // The businesses of its enabled trades, sorted into buckets of the map by door.
    const n = Math.ceil(S / NEAR_BUCKET);
    const buckets: [Building, number][][] = Array.from({ length: n * n }, () => []);
    const index = this.tradeIndex();
    const seen = new Set<EntityId>();
    for (const t of enables) {
      for (const o of index.get(t) ?? []) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        const door = this.door(o);
        buckets[
          Math.floor(Math.floor(door / S) / NEAR_BUCKET) * n + Math.floor((door % S) / NEAR_BUCKET)
        ]!.push([o, door]);
      }
    }
    const span = (content.buildingById.get(defId)?.reach ?? 24) + 2 * REACH_HOP;
    for (const sb of this.built(defId)) {
      const ids: EntityId[] = [];
      if (seen.size > 0) {
        const test = reachTest(this.state, sb);
        const d = this.door(sb);
        const x = d % S;
        const z = Math.floor(d / S);
        const bx0 = Math.max(0, Math.floor((x - span) / NEAR_BUCKET));
        const bx1 = Math.min(n - 1, Math.floor((x + span) / NEAR_BUCKET));
        const bz0 = Math.max(0, Math.floor((z - span) / NEAR_BUCKET));
        const bz1 = Math.min(n - 1, Math.floor((z + span) / NEAR_BUCKET));
        for (let bz = bz0; bz <= bz1; bz++)
          for (let bx = bx0; bx <= bx1; bx++)
            for (const [o, door] of buckets[bz * n + bx]!) if (o.id !== sb.id && test(door)) ids.push(o.id);
      }
      this.served.set(
        sb.id,
        ids.sort((a, b) => a - b),
      );
    }
  }

  /**
   * Built buildings of a def whose reach could hold the tile (their door within reach and two hops,
   * Manhattan), from buckets of the map built once a pass.
   */
  nearby(defId: string, tile: number): readonly Building[] {
    let idx = this.near.get(defId);
    if (!idx) {
      const n = Math.ceil(S / NEAR_BUCKET);
      const buckets: Building[][] = Array.from({ length: n * n }, () => []);
      const span = (content.buildingById.get(defId)?.reach ?? 24) + 2 * REACH_HOP;
      for (const sb of this.built(defId)) {
        const d = this.door(sb);
        const x = d % S;
        const z = Math.floor(d / S);
        const bx0 = Math.max(0, Math.floor((x - span) / NEAR_BUCKET));
        const bx1 = Math.min(n - 1, Math.floor((x + span) / NEAR_BUCKET));
        const bz0 = Math.max(0, Math.floor((z - span) / NEAR_BUCKET));
        const bz1 = Math.min(n - 1, Math.floor((z + span) / NEAR_BUCKET));
        for (let bz = bz0; bz <= bz1; bz++)
          for (let bx = bx0; bx <= bx1; bx++) buckets[bz * n + bx]!.push(sb);
      }
      idx = { n, buckets };
      this.near.set(defId, idx);
    }
    const x = tile % S;
    const z = Math.floor(tile / S);
    return idx.buckets[Math.floor(z / NEAR_BUCKET) * idx.n + Math.floor(x / NEAR_BUCKET)]!;
  }

  /** Household doors (tile indexes), once a pass. */
  homeDoors(): readonly number[] {
    if (!this.doors) {
      this.doors = [];
      for (const h of this.state.households) {
        const home = findById(this.state.buildings, h.homeId);
        if (home) this.doors.push(doorTile(home));
      }
    }
    return this.doors;
  }

  /** True when at least `k` household doors lie within SHOP_REACH of the lot's middle (stops at k). */
  householdsAtLeast(lot: Lot, k: number): boolean {
    const known = this.households.get(lot.id);
    if (known !== undefined) return known >= k;
    const [x, z] = lotMiddle(lot);
    const buckets = this.doorBuckets();
    const n = Math.ceil(S / NEAR_BUCKET);
    const bx0 = Math.max(0, Math.floor((x - SHOP_REACH) / NEAR_BUCKET));
    const bx1 = Math.min(n - 1, Math.floor((x + SHOP_REACH) / NEAR_BUCKET));
    const bz0 = Math.max(0, Math.floor((z - SHOP_REACH) / NEAR_BUCKET));
    const bz1 = Math.min(n - 1, Math.floor((z + SHOP_REACH) / NEAR_BUCKET));
    let count = 0;
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        for (const door of buckets[bz * n + bx]!) {
          const dx = (door % S) - x;
          const dz = Math.floor(door / S) - z;
          if (dx * dx + dz * dz <= SHOP_REACH * SHOP_REACH && ++count >= k) return true;
        }
      }
    }
    this.households.set(lot.id, count);
    return false;
  }

  /** Household doors sorted into buckets of the map, once a pass. */
  private doorBuckets(): number[][] {
    if (!this.homeBuckets) {
      const n = Math.ceil(S / NEAR_BUCKET);
      const buckets: number[][] = Array.from({ length: n * n }, () => []);
      for (const door of this.homeDoors()) {
        buckets[
          Math.floor(Math.floor(door / S) / NEAR_BUCKET) * n + Math.floor((door % S) / NEAR_BUCKET)
        ]!.push(door);
      }
      this.homeBuckets = buckets;
    }
    return this.homeBuckets;
  }

  /** Household doors within SHOP_REACH of the lot's middle (the shop's custom; footfall from R2). */
  householdsNear(lot: Lot): number {
    let n = this.households.get(lot.id);
    if (n === undefined) {
      const [x, z] = lotMiddle(lot);
      n = 0;
      for (const door of this.homeDoors()) {
        const dx = (door % S) - x;
        const dz = Math.floor(door / S) - z;
        if (dx * dx + dz * dz <= SHOP_REACH * SHOP_REACH) n++;
      }
      // R2 seam: footfall past the lot will count here too (docs/spec/19-evenings.md).
      this.households.set(lot.id, n);
    }
    return n;
  }
}

/**
 * True when a built `defId` building has the tile in its reach with room: for a business already
 * standing (`self`), it is among the first `capacity` it serves; for a new one, it serves fewer than
 * its capacity.
 */
export function reachWithRoom(cache: SiteCache, defId: string, tile: number, self: EntityId = 0): boolean {
  const state = cache.state;
  for (const sb of cache.nearby(defId, tile)) {
    if (!withinReach(state, sb, tile)) continue;
    const cap = cache.capacityOf(sb);
    const ids = cache.servedBy(sb);
    if (self) {
      const k = ids.indexOf(self);
      if (k >= 0 ? k < cap : ids.length < cap) return true;
    } else if (ids.length < cap) return true;
  }
  return false;
}

/**
 * Free farm-zoned ground on good soil around the lot, for a grain farm's fields: tiles of the
 * Farmland zone outside any lot, owned by no other farm, with fertility FIELD_GOOD_FERTILITY+.
 */
export function fieldGround(state: WorldState, lot: Lot, self: EntityId = 0): number {
  const m = state.map;
  let n = 0;
  for (let z = Math.max(0, lot.z - FIELD_WINDOW); z < Math.min(S, lot.z + lot.d + FIELD_WINDOW); z++) {
    for (let x = Math.max(0, lot.x - FIELD_WINDOW); x < Math.min(S, lot.x + lot.w + FIELD_WINDOW); x++) {
      const i = z * S + x;
      if (m.zone[i] !== Zone.farms || m.lot[i] || m.fertility[i]! < FIELD_GOOD_FERTILITY) continue;
      if (m.fieldOwner[i] && m.fieldOwner[i] !== self) continue;
      n++;
    }
  }
  return n;
}

/** Average lot fertility of at least `min` (integer: the sum against min x area). */
function fertileEnough(state: WorldState, lot: Lot, min: number): boolean {
  let sum = 0;
  for (let z = lot.z; z < lot.z + lot.d; z++)
    for (let x = lot.x; x < lot.x + lot.w; x++) sum += state.map.fertility[z * S + x]!;
  return sum >= min * lot.w * lot.d;
}

/**
 * True when the lot meets what the trade wants of its site (TradeWants). `self` is the business
 * already standing on it, if any (it counts among a reach's served, see reachWithRoom).
 */
export function siteMeets(cache: SiteCache, lot: Lot, t: TradeDef, self: EntityId = 0): boolean {
  const state = cache.state;
  const w = t.wants;
  if (w.fertility !== undefined && !fertileEnough(state, lot, w.fertility)) return false;
  if (w.pollinators !== undefined) {
    const [x, z] = lotMiddle(lot);
    if (scoreAt(state, POLLINATOR, chunkOfTile(x, z)) < w.pollinators) return false;
  }
  if (w.reach !== undefined && !reachWithRoom(cache, w.reach, lot.frontage, self)) return false;
  if (w.households !== undefined && !cache.householdsAtLeast(lot, w.households)) return false;
  // A grain farm wants Farmland left over behind its lot for a first hand's fields (12 tiles), so
  // a farm never grows where every zoned tile was cut into lots and it could only rest.
  if (t.method?.kind === 'farm' && fieldGround(state, lot, self) < FIELD_TILES_PER_WORKER) return false;
  return true;
}

/** siteMeets with a cache of its own (one lot, one trade). */
export function siteFits(state: WorldState, lot: Lot, t: TradeDef, self: EntityId = 0): boolean {
  return siteMeets(new SiteCache(state), lot, t, self);
}

/** True when some built specialized building of `defId` has room for one more business anywhere. */
export function anyRoom(cache: SiteCache, defId: string): boolean {
  for (const sb of cache.built(defId)) if (cache.servedBy(sb).length < cache.capacityOf(sb)) return true;
  return false;
}
