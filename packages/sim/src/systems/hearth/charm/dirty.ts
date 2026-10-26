// Charm dirtiness (C3.0 contract helper; C3B owns the charm system). Commands and systems that
// change what charm reads (decor, buildings, roads, trees, water) call markCharmDirty so the next
// recompute covers the changed chunks and their neighbors.
import { CHUNK_SIZE, CHUNKS_PER_SIDE } from '../../../constants';
import type { Rect, WorldState } from '../../../contracts';
import { clampRect } from '../../../map/layers';

/** Adds the chunks a rect touches to hearth.dirtyChunks (kept sorted, no duplicates). */
export function markCharmDirty(state: WorldState, rect: Rect | null): void {
  if (!rect) return;
  const [x0, z0, x1, z1] = clampRect(rect);
  if (x0 > x1 || z0 > z1) return;
  const list = state.hearth.dirtyChunks;
  for (let cz = Math.floor(z0 / CHUNK_SIZE); cz <= Math.floor(z1 / CHUNK_SIZE); cz++) {
    for (let cx = Math.floor(x0 / CHUNK_SIZE); cx <= Math.floor(x1 / CHUNK_SIZE); cx++) {
      insertSorted(list, cz * CHUNKS_PER_SIDE + cx);
    }
  }
}

function insertSorted(list: number[], v: number): void {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  if (list[lo] !== v) list.splice(lo, 0, v);
}
