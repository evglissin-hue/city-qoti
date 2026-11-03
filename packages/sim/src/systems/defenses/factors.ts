// The walk hook's fences and hedges (C5D): raiders crossing one are slowed by its DecorDef.slows
// (fence 20%, hedge 30%). Residents and carts walk round them as before.
import { content } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../../constants';
import type { WorldState } from '../../contracts';
import { worldIndex } from '../../state/worldIndex';
import type { Mover } from '../movement/factors';

export function slowedByDecor(state: WorldState, mover: Mover, tile: number): number {
  if (mover.kind !== 'raider') return 1000;
  const x = tile % MAP_SIZE;
  const z = Math.floor(tile / MAP_SIZE);
  let slow = 0;
  const near = worldIndex(state).reader.decorNear(x * TILE_FP + 128, z * TILE_FP + 128, TILE_FP);
  for (const d of near) {
    if (Math.floor(d.fx / TILE_FP) !== x || Math.floor(d.fz / TILE_FP) !== z) continue;
    slow = Math.max(slow, content.decorById.get(d.def)?.slows ?? 0);
  }
  return 1000 + slow * 10;
}
