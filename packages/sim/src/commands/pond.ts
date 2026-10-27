// Ponds (C5.0 baseline; C5C owns them). docs/spec/10-world-and-building.md, map layers (water 3).
// Digging turns open grass into still water: trees, crops and worn ground go, walkers route round
// it. C5C adds the cost, reedy edges, habitats and the Pond Garden pattern.
import { MAP_SIZE, TERRAFORM_MAX_TILES, TILE_FP } from '../constants';
import type { LayerName, RejectReason, WorldState } from '../contracts';
import { Terrain, tilesRect, Water } from '../map/layers';
import { MAX_DECOR_RADIUS } from '../rules/geometry';
import { worldIndex } from '../state/worldIndex';
import { checkTiles, type HandlerFor, tilesChangedFor, worldChanged } from './util';

const S = MAP_SIZE;

function pondBlocked(state: WorldState, tiles: [number, number][]): RejectReason | null {
  const bad = checkTiles(tiles, TERRAFORM_MAX_TILES);
  if (bad) return bad;
  const m = state.map;
  const reader = worldIndex(state).reader;
  for (const [x, z] of tiles) {
    const i = z * S + x;
    if (m.water[i] !== Water.none) return 'WATER';
    if (m.occupant[i] || m.road[i] || m.fieldOwner[i]) return 'OCCUPIED';
    if (!reader.parcelUnlocked(x, z)) return 'LOCKED_PARCEL';
    const cx = x * TILE_FP + TILE_FP / 2;
    const cz = z * TILE_FP + TILE_FP / 2;
    for (const d of reader.decorNear(cx, cz, TILE_FP + MAX_DECOR_RADIUS)) {
      if (Math.floor(d.fx / TILE_FP) === x && Math.floor(d.fz / TILE_FP) === z) return 'OCCUPIED';
    }
  }
  return null;
}

export const pond: HandlerFor<'terrain.pond'> = {
  type: 'terrain.pond',
  validate: (state, _seat, cmd) => pondBlocked(state, cmd.tiles),
  apply(state, _seat, cmd, ctx) {
    const m = state.map;
    const layers: LayerName[] = ['water', 'terrain'];
    const done = new Set<number>();
    for (const [x, z] of cmd.tiles) {
      const i = z * S + x;
      if (done.has(i)) continue;
      done.add(i);
      m.water[i] = Water.pond;
      m.terrain[i] = Terrain.water;
      if (m.tree[i]) {
        m.tree[i] = 0;
        if (!layers.includes('tree')) layers.push('tree');
      }
      if (m.wear[i]) {
        m.wear[i] = 0;
        if (!layers.includes('wear')) layers.push('wear');
      }
    }
    tilesChangedFor(ctx, cmd.tiles, layers);
    const rect = tilesRect(cmd.tiles);
    worldChanged(state, rect && [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]);
  },
};
