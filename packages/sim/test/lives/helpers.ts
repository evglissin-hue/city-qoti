// Helpers for the C4D tests (lives, stories, plans, requests, the Charter). They build on the shared
// village fixture without changing it.
import { content, type BuildingDef } from '@qoti/content';
import { MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR, TILE_FP } from '../../src/constants';
import type { Command, EntityId, Resident, SeatId, SimEvent, TickCtx, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { tickOfDay } from '../../src/systems/residents/time';
import { createTickCtx, executeCommand } from '../../src/turn';

export const S = MAP_SIZE;

/** Runs one command outside the tick pipeline; returns whether it was accepted. */
export function exec(
  state: WorldState,
  cmd: Command,
  seat: SeatId = 0,
  ctx: TickCtx = createTickCtx(state),
): boolean {
  return executeCommand(state, { seat, seq: 1, cmd }, ctx);
}

/** Places decor on the first free tile center within `radius` tiles of (x, z), nearest first. */
export function placeDecorNear(
  state: WorldState,
  def: string,
  x: number,
  z: number,
  radius: number,
): boolean {
  for (let r = 0; r <= radius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const fx = (x + dx) * TILE_FP + TILE_FP / 2;
        const fz = (z + dz) * TILE_FP + TILE_FP / 2;
        if (exec(state, { t: 'decor.place', def, fx, fz, rot: 0 })) return true;
      }
    }
  }
  return false;
}

/** Moves the clock on (state only; no systems run). */
export function skip(state: WorldState, ticks: number): void {
  state.tick += ticks;
  state.lastTurn += ticks;
}

/** Moves the clock to the next `hour`:00 (at least one tick ahead). */
export function skipToHour(state: WorldState, hour: number): void {
  const target = hour * TICKS_PER_HOUR;
  let n = (target - tickOfDay(state.tick) + TICKS_PER_DAY) % TICKS_PER_DAY;
  if (n === 0) n = TICKS_PER_DAY;
  skip(state, n);
}

export function resident(state: WorldState, id: EntityId): Resident {
  const r = findById(state.residents, id);
  if (!r) throw new Error(`no resident ${id}`);
  return r;
}

export function eventsOf<K extends SimEvent['e']>(
  events: SimEvent[],
  kind: K,
): Extract<SimEvent, { e: K }>[] {
  return events.filter((e): e is Extract<SimEvent, { e: K }> => e.e === kind);
}

/** Two residents become close friends (both ways). */
export function befriend(a: Resident, b: Resident, level: number): void {
  const points = [0, 10, 30, 60, 100, 150][level]!;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const f = x.friends.find((q) => q.id === y.id);
    if (f) {
      f.level = level;
      f.points = points;
    } else {
      x.friends.push({ id: y.id, level, points, lastMet: 0 });
      x.friends.sort((p, q) => p.id - q.id);
    }
  }
}

/**
 * Adds a building def to content for one test (a school or a Trading Post before C4C ships them),
 * and returns a function that takes it out again.
 */
export function withTestBuilding(def: BuildingDef): () => void {
  const list = content.buildings as BuildingDef[];
  const byId = content.buildingById as Map<string, BuildingDef>;
  list.push(def);
  byId.set(def.id, def);
  return () => {
    list.splice(list.indexOf(def), 1);
    byId.delete(def.id);
  };
}

/** A plain 2x2 service building with a tag, drawn with the well's kit, for tests. */
export function testDef(id: string, tags: string[], extra: Partial<BuildingDef> = {}): BuildingDef {
  const base = content.buildingById.get('cottage')!;
  return { ...base, id, name: id, category: 'service', tags, housing: undefined, ...extra } as BuildingDef;
}

export function placeTest(state: WorldState, def: BuildingDef, x: number, z: number): EntityId {
  return insertBuilding(state, null, def, x, z, 0, 0, { site: false }).id;
}
