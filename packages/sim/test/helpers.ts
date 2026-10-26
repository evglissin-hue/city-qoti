import { MAP_SIZE } from '../src/constants';
import type { Command, MapReader, SeatId, Turn, WorldState } from '../src/contracts';
import { createLayers, Terrain, Water } from '../src/map/layers';
import { seedStreams } from '../src/rng/streams';
import { defaultSettings } from '../src/state/create';
import { emptyHamletSlices } from '../src/state/hamlet';
import { emptyVillageSlices } from '../src/state/village';
import { SAVE_VERSION } from '../src/state/version';
import { worldIndex } from '../src/state/worldIndex';
import { applyTurn, createTickCtx, type SimCtx } from '../src/turn';

export const S = MAP_SIZE;

/**
 * A predictable world: grass at height 2 everywhere, a river column at x = 100 (x 100 and 101),
 * a cliff block at x 20..29, z 20..29 (height 6) and seats 0 and 1 connected.
 */
export function flatWorld(): WorldState {
  const map = createLayers(S);
  map.height.fill(2);
  map.terrain.fill(Terrain.grass);
  for (let z = 0; z < S; z++) {
    for (const x of [100, 101]) {
      const i = z * S + x;
      map.water[i] = Water.river;
      map.terrain[i] = Terrain.water;
      map.height[i] = 0;
    }
  }
  for (let z = 20; z < 30; z++) for (let x = 20; x < 30; x++) map.height[z * S + x] = 6;
  return {
    saveVersion: SAVE_VERSION,
    seed: 'flat',
    settings: defaultSettings(),
    lastTurn: 0,
    tick: 0,
    time: { desired: [1, 1, 1, 1], connected: [0, 1] },
    rng: seedStreams('flat'),
    nextId: 1,
    map,
    meta: { startArea: [40, 40, 63, 63], valleyGate: [0, 50], flow: 'ns' },
    seats: [
      { seat: 0, name: 'Ada', color: 0xd9822b, lens: 'hearth', lastSeenTick: 0 },
      { seat: 1, name: 'Bo', color: 0x2b8fd9, lens: 'ledger', lastSeenTick: 0 },
    ],
    buildings: [],
    decor: [],
    notes: [],
    ...emptyHamletSlices(),
    ...emptyVillageSlices(),
  };
}

export function reader(state: WorldState): MapReader {
  return worldIndex(state).reader;
}

/** Applies one command as a full turn and returns the context with its events. */
export function run(state: WorldState, cmd: Command, seat: SeatId = 0, seq = 1): SimCtx {
  const ctx = createTickCtx(state);
  const turn: Turn = { t: state.lastTurn + 1, cmds: [{ seat, seq, cmd }] };
  applyTurn(state, turn, ctx);
  return ctx;
}

export function rejection(ctx: SimCtx): string | undefined {
  const e = ctx.events.find((ev) => ev.e === 'command.rejected');
  return e && e.e === 'command.rejected' ? e.reason : undefined;
}

export function tile(state: WorldState, layer: keyof WorldState['map'], x: number, z: number): number {
  return state.map[layer][z * S + x]!;
}
