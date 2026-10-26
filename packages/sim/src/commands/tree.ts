import { content } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import { tilesRect, treeValue } from '../map/layers';
import { canPlantTree } from '../rules/tree';
import { worldIndex } from '../state/worldIndex';
import { checkTiles, type HandlerFor, tilesChangedFor, worldChanged } from './util';

export const plant: HandlerFor<'tree.plant'> = {
  type: 'tree.plant',
  validate(state, _seat, cmd) {
    if (typeof cmd.species !== 'string' || !content.treeById.get(cmd.species)) return 'INVALID';
    const result = canPlantTree(worldIndex(state).reader, cmd.x, cmd.z);
    return result.ok ? null : (result.reason ?? 'INVALID');
  },
  apply(state, _seat, cmd, ctx) {
    const species = content.treeById.get(cmd.species)!.species;
    // A sapling; the trees system grows it one stage every two days.
    state.map.tree[cmd.z * MAP_SIZE + cmd.x] = treeValue(species, 0);
    tilesChangedFor(ctx, [[cmd.x, cmd.z]], ['tree']);
    worldChanged(state, [cmd.x, cmd.z, cmd.x, cmd.z], false);
  },
};

export const remove: HandlerFor<'tree.remove'> = {
  type: 'tree.remove',
  validate(state, _seat, cmd) {
    const bad = checkTiles(cmd.tiles);
    if (bad) return bad;
    return cmd.tiles.some(([x, z]) => state.map.tree[z * MAP_SIZE + x]) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    for (const [x, z] of cmd.tiles) state.map.tree[z * MAP_SIZE + x] = 0;
    tilesChangedFor(ctx, cmd.tiles, ['tree']);
    worldChanged(state, tilesRect(cmd.tiles), false);
  },
};
