// R2 (R2B): what evening streets do to deliveries (docs/spec/19-evenings.md, Evening streets). From
// 17:00 to 21:00 a stall or workshop whose door opens onto an evening street gets no delivery and
// sends nothing out (`eveningStreet`), and a cart or porter caught behind a closed stretch waits at
// its edge until 21:00 (`eveningWait` on its shed or store). Both are read from state, never saved.
import { BuildingStatus } from '../../constants';
import type { Building, Cart, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { methodOf } from '../../state/zones';
import { emitBuilding } from '../economy/emit';
import { doorTile } from '../movement/api';
import { pathBetween, pathFor } from '../movement/paths';
import { cartRoute, cartRouteIgnoringEvening, cartTile } from '../traffic/api';
import { closedTile, eveningClosed } from '../traffic/evening';
import { isCartShed, shedTile } from './carts';
import { defOf, isMarket, isStorage } from './stores';

/** The status bits this module owns. */
export const EVENING_BITS = BuildingStatus.eveningStreet | BuildingStatus.eveningWait;

/** True when a building takes goods in or gives them out through porters and carts. */
function tradesGoods(b: Building): boolean {
  const def = defOf(b);
  const rt = b.rt;
  if (!def || !rt) return false;
  if (b.stage === 'construction') return true;
  if (rt.upgrade || rt.moduleWork) return true;
  if (isMarket(def) || isStorage(def)) return true;
  const method = methodOf(b);
  return !!method && (method.inputs.length > 0 || method.outputs.length > 0);
}

/** True while deliveries to and from the building are off: closed hours, door on an evening street. */
export function onEveningStreet(state: WorldState, b: Building): boolean {
  return eveningClosed(state) && closedTile(state, doorTile(b));
}

/** The tile a cart is heading for: the door of its job's stop, or its shed's door. -1 when none. */
function cartTarget(state: WorldState, c: Cart): number {
  const job = c.job ? state.logistics.jobs.find((j) => j.id === c.job) : undefined;
  if (job) {
    const stop = findById(state.buildings, job.stage === 0 ? job.from : job.to);
    return stop ? doorTile(stop) : -1;
  }
  const shed = findById(state.buildings, c.home);
  return shed ? shedTile(state, shed) : -1;
}

/** True when a cart stands still because a closed evening street is the only way on. */
export function cartWaiting(state: WorldState, c: Cart): boolean {
  if (!eveningClosed(state) || c.move) return false;
  const target = cartTarget(state, c);
  if (target < 0 || target === c.tile || !cartTile(state, c.tile)) return false;
  return !cartRoute(state, c.tile, target) && !!cartRouteIgnoringEvening(state, c.tile, target);
}

/** The tile a tasked porter is heading for, or -1 (a builder, or no job). */
function porterTarget(state: WorldState, r: Resident): number {
  if (r.activity.kind !== 'task') return -1;
  const id = r.activity.taskId;
  if (id > 0) {
    const job = state.logistics.jobs.find((j) => j.id === id);
    const stop = job ? findById(state.buildings, job.stage === 0 ? job.from : job.to) : undefined;
    return stop ? doorTile(stop) : -1;
  }
  if (id === 0) {
    const work = r.jobId ? findById(state.buildings, r.jobId) : undefined;
    return work ? doorTile(work) : -1;
  }
  return -1;
}

/** True when a porter stands still because a closed evening street is the only way on for a barrow. */
export function porterWaiting(state: WorldState, r: Resident): boolean {
  if (!eveningClosed(state) || r.move) return false;
  const target = porterTarget(state, r);
  if (target < 0 || target === r.tile) return false;
  return pathFor(state, r.tile, target, 'barrow') === null && pathBetween(state, r.tile, target) !== null;
}

/** The evening status bits a building should carry right now. */
export function eveningBits(state: WorldState, b: Building): number {
  if (!b.rt || !eveningClosed(state)) return 0;
  let s = 0;
  if (tradesGoods(b) && onEveningStreet(state, b)) s |= BuildingStatus.eveningStreet;
  if (b.stage !== 'built') return s;
  if (isCartShed(b) && state.carts.some((c) => c.home === b.id && cartWaiting(state, c))) {
    s |= BuildingStatus.eveningWait;
  } else if (b.rt.workers.length > 0 && isStorage(defOf(b))) {
    for (const id of b.rt.workers) {
      const r = findById(state.residents, id);
      if (r && porterWaiting(state, r)) {
        s |= BuildingStatus.eveningWait;
        break;
      }
    }
  }
  return s;
}

/**
 * Keeps the two evening bits current between the hourly status passes: a street closing at 17:00,
 * a cart reaching its edge, the street opening at 21:00 all show within the match period.
 */
export function syncEveningStatus(state: WorldState, ctx: TickCtx): void {
  const closed = eveningClosed(state);
  for (const b of state.buildings) {
    const rt = b.rt;
    if (!rt) continue;
    if (!closed && !(rt.status & EVENING_BITS)) continue;
    const want = eveningBits(state, b);
    if ((rt.status & EVENING_BITS) === want) continue;
    rt.status = (rt.status & ~EVENING_BITS) | want;
    emitBuilding(state, ctx, b);
  }
}
