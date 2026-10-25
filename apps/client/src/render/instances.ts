import { InstancedMesh, type BufferGeometry, type Material, type Matrix4, type Scene } from 'three';

/**
 * A growable set of InstancedMeshes, one per key (usually an art kit id). Each update replaces
 * all instances, which is cheap at I0 scale and keeps draw calls at one per kit.
 */
export class InstanceSets {
  private readonly meshes = new Map<string, InstancedMesh>();

  constructor(
    private readonly scene: Scene,
    private readonly material: Material,
    private readonly geometryFor: (key: string) => BufferGeometry,
  ) {}

  set(groups: Map<string, Matrix4[]>): void {
    for (const [key, mesh] of this.meshes) {
      if (!groups.has(key)) mesh.count = 0;
    }
    for (const [key, matrices] of groups) {
      let mesh = this.meshes.get(key);
      if (!mesh || mesh.instanceMatrix.count < matrices.length) {
        const capacity = Math.max(16, 1 << Math.ceil(Math.log2(Math.max(1, matrices.length))));
        if (mesh) {
          this.scene.remove(mesh);
          mesh.dispose();
        }
        mesh = new InstancedMesh(this.geometryFor(key), this.material, capacity);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.meshes.set(key, mesh);
      }
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.count = matrices.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.meshes.clear();
  }
}
