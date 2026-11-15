// R1 (R1D): the wishes' named predicates (docs/spec/12-hearth.md, Wishes, the [R1] note), for the
// rules a JSON condition cannot say well. Registered in conditions/code.ts, one line each. Pure:
// reads state, never writes.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../constants';
import type { WorldState } from '../../../contracts';
import type { Binding } from '../../../conditions';
import { buildingRect, rectGap2, within } from '../../../conditions/geo';
import { findById } from '../../../state/entities';
import { doorTile } from '../../movement/api';
import { withinReach } from '../../specialized/api';

const S = MAP_SIZE;

function param(params: readonly [string, number][], name: string, fallback: number): number {
  for (const [k, v] of params) if (k === name) return v;
  return fallback;
}

/**
 * The achievable check for a wish naming a trade (`ref`, e.g. 'baker'): a business of that trade
 * could open within `within` (default 12) tiles of home, because land zoned for its trade lies
 * there and, when the trade wants a reach (a baker, a windmill's), that land is inside the reach of
 * one that stands. Zoned land that already holds a building still counts: businesses retool.
 */
export function tradeCouldOpen(
  state: WorldState,
  bind: Binding,
  params: readonly [string, number][],
  ref?: string,
): boolean {
  const trade = ref ? content.tradeById.get(ref) : undefined;
  const home = bind.home ? findById(state.buildings, bind.home) : undefined;
  if (!trade || !home) return false;
  const layer = content.zoneById.get(trade.zone)?.layerValue;
  if (layer === undefined) return false;
  const n = param(params, 'within', 12);
  const r = buildingRect(home);
  const mills = trade.wants.reach
    ? state.buildings.filter((b) => b.def === trade.wants.reach && b.stage === 'built')
    : null;
  if (mills && mills.length === 0) return false;
  for (let z = Math.max(0, r[1] - n); z <= Math.min(S - 1, r[3] + n); z++) {
    for (let x = Math.max(0, r[0] - n); x <= Math.min(S - 1, r[2] + n); x++) {
      const i = z * S + x;
      if (state.map.zone[i] !== layer || !within(rectGap2([x, z, x, z], r), n)) continue;
      if (!mills || mills.some((m) => withinReach(state, m, i))) return true;
    }
  }
  return false;
}

/**
 * At least `atLeast` (default 1) of the good `ref` on a shelf in reach of home: a market stall or
 * square holding it whose food reach (its coverage radius, else its reach) covers the home's door.
 */
export function shelfInReach(
  state: WorldState,
  bind: Binding,
  params: readonly [string, number][],
  ref?: string,
): boolean {
  const good = ref ? content.goodIndex.get(ref) : undefined;
  const home = bind.home ? findById(state.buildings, bind.home) : undefined;
  if (good === undefined || !home) return false;
  const need = param(params, 'atLeast', 1);
  const door = doorTile(home);
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || (b.rt.store[good] ?? 0) < need) continue;
    const def = content.buildingById.get(b.def);
    if (!def?.tags?.includes('market')) continue;
    const reach = def.coverage?.find((c) => c.kind === 'food')?.radius ?? def.reach ?? 14;
    const d = doorTile(b, def);
    const dx = (d % S) - (door % S);
    const dz = Math.floor(d / S) - Math.floor(door / S);
    if (dx * dx + dz * dz <= reach * reach) return true;
  }
  return false;
}
