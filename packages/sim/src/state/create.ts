import { DEFAULT_SPEED } from '../constants';
import type { ValleySettings, WorldState } from '../contracts';
import { generateValley } from '../map/worldgen';
import { seedStreams, streamIndex } from '../rng/streams';
import { setupStandardStart } from '../systems/economy/start';
import { emptyHamletSlices } from './hamlet';
import { SAVE_VERSION } from './version';

export function defaultSettings(): ValleySettings {
  return {
    mode: 'sandbox',
    economy: 'gentle',
    threat: 'peaceful',
    togetherOnly: false,
    townName: 'Qoti',
    valleyName: 'Riverbend',
  };
}

/**
 * A fresh world from a seed: the generated valley, no seats yet, turn 0, tick 0. Standard valleys
 * [I1] also get the starting town (docs/spec/02-game-overview.md, New valley); sandbox valleys
 * stay empty.
 */
export function createWorld(seed: string, settings: ValleySettings): WorldState {
  const valley = generateValley(seed, settings);
  const rng = seedStreams(seed);
  rng.set(valley.worldgenRng, streamIndex('worldgen') * 4);
  const state: WorldState = {
    saveVersion: SAVE_VERSION,
    seed,
    settings: { ...settings },
    lastTurn: 0,
    tick: 0,
    time: { desired: [DEFAULT_SPEED, DEFAULT_SPEED, DEFAULT_SPEED, DEFAULT_SPEED], connected: [] },
    rng,
    nextId: 1,
    map: valley.map,
    meta: valley.meta,
    seats: [],
    buildings: [],
    decor: [],
    notes: [],
    ...emptyHamletSlices(),
  };
  if (settings.mode === 'standard') setupStandardStart(state);
  return state;
}

/** Same as createWorld; the name the I1 contracts use (createValley branches on settings.mode). */
export const createValley = createWorld;
