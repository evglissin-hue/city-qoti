// C3D: one BatchedMesh for many distinct geometries (every building with its own variant,
// customization and stock piles) in a single draw call. Geometries are keyed and shared between
// items with the same key; the batch grows (and compacts) as needed.
import { BatchedMesh, type BufferGeometry, type Material, type Matrix4, type Scene } from 'three';

interface Geo {
  id: number;
  refs: number;
}

export class KeyedBatch {
  readonly mesh: BatchedMesh;
  private readonly geos = new Map<string, Geo>();
  private readonly items = new Map<number, { instance: number; key: string }>();
  private maxVertices: number;

  constructor(scene: Scene, material: Material, instances = 64, vertices = 120_000) {
    this.maxVertices = vertices;
    this.mesh = new BatchedMesh(instances, vertices, vertices * 2, material);
    this.mesh.sortObjects = false;
    // The batch culls per object itself; its own bounds are never computed, so skip the whole-mesh test.
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Shows geometry `key` for item `id` at matrix `m`; `make` builds the geometry when it is new. */
  set(id: number, key: string, make: () => BufferGeometry, m: Matrix4): void {
    const cur = this.items.get(id);
    if (cur && cur.key === key) {
      this.mesh.setMatrixAt(cur.instance, m);
      return;
    }
    const geo = this.acquire(key, make);
    if (cur) {
      this.mesh.setGeometryIdAt(cur.instance, geo);
      this.release(cur.key);
      cur.key = key;
      this.mesh.setMatrixAt(cur.instance, m);
      return;
    }
    const instance = this.addInstance(geo);
    this.mesh.setMatrixAt(instance, m);
    this.items.set(id, { instance, key });
  }

  /** The key an item shows now. */
  keyOf(id: number): string | undefined {
    return this.items.get(id)?.key;
  }

  has(id: number): boolean {
    return this.items.has(id);
  }

  ids(): number[] {
    return [...this.items.keys()];
  }

  remove(id: number): void {
    const cur = this.items.get(id);
    if (!cur) return;
    this.mesh.deleteInstance(cur.instance);
    this.release(cur.key);
    this.items.delete(id);
  }

  private acquire(key: string, make: () => BufferGeometry): number {
    const g = this.geos.get(key);
    if (g) {
      g.refs++;
      return g.id;
    }
    const geometry = make();
    const id = this.addGeometry(geometry);
    geometry.dispose();
    this.geos.set(key, { id, refs: 1 });
    return id;
  }

  private release(key: string): void {
    const g = this.geos.get(key);
    if (!g) return;
    g.refs--;
    if (g.refs <= 0) {
      this.mesh.deleteGeometry(g.id);
      this.geos.delete(key);
    }
  }

  private addGeometry(geometry: BufferGeometry): number {
    const verts = geometry.getAttribute('position').count;
    if (verts > this.mesh.unusedVertexCount) {
      this.mesh.optimize();
      if (verts > this.mesh.unusedVertexCount) {
        this.maxVertices = Math.max(this.maxVertices * 2, this.maxVertices + verts * 2);
        this.mesh.setGeometrySize(this.maxVertices, this.maxVertices * 2);
      }
    }
    return this.mesh.addGeometry(geometry);
  }

  private addInstance(geo: number): number {
    if (this.mesh.instanceCount >= this.mesh.maxInstanceCount) {
      this.mesh.setInstanceCount(this.mesh.maxInstanceCount * 2);
    }
    return this.mesh.addInstance(geo);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geos.clear();
    this.items.clear();
  }
}
