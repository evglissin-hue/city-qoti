import { CHUNK_SIZE, CHUNKS_PER_SIDE, type Rect } from '@qoti/sim';
import { Mesh, type BufferGeometry, type Material, type Scene } from 'three';

/**
 * One mesh per 16 x 16 tile chunk, rebuilt when its tiles change. Rebuilds are spread out:
 * at most `perFrame` chunks per frame, so a big edit never stalls a frame.
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
  ) {}

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

  /** Rebuilds up to `max` dirty chunks. Returns true when anything changed. */
  rebuild(max = Infinity): boolean {
    let n = 0;
    for (const i of this.dirty) {
      if (n >= max) break;
      this.dirty.delete(i);
      this.rebuildChunk(i);
      n++;
    }
    return n > 0;
  }

  private rebuildChunk(i: number): void {
    const old = this.meshes[i];
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
      this.meshes[i] = null;
    }
    const geometry = this.build(i % CHUNKS_PER_SIDE, Math.floor(i / CHUNKS_PER_SIDE));
    if (!geometry || geometry.getAttribute('position').count === 0) {
      geometry?.dispose();
      return;
    }
    const mesh = new Mesh(geometry, this.material);
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = this.renderOrder;
    if (!this.castShadows) mesh.userData.qotiShadows = false;
    this.scene.add(mesh);
    this.meshes[i] = mesh;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.fill(null);
    this.dirty.clear();
  }
}
