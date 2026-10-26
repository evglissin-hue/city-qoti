import { content } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import { canPaintRoad } from '../rules/road';
import { worldIndex } from '../state/worldIndex';
import { tilesRect } from '../map/layers';
import { chargeRoad, roadBlocked } from '../systems/economy/api';
import { checkTiles, type HandlerFor, tilesChangedFor, worldChanged } from './util';

export const paint: HandlerFor<'road.paint'> = {
  type: 'road.paint',
  validate(state, _seat, cmd) {
    const result = canPaintRoad(worldIndex(state).reader, cmd.kind, cmd.tiles);
    if (!result.ok) return result.reason ?? 'INVALID';
    return roadBlocked(state, cmd.kind, newRoadTiles(state, cmd.tiles));
  },
  apply(state, _seat, cmd, ctx) {
    chargeRoad(state, ctx, cmd.kind, newRoadTiles(state, cmd.tiles));
    const value = content.roadById.get(cmd.kind)!.layerValue;
    const { road, tree } = state.map;
    for (const [x, z] of cmd.tiles) {
      road[z * MAP_SIZE + x] = value;
      // Sandbox clears trees under new roads.
      tree[z * MAP_SIZE + x] = 0;
    }
    tilesChangedFor(ctx, cmd.tiles, ['road', 'tree']);
    worldChanged(state, tilesRect(cmd.tiles));
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
    worldChanged(state, tilesRect(cmd.tiles));
  },
};

/** Distinct tiles in the run that are not road yet (repainting an existing road is free). */
function newRoadTiles(state: { map: { road: Uint8Array } }, tiles: [number, number][]): number {
  const seen = new Set<number>();
  for (const [x, z] of tiles) {
    const i = z * MAP_SIZE + x;
    if (!state.map.road[i]) seen.add(i);
  }
  return seen.size;
}
