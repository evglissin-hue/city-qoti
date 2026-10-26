// Helpers for the residents and movement tests (C3A). The shared hamlet fixture stays untouched.
import { content } from '@qoti/content';
import { MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, EntityId, Resident, Rot4, SimEvent, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { tickOfDay } from '../../src/systems/residents/time';
import { withoutSystems } from '../../src/systems';
import { applyTurn, createTickCtx, type SimCtx } from '../../src/turn';

export const S = MAP_SIZE;

export function tileOf(x: number, z: number): number {
  return z * S + x;
}

/** A context that keeps every event it sees (tests read them after). */
export interface Runner {
  state: WorldState;
  ctx: SimCtx;
  events: SimEvent[];
  /** Systems switched off for this runner. */
  skip: readonly string[];
}

/**
 * The Ledger's systems (C3C) are off by default: these tests are about residents, and porters
 * taking workers on tasks or the hourly job rebalance would blur them. `all` runs everything.
 */
export function runner(state: WorldState, opts: { all?: boolean } = {}): Runner {
  if (state.time.connected.length === 0) state.time.connected = [0];
  const skip = opts.all ? [] : ['construction', 'production', 'logistics', 'economy'];
  return { state, ctx: createTickCtx(state), events: [], skip };
}

/** Runs n empty turns (one tick each at speed 1). */
export function ticks(run: Runner, n: number): void {
  withoutSystems(run.skip, () => {
    for (let i = 0; i < n; i++) {
      applyTurn(run.state, { t: run.state.lastTurn + 1, cmds: [] }, run.ctx);
      if (run.ctx.events.length) {
        for (const e of run.ctx.events) run.events.push(e);
        run.ctx.events.length = 0;
      }
    }
  });
}

/** Runs until the clock shows `hour` (fractions allowed), at most a day ahead. */
export function untilHour(run: Runner, hour: number): void {
  const target = Math.round(hour * TICKS_PER_HOUR) % TICKS_PER_DAY;
  for (let i = 0; i <= TICKS_PER_DAY && tickOfDay(run.state.tick) !== target; i++) ticks(run, 1);
}

/** Runs until pred holds or max ticks pass; returns whether it held. */
export function until(run: Runner, pred: () => boolean, max: number): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    ticks(run, 1);
  }
  return pred();
}

export function resident(state: WorldState, id: EntityId): Resident {
  const r = findById(state.residents, id);
  if (!r) throw new Error(`no resident ${id}`);
  return r;
}

export function placeBuilding(state: WorldState, def: string, x: number, z: number, rot: Rot4 = 0): Building {
  return insertBuilding(state, null, content.buildingById.get(def)!, x, z, rot, 0, { site: false });
}

export function eventsOf<K extends SimEvent['e']>(run: Runner, kind: K): Extract<SimEvent, { e: K }>[] {
  return run.events.filter((e): e is Extract<SimEvent, { e: K }> => e.e === kind);
}
