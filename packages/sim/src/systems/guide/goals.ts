// The first days guide's named predicates (C5H), for the goals a JSON condition cannot say well.
// Registered in conditions/code.ts, one line each. Pure: reads state, never writes.
import { content } from '@qoti/content';
import { LEDGER_CATEGORIES, MAP_SIZE } from '../../constants';
import type { Building, WorldState } from '../../contracts';
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
