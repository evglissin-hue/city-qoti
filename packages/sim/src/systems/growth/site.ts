// The site term of the trade score (docs/spec/13-ledger.md, Choosing a trade): does a lot meet what
// a trade wants of its ground? Soil (average fertility), pollinators in its chunk, a specialized
// building's reach with room under its capacity, households in reach for a shop. A business already
// standing asks the same of its own lot, counting itself among the served, so a third baker in a
// windmill's reach of two finds no room while the first two do (`siteDays`, retooling).
import { content, type TradeDef } from '@qoti/content';
import { HABITAT_IDS, MAP_SIZE } from '../../constants';
import type { Building, EntityId, Lot, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { hasTag } from '../../state/zones';
import { doorTile } from '../movement/api';
import { chunkOfTile, scoreAt } from '../nature/habitats';
import { capacityOf, withinReach } from '../specialized/api';
import { lotMiddle } from './desirability';

const S = MAP_SIZE;
const POLLINATOR = (HABITAT_IDS as readonly string[]).indexOf('pollinator');

/** Households whose door lies within this many tiles (straight line) of a shop lot's middle. */
export const SHOP_REACH = 14;

/**
 * Per-pass memory of who each specialized building serves (ids in reach, by id), so a night that
 * checks many lots walks each reach once. Derived, never saved; build one per pass.
 */
export class SiteCache {
  private readonly served = new Map<EntityId, EntityId[]>();
  private readonly households = new Map<EntityId, number>();

  constructor(readonly state: WorldState) {}

  /** Businesses of the trades `sb` enables whose door lies in its reach, sorted by id. */
  servedBy(sb: Building): EntityId[] {
    let ids = this.served.get(sb.id);
    if (!ids) {
      const def = content.buildingById.get(sb.def);
      const enables = def?.enables ?? [];
      ids = [];
      if (enables.length > 0) {
        for (const o of this.state.buildings) {
          if (o.id === sb.id || !enables.some((t) => hasTag(o, t))) continue;
          if (withinReach(this.state, sb, doorTile(o))) ids.push(o.id);
        }
      }
      ids.sort((a, b) => a - b);
      this.served.set(sb.id, ids);
    }
    return ids;
  }

  /** Household doors within SHOP_REACH of the lot's middle (the shop's custom; footfall from R2). */
  householdsNear(lot: Lot): number {
    let n = this.households.get(lot.id);
    if (n === undefined) {
      const [x, z] = lotMiddle(lot);
      n = 0;
      for (const h of this.state.households) {
        const home = findById(this.state.buildings, h.homeId);
        if (!home) continue;
        const door = doorTile(home);
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
  for (const sb of state.buildings) {
    if (sb.def !== defId || sb.stage !== 'built') continue;
    if (!withinReach(state, sb, tile)) continue;
    const cap = capacityOf(state, sb);
    const ids = cache.servedBy(sb);
    if (self) {
      const k = ids.indexOf(self);
      if (k >= 0 ? k < cap : ids.length < cap) return true;
    } else if (ids.length < cap) return true;
  }
  return false;
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
  return true;
}

/** siteMeets with a cache of its own (one lot, one trade). */
export function siteFits(state: WorldState, lot: Lot, t: TradeDef, self: EntityId = 0): boolean {
  return siteMeets(new SiteCache(state), lot, t, self);
}

/** True when some built specialized building of `defId` has room for one more business anywhere. */
export function anyRoom(cache: SiteCache, defId: string): boolean {
  for (const sb of cache.state.buildings) {
    if (sb.def !== defId || sb.stage !== 'built') continue;
    if (cache.servedBy(sb).length < capacityOf(cache.state, sb)) return true;
  }
  return false;
}
