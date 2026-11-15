// R1 (R1D): moving decor and hand-placed buildings (docs/spec/12-hearth.md, Decorating that
// composes itself; 10-world-and-building.md, Moving). A move asks the same questions as placing at
// the new spot, with the piece itself left out of the way. It costs nothing and refunds nothing. In
// a standard valley the builders take a building down and raise it again for a third of its work
// and no materials; in the sandbox it simply moves.
import { content } from '@qoti/content';
import { MAP_SIZE, TICKS_PER_HOUR, TILE_FP } from '../constants';
import type { Building } from '../contracts';
import { tilesRect } from '../map/layers';
import { canPlaceBuilding } from '../rules/building';
import { canPlaceDecor } from '../rules/decor';
import { footprintTiles } from '../rules/footprint';
import { isInt } from '../rules/geometry';
import { movedReaches, readerWithout, staysPut } from '../rules/without';
import { findById } from '../state/entities';
import { isStandard, TOWN_HALL } from '../state/hamlet';
import { worldIndex } from '../state/worldIndex';
import { emitBuilding } from '../systems/economy/emit';
import { markCharmDirty, markCharmSoon } from '../systems/hearth/charm/dirty';
import { doorTile } from '../systems/movement/api';
import { buildingView, decorView } from '../view';
import { type HandlerFor, tilesChangedFor, worldChanged } from './util';

function decorRect(fx: number, fz: number): [number, number, number, number] {
  const x = Math.floor(fx / TILE_FP);
  const z = Math.floor(fz / TILE_FP);
  return [x - 1, z - 1, x + 1, z + 1];
}

export const moveDecor: HandlerFor<'decor.move'> = {
  type: 'decor.move',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id) || !isInt(cmd.fx) || !isInt(cmd.fz) || !isInt(cmd.rot)) return 'INVALID';
    const d = findById(state.decor, cmd.id);
    if (!d) return 'NOT_FOUND';
    const def = content.decorById.get(d.def);
    if (!def) return 'INVALID';
    const result = canPlaceDecor(
      readerWithout(worldIndex(state).reader, { decor: d.id }),
      def,
      cmd.fx,
      cmd.fz,
      cmd.rot,
    );
    return result.ok ? null : (result.reason ?? 'INVALID');
  },
  apply(state, _seat, cmd, ctx) {
    const d = findById(state.decor, cmd.id)!;
    const walls = !!content.decorById.get(d.def)?.blocksWalking;
    const grid = worldIndex(state).decorGrid;
    const from = decorRect(d.fx, d.fz);
    grid.remove(d);
    d.fx = cmd.fx;
    d.fz = cmd.fz;
    d.rot = cmd.rot;
    grid.add(d);
    // The client's mirror redraws a piece from remove then add (same id).
    ctx.events.push({ e: 'decor.removed', id: d.id });
    ctx.events.push({ e: 'decor.added', d: decorView(d) });
    worldChanged(state, from, walls);
    worldChanged(state, decorRect(d.fx, d.fz), walls);
    markCharmSoon(state);
  },
};

export const moveBuilding: HandlerFor<'build.move'> = {
  type: 'build.move',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id) || !isInt(cmd.x) || !isInt(cmd.z) || !isInt(cmd.rot)) return 'INVALID';
    if (cmd.rot < 0 || cmd.rot > 3) return 'INVALID';
    const b = findById(state.buildings, cmd.id);
    if (!b) return 'NOT_FOUND';
    const def = content.buildingById.get(b.def);
    if (!def) return 'INVALID';
    // A grown building belongs to its lot; the zone grows and replaces it, so it is not moved.
    if (b.lot) return 'NOT_ALLOWED';
    if (isStandard(state) && b.def === TOWN_HALL) return 'HALL_STAYS';
    if (staysPut(def)) return 'NOT_ALLOWED';
    const rot = cmd.rot as Building['rot'];
    const placement = canPlaceBuilding(
      readerWithout(worldIndex(state).reader, { building: b.id }),
      def,
      cmd.x,
      cmd.z,
      rot,
    );
    if (!placement.ok) return placement.reason ?? 'INVALID';
    if (isStandard(state) && !movedReaches(worldIndex(state).reader, state.buildings, b, cmd.x, cmd.z, rot))
      return 'CUT_OFF';
    return null;
  },
  apply(state, _seat, cmd, ctx) {
    const b = findById(state.buildings, cmd.id)!;
    const def = content.buildingById.get(b.def)!;
    const rot = cmd.rot as Building['rot'];
    const placement = canPlaceBuilding(
      readerWithout(worldIndex(state).reader, { building: b.id }),
      def,
      cmd.x,
      cmd.z,
      rot,
    );
    const oldTiles = footprintTiles(def, b.x, b.z, b.rot);
    for (const [x, z] of oldTiles) {
      if (state.map.occupant[z * MAP_SIZE + x] === b.id) state.map.occupant[z * MAP_SIZE + x] = 0;
    }
    b.x = cmd.x;
    b.z = cmd.z;
    b.rot = rot;
    b.foundation = placement.foundation;
    const newTiles = footprintTiles(def, b.x, b.z, b.rot);
    for (const [x, z] of newTiles) {
      state.map.occupant[z * MAP_SIZE + x] = b.id;
      state.map.tree[z * MAP_SIZE + x] = 0;
    }
    state.networkVersion += 1;

    // Standard valley: the builders take it down and raise it again for a third of its work and no
    // materials. Its runtime (workers, stores, counters) stays: households keep their home and
    // workers keep their jobs and wait. A site still going up just moves, its state as it was.
    const rt = b.rt;
    if (rt && b.stage === 'built') {
      b.stage = 'construction';
      rt.construction = {
        needs: rt.input.map(() => 0),
        delivered: rt.input.map(() => 0),
        work: Math.max(1, Math.ceil(((def.work ?? 8) * TICKS_PER_HOUR) / 3)),
        workDone: 0,
        priority: false,
        paid: 0,
      };
      rt.progress = 0;
    }
    // Residents inside stand at the new door, not the old one.
    const door = doorTile(b, def);
    for (const r of state.residents) {
      if (r.inside === b.id) {
        r.tile = door;
        r.move = null;
      }
    }

    for (const tiles of [oldTiles, newTiles]) {
      const rect = tilesRect(tiles);
      markCharmDirty(state, rect && [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]);
    }
    tilesChangedFor(ctx, oldTiles, ['occupant']);
    tilesChangedFor(ctx, newTiles, ['occupant', 'tree']);
    if (rt) emitBuilding(state, ctx, b);
    else ctx.events.push({ e: 'building.updated', b: buildingView(b) });
  },
};
