import { content } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import type { Building } from '../contracts';
import { canPlaceBuilding } from '../rules/building';
import { footprintTiles } from '../rules/footprint';
import { findById, removeById } from '../state/entities';
import { worldIndex } from '../state/worldIndex';
import { buildingView } from '../view';
import { checkIds, type HandlerFor, takeId, tilesChangedFor } from './util';

export const place: HandlerFor<'build.place'> = {
  type: 'build.place',
  validate(state, _seat, cmd) {
    const def = typeof cmd.def === 'string' ? content.buildingById.get(cmd.def) : undefined;
    if (!def) return 'INVALID';
    const result = canPlaceBuilding(worldIndex(state).reader, def, cmd.x, cmd.z, cmd.rot);
    return result.ok ? null : (result.reason ?? 'INVALID');
  },
  apply(state, seat, cmd, ctx) {
    const def = content.buildingById.get(cmd.def)!;
    const placement = canPlaceBuilding(worldIndex(state).reader, def, cmd.x, cmd.z, cmd.rot);
    // Sandbox: no costs, built instantly, trees in the footprint cleared.
    const b: Building = {
      id: takeId(state),
      def: def.id,
      x: cmd.x,
      z: cmd.z,
      rot: cmd.rot,
      builtBy: seat,
      handmade: false,
      stage: 'built',
      foundation: placement.foundation,
    };
    for (const [x, z] of placement.tiles) {
      state.map.occupant[z * MAP_SIZE + x] = b.id;
      state.map.tree[z * MAP_SIZE + x] = 0;
    }
    state.buildings.push(b);
    ctx.events.push({ e: 'building.added', b: buildingView(b) });
    tilesChangedFor(ctx, placement.tiles, ['occupant', 'tree']);
  },
};

export const remove: HandlerFor<'build.remove'> = {
  type: 'build.remove',
  validate(state, _seat, cmd) {
    const bad = checkIds(cmd.ids);
    if (bad) return bad;
    return cmd.ids.every((id) => findById(state.buildings, id)) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    for (const id of cmd.ids) {
      const b = removeById(state.buildings, id);
      if (!b) continue;
      const def = content.buildingById.get(b.def);
      const tiles = def ? footprintTiles(def, b.x, b.z, b.rot) : [];
      for (const [x, z] of tiles) {
        if (state.map.occupant[z * MAP_SIZE + x] === id) state.map.occupant[z * MAP_SIZE + x] = 0;
      }
      ctx.events.push({ e: 'building.removed', id });
      tilesChangedFor(ctx, tiles, ['occupant']);
    }
  },
};
