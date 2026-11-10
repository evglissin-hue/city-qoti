// R1.0: a new standard valley starts the zones-first way (docs/spec/02-game-overview.md, Standard
// valley from R1), and with Homes, Workshops and Farmland zoned along the start path on day 0 it
// plays ten in-game days with no error, the money invariant holding, a farmstead business grown,
// and the same hash from two identical runs.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MAX_ZONE_TILES, PENNIES_PER_COIN, TICKS_PER_DAY } from '../../src/constants';
import type { Command, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { createWorld, defaultSettings } from '../../src/state/create';
import { hashState } from '../../src/state/hash';
import { createTickCtx, runTick } from '../../src/turn';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const S = MAP_SIZE;
const DAYS = 10;

function standardValley(seed: string): WorldState {
  return createWorld(seed, { ...defaultSettings(), mode: 'standard' });
}

function storeOf(state: WorldState, def: string): number[] {
  const b = state.buildings.find((x) => x.def === def);
  expect(b, def).toBeDefined();
  return b!.rt!.store;
}

const qty = (store: number[], good: string): number => store[content.goodIndex.get(good)!] ?? 0;

/** The start path's tiles, sorted by index (the path the standard start lays). */
function pathTiles(state: WorldState): number[] {
  const out: number[] = [];
  const [x0, z0, x1, z1] = state.meta.startArea;
  for (let z = Math.max(0, z0 - 12); z <= Math.min(S - 1, z1 + 12); z++)
    for (let x = Math.max(0, x0 - 12); x <= Math.min(S - 1, x1 + 12); x++)
      if (state.map.road[z * S + x] === Road.path) out.push(z * S + x);
  return out;
}

/**
 * Zone commands along the start path: tiles one to three steps off it, on both sides across the
 * flow. The first third of the path gets Homes, the middle Workshops, the last Farmland, and the
 * far side Farmland all along.
 */
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

/** Day 0: the seats join and paint the zones; then DAYS days run tick by tick (any throw fails). */
function play(seed: string): WorldState {
  const state = standardValley(seed);
  const before = moneySnapshot(state);
  run(state, { t: 'sys.seatJoined', seat: 0 }, 0);
  run(state, { t: 'sys.seatJoined', seat: 1 }, 1);
  let seq = 1;
  for (const cmd of zoneCommands(state)) expect(rejection(run(state, cmd, 1, seq++)), cmd.t).toBeUndefined();
  let ctx = createTickCtx(state);
  const end = state.tick + DAYS * TICKS_PER_DAY;
  while (state.tick < end) {
    runTick(state, ctx);
    if (ctx.events.length > 5000) ctx = createTickCtx(state);
  }
  expectMoneyInvariant(before, state);
  return state;
}

describe('R1 fresh standard valley', () => {
  for (const seed of ['willow', 'hazel']) {
    describe(seed, () => {
      let first: WorldState | null = null;
      const played = (): WorldState => (first ??= play(seed));
      it('starts with the R1 town: hall, storehouse, granary, two cottages, a well, 500 coins', () => {
        const state = standardValley(seed);
        const defs = state.buildings.map((b) => b.def).sort();
        expect(defs).toEqual(['cottage', 'cottage', 'granary', 'storehouse', 'town-hall', 'well']);
        expect(state.economy.treasury).toBe(500 * PENNIES_PER_COIN);
        const store = storeOf(state, 'storehouse');
        expect(qty(store, 'timber')).toBe(60);
        expect(qty(store, 'stone')).toBe(30);
        const granary = storeOf(state, 'granary');
        expect(qty(granary, 'grain')).toBe(20);
        expect(qty(granary, 'vegetables')).toBe(16);
        expect(qty(granary, 'fish')).toBe(8);
        expect(pathTiles(state).length).toBeGreaterThan(0);
      });

      it('plays ten days zoned along the start path: money holds, a farmstead business grows', () => {
        const state = played();
        const farms = state.buildings.filter((b) => b.def === 'farmstead');
        expect(farms.length).toBeGreaterThan(0);
        for (const b of farms) {
          expect(b.trade, `farmstead #${b.id}`).toBeDefined();
          expect(content.tradeById.get(b.trade!)?.zone).toBe('farms');
        }
        // The growth pass wrote the demand bars.
        expect(state.demand.bars).toHaveLength(4);
        // The carrier kept its record a day at a time.
        expect(state.carrier.bought.length).toBe(state.carrier.sold.length);
      });

      it('plays the same twice: equal hashes', () => {
        expect(hashState(play(seed))).toBe(hashState(played()));
      });
    });
  }
});
