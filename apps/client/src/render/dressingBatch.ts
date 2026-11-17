// V3A: the dressing layer's one draw. A BatchedMesh on the shared kit material holding every piece of
// every yard: geometries are keyed (a few dozen serve all the pieces) and each placement is one
// instance. Like batch.ts's KeyedBatch, which it copies from, it grows its instance, vertex and index
// capacity as needed; unlike it, geometries are kept for the batch's life (the set is small).
import { BatchedMesh, type BufferGeometry, type Material, type Matrix4, type Scene } from 'three';

export class DressingBatch {
  readonly mesh: BatchedMesh;
  private readonly geos = new Map<string, number>();
  private maxVertices: number;
  private live = 0;

  constructor(scene: Scene, material: Material, instances = 128, vertices = 24_000) {
    this.maxVertices = vertices;
    this.mesh = new BatchedMesh(instances, vertices, vertices * 2, material);
    this.mesh.sortObjects = false;
    // The batch culls per object itself; its own bounds are never computed, so skip the whole-mesh test.
    this.mesh.frustumCulled = false;
    this.mesh.perObjectFrustumCulled = true;
    // The layer is shadowless: it receives shadows and casts none.
    this.mesh.userData.noCast = true;
    this.mesh.name = 'dressing';
    scene.add(this.mesh);
  }

  /** Instances alive now. */
  get size(): number {
    return this.live;
  }

  /** The geometry id for `key`, adding the built geometry on first use. */
  geometry(key: string, make: () => BufferGeometry): number {
    const hit = this.geos.get(key);
    if (hit !== undefined) return hit;
    const g = make();
    const verts = g.getAttribute('position').count;
    const index = g.getIndex()?.count ?? verts;
    if (verts > this.mesh.unusedVertexCount || index > this.mesh.unusedIndexCount) {
      this.mesh.optimize();
      if (verts > this.mesh.unusedVertexCount || index > this.mesh.unusedIndexCount) {
        this.maxVertices = Math.max(this.maxVertices * 2, this.maxVertices + verts * 2);
        this.mesh.setGeometrySize(this.maxVertices, this.maxVertices * 2 + index);
      }
    }
    const id = this.mesh.addGeometry(g);
    this.geos.set(key, id);
    return id;
  }

  add(geo: number, m: Matrix4): number {
    if (this.mesh.instanceCount >= this.mesh.maxInstanceCount) {
      this.mesh.setInstanceCount(this.mesh.maxInstanceCount * 2);
    }
    const i = this.mesh.addInstance(geo);
    this.mesh.setMatrixAt(i, m);
    this.live++;
    return i;
  }

  remove(instance: number): void {
    this.mesh.deleteInstance(instance);
    this.live--;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geos.clear();
    this.live = 0;
  }
}
