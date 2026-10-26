import { CHUNK_SIZE, CHUNKS_PER_SIDE, type Rect } from '@qoti/sim';

/** C3D-1: dirty chunk bookkeeping for layers that rebuild per chunk without owning meshes. */
export class ChunkDirt {
  private readonly dirty = new Set<number>();

  markAll(): void {
    for (let i = 0; i < CHUNKS_PER_SIDE * CHUNKS_PER_SIDE; i++) this.dirty.add(i);
  }

  /** Marks chunks touching the rect, padded so neighbors that look across the edge rebuild too. */
  markRect(rect: Rect, pad = 2): void {
    const x0 = Math.max(0, Math.floor((rect[0] - pad) / CHUNK_SIZE));
    const z0 = Math.max(0, Math.floor((rect[1] - pad) / CHUNK_SIZE));
    const x1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((rect[2] + pad) / CHUNK_SIZE));
    const z1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((rect[3] + pad) / CHUNK_SIZE));
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) this.dirty.add(cz * CHUNKS_PER_SIDE + cx);
  }

  get size(): number {
    return this.dirty.size;
  }

  /** Removes and returns up to `max` dirty chunk indices. */
  take(max: number): number[] {
    const out: number[] = [];
    for (const i of this.dirty) {
      if (out.length >= max) break;
      out.push(i);
    }
    for (const i of out) this.dirty.delete(i);
    return out;
  }
}
