// C4E: a growable InstancedMesh refilled every frame (carts, ponies, animals): push matrices, then
// finish. One draw call per pool; only the filled range is uploaded.
import {
  DynamicDrawUsage,
  InstancedMesh,
  type BufferGeometry,
  type InstancedBufferAttribute,
  type Material,
  type Matrix4,
  type Scene,
} from 'three';

export class FramePool {
  mesh: InstancedMesh;
  n = 0;

  constructor(
    private readonly scene: Scene,
    private readonly geometry: BufferGeometry,
    private readonly material: Material,
    capacity = 16,
  ) {
    this.mesh = this.make(capacity);
  }

  private make(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  push(m: Matrix4): void {
    if (this.n >= this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      const keep = old.instanceMatrix.array as Float32Array;
      this.mesh = this.make(old.instanceMatrix.count * 2);
      (this.mesh.instanceMatrix.array as Float32Array).set(keep);
      this.scene.remove(old);
      old.dispose();
    }
    m.toArray(this.mesh.instanceMatrix.array as Float32Array, this.n * 16);
    this.n++;
  }

  begin(): void {
    this.n = 0;
  }

  finish(): void {
    this.mesh.count = this.n;
    if (this.n === 0) return;
    const a = this.mesh.instanceMatrix as InstancedBufferAttribute;
    a.clearUpdateRanges();
    a.addUpdateRange(0, this.n * 16);
    a.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
  }
}
