import { CHUNK_SIZE, CHUNKS_PER_SIDE, MAP_SIZE } from '../constants';
import type { DirtyTracker, LayerName, LayerPatch, MapLayers, Rect } from '../contracts';
import { clampRect, copyRect, LAYER_NAMES } from './layers';

/** Dirty chunks per layer. The worker turns them into LayerPatches after each batch of turns. */
export class Dirty implements DirtyTracker {
  private readonly chunks = new Map<LayerName, Uint8Array>();

  mark(layer: LayerName, rect: Rect): void {
    const [x0, z0, x1, z1] = clampRect(rect);
    if (x0 > x1 || z0 > z1) return;
    let flags = this.chunks.get(layer);
    if (!flags) {
      flags = new Uint8Array(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
      this.chunks.set(layer, flags);
    }
    for (let cz = Math.floor(z0 / CHUNK_SIZE); cz <= Math.floor(z1 / CHUNK_SIZE); cz++) {
      for (let cx = Math.floor(x0 / CHUNK_SIZE); cx <= Math.floor(x1 / CHUNK_SIZE); cx++) {
        flags[cz * CHUNKS_PER_SIDE + cx] = 1;
      }
    }
  }

  get empty(): boolean {
    return this.chunks.size === 0;
  }

  clear(): void {
    this.chunks.clear();
  }

  /** One patch per dirty chunk and layer, in layer then chunk order. Clears the tracker. */
  collectPatches(map: MapLayers): LayerPatch[] {
    const patches: LayerPatch[] = [];
    for (const layer of LAYER_NAMES) {
      const flags = this.chunks.get(layer);
      if (!flags) continue;
      for (let c = 0; c < flags.length; c++) {
        if (!flags[c]) continue;
        const x0 = (c % CHUNKS_PER_SIDE) * CHUNK_SIZE;
        const z0 = Math.floor(c / CHUNKS_PER_SIDE) * CHUNK_SIZE;
        const rect: Rect = [
          x0,
          z0,
          Math.min(MAP_SIZE, x0 + CHUNK_SIZE) - 1,
          Math.min(MAP_SIZE, z0 + CHUNK_SIZE) - 1,
        ];
        patches.push({ layer, rect, data: copyRect(map[layer], rect) });
      }
    }
    this.clear();
    return patches;
  }
}
