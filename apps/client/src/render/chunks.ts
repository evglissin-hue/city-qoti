import { CHUNK_SIZE, CHUNKS_PER_SIDE, type Rect } from '@qoti/sim';
import { nearestChunks, type Near } from './chunkDirt';
import {
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  type Material,
  type Scene,
} from 'three';

/**
 * V3C: joins chunk geometries (same builder, so the same attributes) into one, indexed if any part
 * is. Returns null for none.
 */
export function joinGeometries(parts: readonly BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null;
  const first = parts[0]!;
  const names = Object.keys(first.attributes);
  const indexed = parts.some((g) => g.index !== null);
  let vertices = 0;
  let indices = 0;
  for (const g of parts) {
    const n = g.getAttribute('position').count;
    vertices += n;
    indices += g.index ? g.index.count : n;
  }
  const out = new BufferGeometry();
  // Interleaved attributes (the terrain's) are joined buffer by buffer and keep their offsets.
  const joined = new Map<InterleavedBuffer, InterleavedBuffer>();
  for (const name of names) {
    const a = first.getAttribute(name) as BufferAttribute | InterleavedBufferAttribute;
    if (a instanceof InterleavedBufferAttribute) {
      let buffer = joined.get(a.data);
      if (!buffer) {
        const array = new Float32Array(vertices * a.data.stride);
        let at = 0;
        for (const g of parts) {
          const b = (g.getAttribute(name) as InterleavedBufferAttribute).data;
          const used = b.count * b.stride;
          array.set(b.array.subarray(0, used) as Float32Array, at);
          at += used;
        }
        buffer = new InterleavedBuffer(array, a.data.stride);
        joined.set(a.data, buffer);
      }
      out.setAttribute(name, new InterleavedBufferAttribute(buffer, a.itemSize, a.offset, a.normalized));
      continue;
    }
    const Ctor = a.array.constructor as new (n: number) => Float32Array;
    const array = new Ctor(vertices * a.itemSize);
    let at = 0;
    for (const g of parts) {
      const b = g.getAttribute(name) as BufferAttribute;
      array.set(b.array as Float32Array, at);
      at += b.count * a.itemSize;
    }
    out.setAttribute(name, new BufferAttribute(array, a.itemSize, a.normalized));
  }
  if (indexed) {
    const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let at = 0;
    let base = 0;
    for (const g of parts) {
      const n = g.getAttribute('position').count;
      if (g.index) {
        const src = g.index.array;
        for (let i = 0; i < src.length; i++) index[at++] = src[i]! + base;
      } else for (let i = 0; i < n; i++) index[at++] = base + i;
      base += n;
    }
    out.setIndex(new BufferAttribute(index, 1));
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * One mesh per 16 x 16 tile chunk, rebuilt when its tiles change. Rebuilds are spread out:
 * at most `perFrame` chunks per frame, so a big edit never stalls a frame.
 *
 * V3C: with `group` above 1, the chunks of each `group` x `group` block are joined into one mesh, so
 * a far view of the whole valley draws a ninth (group 3) of the calls. A chunk's rebuild rebuilds its
 * own geometry, then joins its block again (copies only).
 */
export class ChunkedMeshes {
  private readonly meshes: (Mesh | null)[] = new Array<Mesh | null>(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE).fill(
    null,
  );
  private readonly dirty = new Set<number>();

  constructor(
    private readonly scene: Scene,
    private readonly material: Material,
    private readonly build: (cx: number, cz: number) => BufferGeometry | null,
    private readonly renderOrder = 0,
    /** C3D-1: false keeps the chunks out of the shadow pass (they still receive shadows). */
    private readonly castShadows = true,
    /** V3C: chunks a side joined into one mesh (1, the default, is one mesh a chunk). */
    private readonly group = 1,
  ) {}

  /** V3C: each chunk's own geometry while chunks are grouped (never drawn itself). */
  private readonly parts: (BufferGeometry | null)[] = [];

  /** C3D-1: chunks waiting to be rebuilt. */
  get pending(): number {
    return this.dirty.size;
  }

  markAll(): void {
    for (let i = 0; i < this.meshes.length; i++) this.dirty.add(i);
  }

  /** Marks chunks touching the rect, padded so neighbors that draw shared edges rebuild too. */
  markRect(rect: Rect, pad = 1): void {
    const x0 = Math.max(0, Math.floor((rect[0] - pad) / CHUNK_SIZE));
    const z0 = Math.max(0, Math.floor((rect[1] - pad) / CHUNK_SIZE));
    const x1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((rect[2] + pad) / CHUNK_SIZE));
    const z1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((rect[3] + pad) / CHUNK_SIZE));
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) this.dirty.add(cz * CHUNKS_PER_SIDE + cx);
  }

  /**
   * Rebuilds up to `max` dirty chunks. Returns true when anything on screen changed (V1D: a chunk
   * that was empty and stays empty is no change, so it does not drop the still-frame cache).
   */
  rebuild(max = Infinity, near?: Near, radius = Infinity): boolean {
    let n = 0;
    let changed = false;
    // C3D-1: nearest the view first, so a fresh valley fills in from where the player looks.
    const order = near ? nearestChunks(this.dirty, near, radius) : [...this.dirty];
    const blocks = new Set<number>();
    for (const i of order) {
      if (n >= max) break;
      this.dirty.delete(i);
      if (this.group > 1 ? this.rebuildPart(i, blocks) : this.rebuildChunk(i)) changed = true;
      n++;
    }
    for (const b of blocks) this.joinBlock(b);
    return changed;
  }

  /** V3C: rebuilds a grouped chunk's own geometry and notes its block; false when empty and still is. */
  private rebuildPart(i: number, blocks: Set<number>): boolean {
    const old = this.parts[i] ?? null;
    old?.dispose();
    this.parts[i] = null;
    const geometry = this.build(i % CHUNKS_PER_SIDE, Math.floor(i / CHUNKS_PER_SIDE));
    if (!geometry || geometry.getAttribute('position').count === 0) {
      geometry?.dispose();
      if (old) blocks.add(this.blockOf(i));
      return old !== null;
    }
    this.parts[i] = geometry;
    blocks.add(this.blockOf(i));
    return true;
  }

  private blockOf(i: number): number {
    const g = this.group;
    const bx = Math.floor((i % CHUNKS_PER_SIDE) / g);
    const bz = Math.floor(Math.floor(i / CHUNKS_PER_SIDE) / g);
    return bz * Math.ceil(CHUNKS_PER_SIDE / g) + bx;
  }

  /** V3C: joins a block's chunk geometries into its one mesh (kept in `meshes` at the block's index). */
  private joinBlock(b: number): void {
    const g = this.group;
    const side = Math.ceil(CHUNKS_PER_SIDE / g);
    const bx = b % side;
    const bz = Math.floor(b / side);
    const parts: BufferGeometry[] = [];
    for (let cz = bz * g; cz < Math.min(CHUNKS_PER_SIDE, bz * g + g); cz++)
      for (let cx = bx * g; cx < Math.min(CHUNKS_PER_SIDE, bx * g + g); cx++) {
        const p = this.parts[cz * CHUNKS_PER_SIDE + cx];
        if (p) parts.push(p);
      }
    const old = this.meshes[b];
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
      this.meshes[b] = null;
    }
    const geometry = joinGeometries(parts);
    if (!geometry) return;
    this.meshes[b] = this.place(geometry);
  }

  private place(geometry: BufferGeometry): Mesh {
    const mesh = new Mesh(geometry, this.material);
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = this.renderOrder;
    if (!this.castShadows) mesh.userData.qotiShadows = false;
    this.scene.add(mesh);
    return mesh;
  }

  /** Rebuilds one chunk; false when it was empty and still is. */
  private rebuildChunk(i: number): boolean {
    const old = this.meshes[i];
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
      this.meshes[i] = null;
    }
    const geometry = this.build(i % CHUNKS_PER_SIDE, Math.floor(i / CHUNKS_PER_SIDE));
    if (!geometry || geometry.getAttribute('position').count === 0) {
      geometry?.dispose();
      return old !== null;
    }
    this.meshes[i] = this.place(geometry);
    return true;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.fill(null);
    for (const p of this.parts) p?.dispose();
    this.parts.length = 0;
    this.dirty.clear();
  }
}
