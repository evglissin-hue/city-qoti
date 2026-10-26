// Helpers for the Ledger tests (C3C): hiring, putting workers at work, running ticks.
import { content } from '@qoti/content';
import { NEED_IDS, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, EntityId, Resident, SimEvent, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { doorTile } from '../../src/systems/movement/api';
import { applyTurn, createTickCtx } from '../../src/turn';

export const good = (id: string): number => content.goodIndex.get(id)!;

export function building(state: WorldState, id: EntityId): Building {
  return findById(state.buildings, id)!;
}

export function resident(state: WorldState, id: EntityId): Resident {
  return findById(state.residents, id)!;
}

/** A new adult resident in the first household, unemployed and at home. */
export function newResident(state: WorldState, mood = 65): Resident {
  const h = state.households[0]!;
  const home = findById(state.buildings, h.homeId)!;
  const r: Resident = {
    id: state.nextId++,
    given: `Helper${state.nextId}`,
    family: h.family,
    species: 'rabbit',
    stage: 'adult',
    bornDay: -200,
    traits: ['cheerful', 'practical'],
    householdId: h.id,
    jobId: 0,
    tier: 'settler',
    mood,
    needs: NEED_IDS.map(() => 70),
    modifiers: [],
    bond: 1,
    friends: [],
    activity: { kind: 'home' },
    move: null,
    tile: doorTile(home),
    inside: home.id,
    carry: null,
    wishId: 0,
    history: [],
    flags: 0,
    look: 1,
  };
  state.residents.push(r);
  h.members.push(r.id);
  return r;
}

/** Gives a building `n` new workers (fresh residents) and returns their ids. */
export function hire(state: WorldState, buildingId: EntityId, n: number, mood = 65): EntityId[] {
  const b = building(state, buildingId);
  const ids: EntityId[] = [];
  for (let k = 0; k < n; k++) {
    const r = newResident(state, mood);
    r.jobId = b.id;
    b.rt!.workers.push(r.id);
    ids.push(r.id);
  }
  return ids;
}

/** Puts residents inside their workplace, as the schedule (C3A) does during work hours. */
export function toWork(state: WorldState, ids: readonly EntityId[]): void {
  for (const id of ids) {
    const r = resident(state, id);
    const b = building(state, r.jobId);
    r.activity = { kind: 'work', at: b.id };
    r.move = null;
    r.tile = doorTile(b);
    r.inside = b.id;
  }
  for (const b of state.buildings) {
    if (b.rt) b.rt.present = b.rt.workers.filter((w) => findById(state.residents, w)?.inside === b.id).length;
  }
}

/** Every worker of every building goes to work. */
export function everyoneToWork(state: WorldState): void {
  const ids: EntityId[] = [];
  for (const b of state.buildings) ids.push(...(b.rt?.workers ?? []));
  toWork(state, ids);
}

/** Runs `n` ticks at speed 1, calling `each` after every tick. Returns every event. */
export function ticks(state: WorldState, n: number, each?: (s: WorldState) => void): SimEvent[] {
  const ctx = createTickCtx(state);
  const events: SimEvent[] = [];
  state.time.desired = [1, 1, 1, 1];
  for (let i = 0; i < n; i++) {
    applyTurn(state, { t: state.lastTurn + 1, cmds: [] }, ctx);
    events.push(...ctx.events);
    ctx.events.length = 0;
    each?.(state);
  }
  return events;
}

/** Ticks until the clock reads `hour`:00 (the next time it does). */
export function untilHour(state: WorldState, hour: number, each?: (s: WorldState) => void): SimEvent[] {
  const now = (state.tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY;
  const target = hour * TICKS_PER_HOUR;
  const n = (target - now + TICKS_PER_DAY) % TICKS_PER_DAY || TICKS_PER_DAY;
  return ticks(state, n, each);
}

export function stockOf(b: Building, where: 'store' | 'input' | 'output', id: string): number {
  return b.rt![where][good(id)]!;
}
