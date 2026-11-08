// The defenses system (C5D), every tick while a raid runs (returning at once otherwise):
// - the bell shuts every gate (they open again when the raid ends);
// - a raider stopped by a wall piece or a shut gate hits it, BREAK_PER_TICK hit points a tick, and
//   a piece at 0 is breached (raiders walk through; masons mend it, systems/watch);
// - crewed towers lower the morale of raiders within range (rate x crew x training);
// - raiders in lantern light lose heart (double with every lantern lit, double again on a Lantern
//   Walk);
// - traps spring once: a pit costs a raider 3 morale and a long climb out, a net catches them.
// docs/spec/14-challenge.md, Defenses and Raid resolution.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { buildingView } from '../../view';
import { invalidateRaiderGrid, wallAt } from '../raids/grid';
import { capture, drain, towerCrews, UNIT } from '../raids/run';
import { lanternWalkTiles, litTiles, towerRange } from '../threats/api';

const S = MAP_SIZE;
/** Hit points a raider knocks off a wall piece a tick (a palisade holds one raider half an hour). */
export const BREAK_PER_TICK = 1;
/** Tower morale drain per raider in range a tick: crew x training x TOWER / 100 units. */
export const TOWER = 12;
/** Lantern light: units a tick for a raider on a lit tile (x2 all lit, x2 on a Lantern Walk). */
export const LANTERN = 4;
/** A pit: morale lost and tiles' worth of time to climb out. */
export const PIT_MORALE = 3;
export const PIT_CLIMB = 2;

/** Lit tiles per valley, keyed by the decor and the pattern sites (derived, never saved). */
const litCache = new WeakMap<WorldState, { key: string; tiles: Set<number>; walk: Set<number> }>();

export function defenseTick(state: WorldState, ctx: TickCtx): void {
  const raid = state.raid;
  if (!raid) return;
  // The bell shuts the gates.
  if (raid.bell) {
    let shut = false;
    for (const b of state.buildings) {
      if (!b.rt || b.stage !== 'built' || b.rt.open === false) continue;
      if (content.buildingById.get(b.def)?.defense?.passable !== 'gate') continue;
      b.rt.open = false;
      shut = true;
      ctx.events.push({ e: 'building.updated', b: buildingView(b) });
    }
    if (shut) {
      state.networkVersion += 1;
      invalidateRaiderGrid(state);
    }
  }
  // Walls: raiders stopped in front of one hit it.
  for (const r of raid.raiders) {
    if (r.state !== 'approach' && r.state !== 'loot' && r.state !== 'flee') continue;
    const m = r.move;
    if (!m || m.step >= m.path.length) continue;
    const wall = wallAt(state, m.path[m.step]!);
    if (!wall || !wall.rt) continue;
    const def = content.buildingById.get(wall.def)!;
    const hp = (wall.rt.hp ?? def.defense!.hp ?? 0) - BREAK_PER_TICK;
    wall.rt.hp = Math.max(0, hp);
    if (wall.rt.hp === 0) {
      invalidateRaiderGrid(state);
      ctx.events.push({ e: 'building.updated', b: buildingView(wall) });
    }
  }
  // Towers.
  const training = state.watch.training;
  for (const [tower, crew] of towerCrews(state)) {
    const range = towerRange(tower);
    const units = Math.floor((crew.length * training * TOWER) / 100);
    for (const r of raid.raiders) {
      if (r.state !== 'approach' && r.state !== 'loot') continue;
      const x = r.tile % S;
      const z = Math.floor(r.tile / S);
      if (Math.abs(x - tower.x) <= range && Math.abs(z - tower.z) <= range) drain(r, units);
    }
  }
  // Lantern light (recomputed when the decor changes; cheap to keep for a tick).
  const nd = state.decor.length;
  const key = `${nd}:${nd ? state.decor[nd - 1]!.id : 0}:${state.hearth.sites.length}`;
  let lit = litCache.get(state);
  if (!lit || lit.key !== key) {
    lit = { key, tiles: litTiles(state), walk: lanternWalkTiles(state) };
    litCache.set(state, lit);
  }
  if (lit.tiles.size > 0) {
    for (const r of raid.raiders) {
      if (r.state !== 'approach' && r.state !== 'loot') continue;
      if (!lit.tiles.has(r.tile)) continue;
      let units = LANTERN;
      if (raid.lanterns) units *= 2;
      if (lit.walk.has(r.tile)) units *= 2;
      drain(r, units);
    }
  }
  // Traps.
  for (const r of raid.raiders) {
    if (r.state !== 'approach' && r.state !== 'loot' && r.state !== 'flee') continue;
    const id = state.map.occupant[r.tile]!;
    if (!id) continue;
    const b = findById(state.buildings, id);
    const trap = b && b.stage === 'built' ? content.buildingById.get(b.def)?.defense?.trap : undefined;
    if (!b || !trap || !b.rt || b.rt.hp === 0) continue;
    b.rt.hp = 0;
    ctx.events.push({ e: 'building.updated', b: buildingView(b) });
    if (trap === 'net') capture(state, ctx, r);
    else {
      drain(r, PIT_MORALE * UNIT);
      if (r.move) r.move.progress = -256 * PIT_CLIMB;
    }
  }
}

export const defenses: System = {
  id: 'defenses',
  order: 86,
  tick(state, ctx) {
    if (!state.raid || !isStandard(state)) return;
    defenseTick(state, ctx);
  },
};
