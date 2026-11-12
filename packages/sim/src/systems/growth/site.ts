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
import { capacityOf, withinReach } from '../specialized/api';
import { lotMiddle } from './desirability';

const S = MAP_SIZE;
const POLLINATOR = (HABITAT_IDS as readonly string[]).indexOf('pollinator');
/** Tiles around a lot a grain farm's fields may lie in (as the growth pass gives them). */
export const FIELD_WINDOW = 8;

/** Households whose door lies within this many tiles (straight line) of a shop lot's middle. */
export const SHOP_REACH = 14;

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
  private readonly doorOf = new Map<EntityId, number>();

  constructor(readonly state: WorldState) {}

  /** Who is served may have changed (a business grew or retooled): forget it. */
  reset(): void {
    this.served.clear();
    this.households.clear();
    this.byDef.clear();
    this.byTrade = null;
    this.doors = null;
  }

  /**
   * A business just grew: it joins the served lists of the specialized buildings whose reach holds
   * its door (cheaper than a reset, which walks every reach again).
   */
  /** A business turned to another trade: it leaves the lists it was on and joins those it now fits. */
  retooled(b: Building): void {
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
      // As servedIds (specialized/api), from the index rather than every building.
      const enables = content.buildingById.get(sb.def)?.enables ?? [];
      const seen = new Set<EntityId>();
      ids = [];
      const index = this.tradeIndex();
      for (const t of enables) {
        for (const o of index.get(t) ?? []) {
          if (o.id === sb.id || seen.has(o.id)) continue;
          seen.add(o.id);
          if (withinReach(this.state, sb, this.door(o))) ids.push(o.id);
        }
      }
      ids.sort((a, b) => a - b);
      this.served.set(sb.id, ids);
    }
    return ids;
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
  for (const sb of cache.built(defId)) {
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
  if (w.households !== undefined && cache.householdsNear(lot) < w.households) return false;
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
