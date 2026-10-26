// Test helpers for the Hearth systems (C3B): build pieces straight into state, recompute charm,
// run the sim for a while. The shared hamlet fixture stays untouched.
import { content } from '@qoti/content';
import { MAP_SIZE, TICKS_PER_HOUR, TILE_FP } from '../../src/constants';
import type { Building, Decor, EntityId, Rot4, SeatId, WorldState } from '../../src/contracts';
import { Road, treeValue, TREE_SPECIES } from '../../src/map/layers';
import { decorRunSegments } from '../../src/rules/decor';
import { insertBuilding } from '../../src/state/place';
import { worldIndex } from '../../src/state/worldIndex';
import { recomputeDirty } from '../../src/systems/hearth/charm';
import { markChunks } from '../../src/systems/hearth/charm/dirty';
import { createTickCtx, type SimCtx, advanceTo } from '../../src/turn';
import { flatWorld } from '../helpers';

export const S = MAP_SIZE;

/** The flat test world in standard mode with nothing built. */
export function standardWorld(): WorldState {
  const w = flatWorld();
  w.settings.mode = 'standard';
  return w;
}

/** A decor piece at a tile center (or an exact fixed-point spot with `at`). */
export function decor(
  state: WorldState,
  def: string,
  x: number,
  z: number,
  seat: SeatId = 0,
  at?: { fx: number; fz: number; rot?: number },
): EntityId {
  const d: Decor = {
    id: state.nextId++,
    def,
    fx: at?.fx ?? x * TILE_FP + TILE_FP / 2,
    fz: at?.fz ?? z * TILE_FP + TILE_FP / 2,
    rot: at?.rot ?? 0,
    builtBy: seat,
  };
  const grid = worldIndex(state).decorGrid;
  state.decor.push(d);
  grid.add(d);
  return d.id;
}

/** A run of linear decor between two tile-center points, split like decor.placeRun. */
export function runOf(
  state: WorldState,
  def: string,
  from: [number, number],
  to: [number, number],
  seat: SeatId = 0,
): EntityId[] {
  const f: [number, number] = [from[0] * TILE_FP + TILE_FP / 2, from[1] * TILE_FP + TILE_FP / 2];
  const t: [number, number] = [to[0] * TILE_FP + TILE_FP / 2, to[1] * TILE_FP + TILE_FP / 2];
  return decorRunSegments(f, t).map((s) => decor(state, def, 0, 0, seat, s));
}

/** Linear decor along row z from tile x0 to x1, one segment centered on each tile. */
export function rowRun(state: WorldState, def: string, x0: number, x1: number, z: number, seat: SeatId = 0) {
  const c = z * TILE_FP + TILE_FP / 2;
  return decorRunSegments([x0 * TILE_FP, c], [(x1 + 1) * TILE_FP, c]).map((s) => decor(state, def, 0, 0, seat, s));
}

/** Linear decor along column x from tile z0 to z1, one segment centered on each tile. */
export function colRun(state: WorldState, def: string, x: number, z0: number, z1: number, seat: SeatId = 0) {
  const c = x * TILE_FP + TILE_FP / 2;
  return decorRunSegments([c, z0 * TILE_FP], [c, (z1 + 1) * TILE_FP]).map((s) => decor(state, def, 0, 0, seat, s));
}

export function build(state: WorldState, def: string, x: number, z: number, rot: Rot4 = 0, seat: SeatId = 0): Building {
  return insertBuilding(state, null, content.buildingById.get(def)!, x, z, rot, seat, { site: false });
}

export function road(state: WorldState, kind: 'path' | 'lane', x0: number, z0: number, x1: number, z1: number): void {
  for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) state.map.road[z * S + x] = Road[kind];
  }
}

export function tree(state: WorldState, x: number, z: number, stage = 3): void {
  state.map.tree[z * S + x] = treeValue(TREE_SPECIES.oak, stage);
}

/** Recomputes charm for the whole map now. */
export function settle(state: WorldState, ctx: SimCtx | null = null): void {
  markChunks(state, [0, 0, S - 1, S - 1]);
  recomputeDirty(state, ctx);
}

export function charm(state: WorldState, layer: keyof WorldState['map'], x: number, z: number): number {
  return state.map[layer][z * S + x]!;
}

/** Runs empty turns (speed 1) until `hours` in-game hours have passed; returns the context. */
export function runHours(state: WorldState, hours: number, ctx: SimCtx = createTickCtx(state)): SimCtx {
  advanceTo(state, state.lastTurn + hours * TICKS_PER_HOUR, ctx);
  return ctx;
}

export function events<E extends SimCtx['events'][number]['e']>(
  ctx: SimCtx,
  e: E,
): Extract<SimCtx['events'][number], { e: E }>[] {
  return ctx.events.filter((x) => x.e === e) as Extract<SimCtx['events'][number], { e: E }>[];
}
