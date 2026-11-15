// A fresh standard valley zoned the zones-first way (as test/r1/fresh-valley.test.ts does), for R1B's
// labor, keeper and level tests: Homes, Workshops and Farmland along the start path on day 0.
import { content } from '@qoti/content';
import { expect } from 'vitest';
import { MAP_SIZE, MAX_ZONE_TILES, TICKS_PER_DAY } from '../../src/constants';
import type { Command, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { createWorld, defaultSettings } from '../../src/state/create';
import { createTickCtx, runTick } from '../../src/turn';
import { rejection, run } from '../helpers';

const S = MAP_SIZE;

export function standardValley(seed: string): WorldState {
  return createWorld(seed, { ...defaultSettings(), mode: 'standard' });
}

function pathTiles(state: WorldState): number[] {
  const out: number[] = [];
  const [x0, z0, x1, z1] = state.meta.startArea;
  for (let z = Math.max(0, z0 - 12); z <= Math.min(S - 1, z1 + 12); z++)
    for (let x = Math.max(0, x0 - 12); x <= Math.min(S - 1, x1 + 12); x++)
      if (state.map.road[z * S + x] === Road.path) out.push(z * S + x);
  return out;
}

function zoneCommands(state: WorldState): Command[] {
  const across: [number, number] = state.meta.flow === 'ns' ? [1, 0] : [0, 1];
  const path = pathTiles(state);
  const byZone = new Map<string, [number, number][]>([
    ['homes-low', []],
    ['crafts', []],
    ['farms', []],
  ]);
  path.forEach((t, k) => {
    const x = t % S;
    const z = Math.floor(t / S);
    const near = k < path.length / 3 ? 'homes-low' : k < (2 * path.length) / 3 ? 'crafts' : 'farms';
    for (let d = 1; d <= 3; d++) {
      byZone.get(near)!.push([x + across[0] * d, z + across[1] * d]);
      byZone.get('farms')!.push([x - across[0] * d, z - across[1] * d]);
    }
  });
  const cmds: Command[] = [];
  for (const [zone, tiles] of byZone) {
    const inside = tiles.filter(([x, z]) => x >= 0 && z >= 0 && x < S && z < S);
    for (let i = 0; i < inside.length; i += MAX_ZONE_TILES)
      cmds.push({ t: 'zone.paint', zone, tiles: inside.slice(i, i + MAX_ZONE_TILES) });
  }
  return cmds;
}

/** A fresh valley with both seats joined and the zones painted, at tick 0 (day 0). */
export function zonedValley(seed: string): WorldState {
  const state = standardValley(seed);
  run(state, { t: 'sys.seatJoined', seat: 0 }, 0);
  run(state, { t: 'sys.seatJoined', seat: 1 }, 1);
  let seq = 1;
  for (const cmd of zoneCommands(state)) expect(rejection(run(state, cmd, 1, seq++)), cmd.t).toBeUndefined();
  return state;
}

/** Runs `days` days, calling `daily` at the end of each (any throw fails). */
export function playDays(state: WorldState, days: number, daily?: (day: number) => void): void {
  let ctx = createTickCtx(state);
  for (let d = 0; d < days; d++) {
    const end = state.tick + TICKS_PER_DAY;
    while (state.tick < end) {
      runTick(state, ctx);
      if (ctx.events.length > 5000) ctx = createTickCtx(state);
    }
    daily?.(d + 1);
  }
}

/** Residents who work, and how many of them have a job in a business or a food-making building. */
export function foodShare(state: WorldState): {
  working: number;
  food: number;
  byDef: Record<string, number>;
} {
  let working = 0;
  let food = 0;
  const byDef: Record<string, number> = {};
  for (const r of state.residents) {
    if (!r.jobId) continue;
    const b = state.buildings.find((x) => x.id === r.jobId);
    if (!b) continue;
    working++;
    byDef[b.trade ?? b.def] = (byDef[b.trade ?? b.def] ?? 0) + 1;
    const m = b.trade
      ? content.tradeById.get(b.trade)?.method
      : content.buildingById.get(b.def)?.methods?.[0];
    const makesFood =
      m?.kind === 'farm' || m?.outputs.some(([g]) => content.goodById.get(g)?.family === 'food');
    if (makesFood) food++;
  }
  return { working, food, byDef };
}
