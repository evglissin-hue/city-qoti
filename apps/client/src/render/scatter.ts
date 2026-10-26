import { CHUNK_SIZE, CHUNKS_PER_SIDE } from '@qoti/sim';
import {
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Material,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import type { WorldEnv } from './env';

/**
 * C3D-1: instanced scatter with per-chunk culling and level of detail, for trees and small nature
 * props. Each chunk keeps its instances (matrix and tint); when the camera moves enough, visible
 * chunks are copied into one InstancedMesh per kind and detail level. Near instances use the high
 * mesh, far ones the low mesh; props with a cutoff shrink away over a short band instead of
 * popping out.
 */

export interface ScatterKind {
  id: string;
  high: BufferGeometry;
  low?: BufferGeometry;
  /** Camera distance (world units) beyond which the low mesh is used. */
  lodDistance?: number;
  /** Camera distance beyond which instances are hidden; they shrink away over the last 15%. */
  maxDistance?: number;
  /** Casts shadows (trees, bushes, rocks); grass and flowers do not. */
  shadows: boolean;
}

/** Instances of one chunk: per kind, matrices (16 floats each) and tints (3 floats each). */
export interface ScatterChunk {
  matrices: number[][];
  colors: number[][];
  /** Height range of the chunk's instances, for culling. */
  minY: number;
  maxY: number;
}

export function emptyScatterChunk(kinds: number): ScatterChunk {
  return {
    matrices: Array.from({ length: kinds }, () => []),
    colors: Array.from({ length: kinds }, () => []),
    minY: Infinity,
    maxY: -Infinity,
  };
}

const m4 = new Matrix4();
const q = new Quaternion();
const tiltA = new Quaternion();
const tiltB = new Quaternion();
const v = new Vector3();
const s = new Vector3();

/** Appends an instance to a chunk: position, yaw, uniform scale, lean (radians about x and z), tint. */
export function addInstance(
  chunk: ScatterChunk,
  kind: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
  leanX: number,
  leanZ: number,
  r: number,
  g: number,
  b: number,
  height = 1.6,
): void {
  // Lean is a small tilt: rotate about x then z, then turn about the vertical.
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  q.set(0, sy, 0, cy);
  tiltA.setFromAxisAngle(v.set(1, 0, 0), leanX);
  tiltB.setFromAxisAngle(v.set(0, 0, 1), leanZ);
  tiltA.multiply(tiltB).multiply(q);
  m4.compose(v.set(x, y, z), tiltA, s.set(scale, scale, scale));
  const list = chunk.matrices[kind]!;
  for (let i = 0; i < 16; i++) list.push(m4.elements[i]!);
  chunk.colors[kind]!.push(r, g, b);
  chunk.minY = Math.min(chunk.minY, y);
  chunk.maxY = Math.max(chunk.maxY, y + height * scale);
}

interface LevelMesh {
  mesh: InstancedMesh | null;
  count: number;
}

export class ScatterField {
  private readonly chunks: (ScatterChunk | null)[] = new Array<ScatterChunk | null>(
    CHUNKS_PER_SIDE * CHUNKS_PER_SIDE,
  ).fill(null);
  private readonly levels: { high: LevelMesh; low: LevelMesh }[];
  private dirty = true;
  private readonly lastPos = new Vector3(Infinity, 0, 0);
  private readonly lastDir = new Vector3();
  private readonly frustum = new Frustum();
  private readonly sphere = new Sphere();
  private readonly viewProj = new Matrix4();
  private readonly dir = new Vector3();
  private lod = 1;
  /** Instances drawn at the last fill, by kind id (for stats and tests). */
  readonly drawn = new Map<string, { high: number; low: number }>();

  constructor(
    private readonly scene: Scene,
    private readonly material: Material,
    readonly kinds: readonly ScatterKind[],
    private readonly env: WorldEnv,
  ) {
    this.levels = kinds.map(() => ({ high: { mesh: null, count: 0 }, low: { mesh: null, count: 0 } }));
  }

  /** Scales level of detail and cutoff distances (quality presets). */
  set lodScale(k: number) {
    if (k === this.lod) return;
    this.lod = k;
    this.dirty = true;
  }

  private readonly kindIds = new Map<string, number>();

  kindIndex(id: string): number {
    if (this.kindIds.size === 0) this.kinds.forEach((k, i) => this.kindIds.set(k.id, i));
    return this.kindIds.get(id) ?? -1;
  }

  setChunk(index: number, chunk: ScatterChunk | null): void {
    this.chunks[index] = chunk;
    this.dirty = true;
  }

  /** Forces a refill on the next update (quality changed, say). */
  invalidate(): void {
    this.dirty = true;
  }

  /** Refills the instanced meshes when the camera moved enough or chunks changed. True if refilled. */
  update(camera: PerspectiveCamera): boolean {
    camera.getWorldDirection(this.dir);
    const focusDist = camera.position.distanceTo(this.env.focus);
    const moved = camera.position.distanceTo(this.lastPos);
    const turned = this.dir.angleTo(this.lastDir);
    if (!this.dirty && moved < 0.4 + focusDist * 0.02 && turned < 0.02) return false;
    this.dirty = false;
    this.lastPos.copy(camera.position);
    this.lastDir.copy(this.dir);
    this.fill(camera, 3 + focusDist * 0.06);
    return true;
  }

  private ensure(level: LevelMesh, geometry: BufferGeometry, need: number, shadows: boolean): InstancedMesh {
    let mesh = level.mesh;
    if (!mesh || mesh.instanceMatrix.count < need) {
      const capacity = Math.max(64, 1 << Math.ceil(Math.log2(Math.max(1, need))));
      if (mesh) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
      mesh = new InstancedMesh(geometry, this.material, capacity);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.userData.qotiShadows = shadows;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      level.mesh = mesh;
    }
    return mesh;
  }

  private fill(camera: PerspectiveCamera, margin: number): void {
    camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);
    const cam = camera.position;
    const visible: ScatterChunk[] = [];
    const dists: number[] = [];
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!c || c.maxY < c.minY) continue;
      const cx = (i % CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cz = Math.floor(i / CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cy = (c.minY + c.maxY) / 2;
      const halfY = (c.maxY - c.minY) / 2;
      this.sphere.center.set(cx, cy, cz);
      this.sphere.radius = Math.hypot(CHUNK_SIZE * 0.71, halfY) + margin;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      visible.push(c);
      dists.push(cam.distanceTo(this.sphere.center) - this.sphere.radius + margin);
    }
    for (let k = 0; k < this.kinds.length; k++) {
      const kind = this.kinds[k]!;
      const max = (kind.maxDistance ?? Infinity) * this.lod;
      const fadeFrom = max * 0.85;
      const lod = kind.low ? (kind.lodDistance ?? Infinity) * this.lod : Infinity;
      // Count first, so meshes are sized once.
      let need = 0;
      for (let c = 0; c < visible.length; c++)
        if (dists[c]! < max) need += visible[c]!.matrices[k]!.length / 16;
      const lv = this.levels[k]!;
      if (need === 0) {
        if (lv.high.mesh) lv.high.mesh.count = 0;
        if (lv.low.mesh) lv.low.mesh.count = 0;
        this.drawn.set(kind.id, { high: 0, low: 0 });
        continue;
      }
      const high = this.ensure(lv.high, kind.high, need, kind.shadows);
      const low = kind.low ? this.ensure(lv.low, kind.low, need, kind.shadows) : null;
      const hm = high.instanceMatrix.array as Float32Array;
      const hc = high.instanceColor!.array as Float32Array;
      const lm = low ? (low.instanceMatrix.array as Float32Array) : null;
      const lc = low ? (low.instanceColor!.array as Float32Array) : null;
      let nh = 0;
      let nl = 0;
      for (let c = 0; c < visible.length; c++) {
        if (dists[c]! >= max) continue;
        const mats = visible[c]!.matrices[k]!;
        const cols = visible[c]!.colors[k]!;
        const n = mats.length / 16;
        for (let i = 0; i < n; i++) {
          const o = i * 16;
          const dx = mats[o + 12]! - cam.x;
          const dy = mats[o + 13]! - cam.y;
          const dz = mats[o + 14]! - cam.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d >= max) continue;
          const useLow = lm !== null && d > lod;
          const outM = useLow ? lm : hm;
          const outC = useLow ? lc! : hc;
          const at = useLow ? nl++ : nh++;
          const shrink = d > fadeFrom ? 1 - (d - fadeFrom) / (max - fadeFrom) : 1;
          const mo = at * 16;
          for (let e = 0; e < 16; e++) outM[mo + e] = mats[o + e]!;
          if (shrink < 1) {
            for (const e of [0, 1, 2, 4, 5, 6, 8, 9, 10]) outM[mo + e]! *= shrink;
          }
          outC[at * 3] = cols[i * 3]!;
          outC[at * 3 + 1] = cols[i * 3 + 1]!;
          outC[at * 3 + 2] = cols[i * 3 + 2]!;
        }
      }
      high.count = nh;
      high.instanceMatrix.needsUpdate = true;
      high.instanceColor!.needsUpdate = true;
      high.visible = nh > 0;
      if (low) {
        low.count = nl;
        low.instanceMatrix.needsUpdate = true;
        low.instanceColor!.needsUpdate = true;
        low.visible = nl > 0;
      }
      this.drawn.set(kind.id, { high: nh, low: nl });
    }
  }

  dispose(): void {
    for (const lv of this.levels) {
      for (const m of [lv.high.mesh, lv.low.mesh]) {
        if (!m) continue;
        this.scene.remove(m);
        m.dispose();
      }
    }
  }
}

/**
 * The foliage material: the kit's matte vertex-colored look with a gentle wind sway that grows
 * with height, so canopies, grass and reeds breathe a little. Instance tints come in through the
 * standard instance color.
 */
export function createFoliageMaterial(env: WorldEnv): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = env.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          'vec3 qBase = instanceMatrix[3].xyz;',
          '#else',
          'vec3 qBase = vec3(0.0);',
          '#endif',
          'float qPhase = qBase.x * 0.37 + qBase.z * 0.61;',
          'float qSway = max(transformed.y - 0.25, 0.0);',
          'transformed.x += sin(uTime * 1.3 + qPhase) * qSway * qSway * 0.035;',
          'transformed.z += cos(uTime * 1.05 + qPhase * 1.3) * qSway * qSway * 0.025;',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'qoti-foliage';
  return m;
}
