import { content } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import { canPaintRoad } from '../rules/road';
import { worldIndex } from '../state/worldIndex';
import { checkTiles, type HandlerFor, tilesChangedFor } from './util';

export const paint: HandlerFor<'road.paint'> = {
  type: 'road.paint',
  validate(state, _seat, cmd) {
    const result = canPaintRoad(worldIndex(state).reader, cmd.kind, cmd.tiles);
    return result.ok ? null : (result.reason ?? 'INVALID');
  },
  apply(state, _seat, cmd, ctx) {
    const value = content.roadById.get(cmd.kind)!.layerValue;
    const { road, tree } = state.map;
    for (const [x, z] of cmd.tiles) {
      road[z * MAP_SIZE + x] = value;
      // Sandbox clears trees under new roads.
      tree[z * MAP_SIZE + x] = 0;
    }
    tilesChangedFor(ctx, cmd.tiles, ['road', 'tree']);
  },
};

export const remove: HandlerFor<'road.remove'> = {
  type: 'road.remove',
  validate(state, _seat, cmd) {
    const bad = checkTiles(cmd.tiles);
    if (bad) return bad;
    return cmd.tiles.some(([x, z]) => state.map.road[z * MAP_SIZE + x]) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    for (const [x, z] of cmd.tiles) state.map.road[z * MAP_SIZE + x] = 0;
    tilesChangedFor(ctx, cmd.tiles, ['road']);
  },
};
