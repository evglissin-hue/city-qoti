// Business levels (docs/spec/13-ledger.md, Levels; R1B builds it). Daily at 23:30, after the day's
// selling: a business moves up a level after three days running of steady custom, reliable inputs
// and room to grow (and, for level 3, its keeper's 20 working days until R3's masters); it slides
// back one level after four failing days, keeping its walls. Specialized buildings stay at 1.
import { content, type BuildingDef, type TradeDef } from '@qoti/content';
import { BUSINESS_LEVEL_MAX, MAP_SIZE, TICKS_PER_DAY, Zone } from '../../constants';
import type { Building, BusinessCounters, System, TickCtx, WorldState } from '../../contracts';
import { Road } from '../../map/layers';
import { entranceTiles, footprintSize } from '../../rules/footprint';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { emptyCounters, levelOf } from '../../state/zones';
import { businessView } from '../../view/businesses';
import { dailyOffset } from '../economy/time';
import { release } from '../residents/jobs';
import { outOfSeason } from './season';

/** Good days in a row that move a business up a level. */
export const LEVEL_UP_DAYS = 3;
/** Failing days in a row that move a business down a level. */
export const LEVEL_DOWN_DAYS = 4;
/** Customers a day a shop needs to hold level 2 and level 3 (and to climb toward them). */
export const SHOP_CUSTOMERS: readonly number[] = [6, 15];
/** Working days a keeper must have kept a business before level 3 (until R3's masters). */
export const KEEPER_DAYS_L3 = 20;
/** Free farm-zoned tiles needed in reach for each hand a farmstead's next level adds: a grain farm. */
export const FIELD_TILES_A_HAND = 12;
/** The same for any other farmland trade. */
export const FARM_TILES_A_HAND = 6;
/** How far (Chebyshev tiles from the footprint) a farmstead looks for ground to grow into. */
export const FARM_REACH = 8;

/** The street a business wants at its door for a level: a lane for level 2, a street for level 3. */
function roadNeeded(level: number): number {
  return level >= 3 ? Road.street : Road.lane;
}

/** Free farm-zoned tiles (no lot, no field) within FARM_REACH of the building's footprint. */
function freeFarmTiles(state: WorldState, b: Building, def: BuildingDef): number {
  const [w, d] = footprintSize(def, b.rot);
  const m = state.map;
  let n = 0;
  for (let z = Math.max(0, b.z - FARM_REACH); z < Math.min(MAP_SIZE, b.z + d + FARM_REACH); z++) {
    for (let x = Math.max(0, b.x - FARM_REACH); x < Math.min(MAP_SIZE, b.x + w + FARM_REACH); x++) {
      const i = z * MAP_SIZE + x;
      if (m.zone[i] === Zone.farms && m.lot[i] === 0 && m.fieldOwner[i] === 0) n++;
    }
  }
  return n;
}

/** Room to grow to level `to` (docs/spec/13-ledger.md, Levels: a street at the door, or free ground). */
export function roomToGrow(state: WorldState, b: Building, trade: TradeDef, to: number): boolean {
  const def = content.buildingById.get(b.def);
  if (!def) return false;
  if (trade.zone === 'farms') {
    const added = trade.crew[to - 1]! - trade.crew[to - 2]!;
    const per = trade.id === 'grain-farm' ? FIELD_TILES_A_HAND : FARM_TILES_A_HAND;
    return freeFarmTiles(state, b, def) >= per * added;
  }
  const { front } = entranceTiles(def, b.x, b.z, b.rot);
  return (state.map.road[front[1] * MAP_SIZE + front[0]] ?? 0) >= roadNeeded(to);
}

/** True when the business's day met the terms of its own level (custom and inputs). */
function holdsLevel(c: BusinessCounters, trade: TradeDef, level: number): boolean {
  if (c.shortToday) return false;
  if (!trade.method) return c.customersToday >= SHOP_CUSTOMERS[level - 2]!;
  return !(c.madeToday > 0 && c.soldToday * 5 < c.madeToday * 4);
}

/** True when the day was steady custom with reliable inputs (the next level's terms bar room and keeper). */
function steady(c: BusinessCounters, trade: TradeDef, level: number): boolean {
  if (c.shortToday) return false;
  if (!trade.method) return c.customersToday >= SHOP_CUSTOMERS[level - 1]!;
  return c.madeToday > 0 && c.soldToday * 5 >= c.madeToday * 4;
}

/** Hands past the level's crew go home, newest first, never mid-task or carrying. */
function trimCrew(state: WorldState, ctx: TickCtx, b: Building): void {
  const rt = b.rt;
  if (!rt) return;
  const crew = levelCrew(b);
  for (let i = rt.workers.length - 1; i >= 0 && rt.workers.length > crew; i--) {
    const r = findById(state.residents, rt.workers[i]!);
    if (!r || r.activity.kind === 'task' || r.carry) continue;
    release(state, r, false, ctx);
  }
}

function levelCrew(b: Building): number {
  const crew = content.tradeById.get(b.trade ?? '')?.crew;
  return crew ? crew[levelOf(b) - 1]! : 0;
}

/** One business's day end. */
function dayEnd(state: WorldState, ctx: TickCtx, b: Building): void {
  const trade = content.tradeById.get(b.trade ?? '');
  if (!trade || !b.rt) return;
  const c = (b.counters ??= emptyCounters());
  if (b.keeperId && !findById(state.residents, b.keeperId)) b.keeperId = 0;
  // Out of season: neither fails nor counts; its level and its keeper's days wait.
  if (!outOfSeason(state, b)) {
    const level = levelOf(b);
    const active = c.madeToday > 0 || c.customersToday > 0;
    if (b.keeperId && active && b.rt.workers.includes(b.keeperId)) c.keeperDays += 1;
    const up =
      level < BUSINESS_LEVEL_MAX &&
      steady(c, trade, level) &&
      roomToGrow(state, b, trade, level + 1) &&
      (level + 1 < 3 || c.keeperDays >= KEEPER_DAYS_L3);
    if (up) {
      c.levelDays = Math.max(0, c.levelDays) + 1;
      if (c.levelDays >= LEVEL_UP_DAYS) {
        b.level = level + 1;
        c.levelDays = 0;
      }
    } else if (level >= 2 && !holdsLevel(c, trade, level)) {
      c.levelDays = Math.min(0, c.levelDays) - 1;
      if (c.levelDays <= -LEVEL_DOWN_DAYS) {
        b.level = level - 1;
        c.levelDays = 0;
        trimCrew(state, ctx, b);
      }
    } else {
      c.levelDays = 0;
    }
  }
  c.madeToday = 0;
  c.soldToday = 0;
  c.customersToday = 0;
  c.shortToday = false;
  // One event a business a day keeps the Businesses book fresh (level, days, keeper, status).
  ctx.events.push({ e: 'business.updated', b: businessView(state, b) });
}

export const levels: System = {
  id: 'levels',
  order: 69,
  every: TICKS_PER_DAY,
  offset: dailyOffset(23, 100),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    for (const b of state.buildings) {
      if (b.trade && b.stage === 'built' && b.rt) dayEnd(state, ctx, b);
    }
  },
};
