// Production arithmetic shared by the production system, its status refresh and the building
// inspector. Work is counted in percent-worker-ticks: each worker present adds their mood
// productivity (MOOD_PRODUCTIVITY, 100 for a Content worker) every tick, scaled by the building's
// condition and any height bonus. A cycle needs `hours` of its full crew at 100%, or of one worker
// for per-worker methods, so output scales with the share of the crew present.
import type { BuildingDef, ProductionMethod } from '@qoti/content';
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, BuildingRuntime, TickCtx, WorldState } from '../../contracts';
import { footprintSize } from '../../rules/footprint';
import { findById } from '../../state/entities';
import { chronicle } from '../chronicle/api';
import { productivity } from '../logistics/tasks';

/** Condition below which output drops 10%, and below which it drops 30% (disrepair). */
export const WORN_CONDITION = 70;
export const DISREPAIR_CONDITION = 40;

export { cycleWork } from './cycle';

/** Output percent from condition: 100, 90 when worn, 70 in disrepair. */
export function conditionPercent(rt: BuildingRuntime): number {
  return rt.condition < DISREPAIR_CONDITION ? 70 : rt.condition < WORN_CONDITION ? 90 : 100;
}

/** 100, or 100 plus the method's bonus when the building stands high enough (windmills). */
export function heightPercent(
  state: WorldState,
  b: Building,
  def: BuildingDef,
  method: ProductionMethod,
): number {
  const bonus = method.heightBonus;
  if (!bonus) return 100;
  const [w, d] = footprintSize(def, b.rot);
  let top = 0;
  for (let z = b.z; z < b.z + d; z++) {
    for (let x = b.x; x < b.x + w; x++) top = Math.max(top, state.map.height[z * MAP_SIZE + x]!);
  }
  return top >= bonus.heightMin ? 100 + bonus.percent : 100;
}

/**
 * Sum of the mood productivity of workers inside the building, counting at most `cap` workers.
 * Zero when nobody is in.
 */
export function crewPower(state: WorldState, b: Building, rt: BuildingRuntime, cap: number): number {
  let power = 0;
  let n = 0;
  for (const id of rt.workers) {
    if (n >= cap) break;
    const r = findById(state.residents, id);
    if (!r || r.inside !== b.id) continue;
    power += productivity(r);
    n++;
  }
  return power;
}

/**
 * Adds produced goods to a building's output and the books. The first unit of a good ever made
 * writes a Chronicle line.
 */
export function produce(state: WorldState, ctx: TickCtx, b: Building, good: number, qty: number): void {
  if (qty <= 0) return;
  const rt = b.rt!;
  rt.output[good]! += qty;
  rt.producedToday[good]! += qty;
  bookProduced(state, ctx, b, good, qty);
}

/** Books goods made (in a building or by clearing a site) in the ledger and everProduced. */
export function bookProduced(state: WorldState, ctx: TickCtx, b: Building, good: number, qty: number): void {
  if (qty <= 0) return;
  const e = state.economy;
  e.today.produced[good]! += qty;
  e.season.produced[good]! += qty;
  const first = e.everProduced[good] === 0;
  e.everProduced[good]! += qty;
  if (first) {
    const g = content.goods[good]!;
    chronicle(state, ctx, 'first-of', { text: [['good', g.name.toLowerCase()]], refs: [b.id] });
  }
}

/** Books goods used up as production inputs. */
export function consume(state: WorldState, good: number, qty: number): void {
  const e = state.economy;
  e.today.consumed[good]! += qty;
  e.season.consumed[good]! += qty;
}
