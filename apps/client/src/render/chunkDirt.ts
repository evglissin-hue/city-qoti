import { CHUNK_SIZE, CHUNKS_PER_SIDE, type Rect } from '@qoti/sim';

/** A point to build chunks around first (the view's focus), in tiles. */
export interface Near {
  x: number;
  z: number;
}

/** C3D-1: chunk indices sorted nearest first to a point (tiles), optionally only within `radius`. */
export function nearestChunks(indices: Iterable<number>, near: Near, radius = Infinity): number[] {
  const d = (i: number) => {
    const cx = (i % CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2 - near.x;
    const cz = Math.floor(i / CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2 - near.z;
    return cx * cx + cz * cz;
  };
  const r2 = radius * radius;
  return [...indices].filter((i) => d(i) <= r2).sort((a, b) => d(a) - d(b));
}

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

  /** Removes and returns up to `max` dirty chunk indices, nearest to `near` first when given. */
  take(max: number, near?: Near, radius = Infinity): number[] {
    const out: number[] = [];
    if (near) {
      for (const i of nearestChunks(this.dirty, near, radius)) {
        if (out.length >= max) break;
        out.push(i);
      }
    } else {
      for (const i of this.dirty) {
        if (out.length >= max) break;
        out.push(i);
      }
    }
    for (const i of out) this.dirty.delete(i);
    return out;
  }
}
