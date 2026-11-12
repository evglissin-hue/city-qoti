// The first days guide's named predicates (C5H), for the goals a JSON condition cannot say well.
// Registered in conditions/code.ts, one line each. Pure: reads state, never writes.
import { content } from '@qoti/content';
import { FIELD_GOOD_FERTILITY, LEDGER_CATEGORIES, MAP_SIZE } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { isHomeDef } from '../../conditions/geo';
import { findRoute } from '../../conditions/route';
import { doorTileOf } from '../movement/api';

/** Spending the guide counts as building the town, not running it: left out of "in the black". */
const INVESTMENT: readonly string[] = ['construction', 'roads', 'fields', 'terraforming'];

/**
 * A workplace of the players' own (a site counts: the lane comes first) whose door stands on a road
 * that reaches the valley gate without leaving the road. The founding town hall and storehouse do
 * not count, so the starting lane alone never ticks it.
 */
export function guideLane(state: WorldState): boolean {
  const [gx, gz] = state.meta.valleyGate;
  const gate = gz * MAP_SIZE + gx;
  for (const b of state.buildings) {
    if (!isOwnWorkplace(b)) continue;
    const door = doorTileOf(state, b.id);
    if (door >= 0 && findRoute(state, door, gate, true)) return true;
  }
  return false;
}

function isOwnWorkplace(b: Building): boolean {
  const def = content.buildingById.get(b.def);
  if (!def?.jobs || def.category === 'civic') return false;
  return !def.tags?.includes('storehouse');
}

/**
 * R1 (R1D): homes zoned and the first `built` (default 2) raised on their lots. Homes grow only on
 * zoned land, so a home on a lot is the proof of both; the founding cottages have no lot.
 */
export function guideHomes(state: WorldState, _bind: unknown, params: readonly [string, number][]): boolean {
  const need = paramOf(params, 'built', 2);
  let n = 0;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.lot || !isHomeDef(content.buildingById.get(b.def))) continue;
    if (++n >= need) return true;
  }
  return false;
}

const FARMS_LAYER = content.zones.find((z) => z.id === 'farms')?.layerValue ?? -1;

/** R1 (R1D): at least `tiles` (default 9) tiles zoned Farmland on good soil (FIELD_GOOD_FERTILITY). */
export function guideFarmland(
  state: WorldState,
  _bind: unknown,
  params: readonly [string, number][],
): boolean {
  const need = paramOf(params, 'tiles', 9);
  const m = state.map;
  let n = 0;
  for (let i = 0; i < m.zone.length; i++) {
    if (m.zone[i] !== FARMS_LAYER || m.fertility[i]! < FIELD_GOOD_FERTILITY) continue;
    if (++n >= need) return true;
  }
  return false;
}

function paramOf(params: readonly [string, number][], name: string, fallback: number): number {
  for (const [k, v] of params) if (k === name) return v;
  return fallback;
}

/** A fishery, or a farmstead business, built, with someone on its books. */
export function guideFoodWorked(state: WorldState): boolean {
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || b.rt.workers.length === 0) continue;
    if (b.def === 'fishery' || (b.def === 'farmstead' && !!b.trade)) return true;
  }
  return false;
}

/**
 * Yesterday's books in the black: what came in beat what it cost to run the town. Building (sites,
 * roads, fields, terraforming) is left out, as an investment rather than a running cost.
 */
export function guideInBlack(state: WorldState): boolean {
  return runningBalance(state.economy.yesterday.money) > 0;
}

/** Income minus running costs, in pennies, for one ledger period's money column. */
export function runningBalance(money: readonly number[]): number {
  let net = 0;
  for (let i = 0; i < LEDGER_CATEGORIES.length; i++) {
    const c = LEDGER_CATEGORIES[i]!;
    const v = money[i] ?? 0;
    if (c.kind === 'income') net += v;
    else if (!INVESTMENT.includes(c.id)) net -= v;
  }
  return net;
}
