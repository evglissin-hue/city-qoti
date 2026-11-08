// Levels of detail and culling (V1D; docs/spec/20-architecture.md, Lean renderer). Every kit builds
// a `high` and a `low` level (V1B, V1C; until they land, the kits' low versions stand in); this file
// decides which one shows. Each instance keeps its level until the camera crosses the preset's
// distance by more than half of LOD_HYSTERESIS either way, so nothing flickers at the line, and
// swaps that build geometry (buildings) are queued and applied a few per frame, nearest first.
// Decor gets the instanced field scatter.ts gives trees: per chunk frustum culling and a level per
// instance, with small props shrinking away beyond the decor distance.
import { CHUNK_SIZE, CHUNKS_PER_SIDE } from '@qoti/sim';
import {
  Frustum,
  InstancedMesh,
  Matrix4,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Material,
  type PerspectiveCamera,
  type Scene,
} from 'three';

export type Level = 'high' | 'low';

/** The band around a level's distance (a share of it) inside which an instance keeps its level. */
export const LOD_HYSTERESIS = 0.1;
/** At most this many queued swaps a frame, and no more once this many ms have gone on them. */
export const MAX_SWAPS_PER_FRAME = 24;
export const SWAP_BUDGET_MS = 4;

/**
 * The level for an instance `distance` from the camera, `high` within `threshold` and `low`
 * beyond, keeping `prev` within the hysteresis band (an instance with no level yet takes the plain
 * answer).
 */
export function levelFor(
  prev: Level | undefined,
  distance: number,
  threshold: number,
  hysteresis = LOD_HYSTERESIS,
): Level {
  const band = (threshold * hysteresis) / 2;
  if (prev === 'low') return distance < threshold - band ? 'high' : 'low';
  if (prev === 'high') return distance > threshold + band ? 'low' : 'high';
  return distance > threshold ? 'low' : 'high';
}

/**
 * Level swaps waiting their turn (buildings, where a swap may build geometry): the nearest go
 * first, at most MAX_SWAPS_PER_FRAME and SWAP_BUDGET_MS a frame, so a zoom never stalls a frame.
 */
export class SwapQueue {
  private readonly want = new Map<number, { level: Level; distance: number }>();

  constructor(
    private readonly maxPerFrame = MAX_SWAPS_PER_FRAME,
    private readonly budgetMs = SWAP_BUDGET_MS,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  get size(): number {
    return this.want.size;
  }

  /** Item `id` wants `level` (it is `distance` from the camera). */
  set(id: number, level: Level, distance: number): void {
    this.want.set(id, { level, distance });
  }

  /** Item `id` is at the level it wants (or gone): nothing to do. */
  delete(id: number): void {
    this.want.delete(id);
  }

  clear(): void {
    this.want.clear();
  }

  /**
   * Applies the nearest swaps through `apply`, within the frame's limits (`all` ignores them, for
   * the first look after a load). Returns how many ran.
   */
  drain(apply: (id: number, level: Level) => void, all = false): number {
    if (this.want.size === 0) return 0;
    const order = [...this.want].sort((a, b) => a[1].distance - b[1].distance);
    const start = this.clock();
    let n = 0;
    for (const [id, w] of order) {
      if (!all && (n >= this.maxPerFrame || (n > 0 && this.clock() - start > this.budgetMs))) break;
      this.want.delete(id);
      apply(id, w.level);
      n++;
    }
    return n;
  }
}

/** One kind of instance in a field: its two levels and how it behaves far away. */
export interface FieldKind {
  high: BufferGeometry;
  low: BufferGeometry;
  /** Small props shrink away beyond the detail distance; larger ones switch to `low` there. */
  small: boolean;
  /** Height of the kind's top above its base, for culling. */
  height: number;
}

/** Bounding radius (tiles) under which a decor kind counts as a small prop. */
export const SMALL_RADIUS = 0.9;

/** Instances of one kind in one chunk: matrices (16 floats each) and each one's current level. */
interface ChunkKind {
  matrices: number[];
  levels: (Level | undefined)[];
}

interface ChunkInstances {
  kinds: Map<string, ChunkKind>;
  minY: number;
  maxY: number;
}

const LEVEL_KEYS: readonly Level[] = ['high', 'low'];

/**
 * Instanced kinds (decor) culled per 16 x 16 tile chunk and leveled per instance: when the camera
 * has moved enough or the instances changed, the visible chunks are copied into one InstancedMesh
 * per kind and level. Within `detail` tiles of the camera an instance draws `high`, beyond it
 * `low`, and a small kind shrinks away over the last 15% before `detail` and is gone beyond it.
 */
export class InstanceField {
  private readonly chunks: (ChunkInstances | null)[] = new Array<ChunkInstances | null>(
    CHUNKS_PER_SIDE * CHUNKS_PER_SIDE,
  ).fill(null);
  private readonly meshes = new Map<string, Record<Level, InstancedMesh | null>>();
  private readonly kinds = new Map<string, FieldKind>();
  private dirty = true;
  private detail = 80;
  private readonly lastPos = new Vector3(Infinity, 0, 0);
  private readonly lastDir = new Vector3();
  private readonly dir = new Vector3();
  private readonly frustum = new Frustum();
  private readonly sphere = new Sphere();
  private readonly viewProj = new Matrix4();
  /** Instances drawn at the last fill, per level (for stats and tests). */
  readonly drawn = { high: 0, low: 0 };

  constructor(
    private readonly scene: Scene,
    private readonly material: Material,
    private readonly kindFor: (key: string) => FieldKind,
  ) {}

  private kind(key: string): FieldKind {
    let k = this.kinds.get(key);
    if (!k) {
      k = this.kindFor(key);
      this.kinds.set(key, k);
    }
    return k;
  }

  /** Replaces every instance: `key` names the kind, `matrix` places it. */
  set(instances: Iterable<{ key: string; matrix: Matrix4 }>): void {
    this.chunks.fill(null);
    for (const { key, matrix } of instances) {
      const e = matrix.elements;
      const x = e[12]!;
      const y = e[13]!;
      const z = e[14]!;
      const cx = Math.min(CHUNKS_PER_SIDE - 1, Math.max(0, Math.floor(x / CHUNK_SIZE)));
      const cz = Math.min(CHUNKS_PER_SIDE - 1, Math.max(0, Math.floor(z / CHUNK_SIZE)));
      const i = cz * CHUNKS_PER_SIDE + cx;
      let c = this.chunks[i];
      if (!c) this.chunks[i] = c = { kinds: new Map(), minY: Infinity, maxY: -Infinity };
      let ck = c.kinds.get(key);
      if (!ck) c.kinds.set(key, (ck = { matrices: [], levels: [] }));
      for (let k = 0; k < 16; k++) ck.matrices.push(e[k]!);
      ck.levels.push(undefined);
      c.minY = Math.min(c.minY, y);
      c.maxY = Math.max(c.maxY, y + this.kind(key).height);
    }
    this.dirty = true;
  }

  /** The detail distance in tiles (the preset's decor distance). */
  setDetail(distance: number): void {
    if (distance === this.detail) return;
    this.detail = distance;
    this.dirty = true;
  }

  /** Refills the meshes when the camera moved enough or the instances changed. True if refilled. */
  update(camera: PerspectiveCamera, focus: Vector3): boolean {
    camera.getWorldDirection(this.dir);
    const focusDist = camera.position.distanceTo(focus);
    const moved = camera.position.distanceTo(this.lastPos);
    const turned = this.dir.angleTo(this.lastDir);
    if (!this.dirty && moved < 0.4 + focusDist * 0.02 && turned < 0.02) return false;
    this.dirty = false;
    this.lastPos.copy(camera.position);
    this.lastDir.copy(this.dir);
    this.fill(camera, 3 + focusDist * 0.06);
    return true;
  }

  private ensure(key: string, level: Level, need: number): InstancedMesh {
    let slot = this.meshes.get(key);
    if (!slot) this.meshes.set(key, (slot = { high: null, low: null }));
    let mesh = slot[level];
    if (!mesh || mesh.instanceMatrix.count < need) {
      const capacity = Math.max(16, 1 << Math.ceil(Math.log2(Math.max(1, need))));
      if (mesh) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
      const k = this.kind(key);
      mesh = new InstancedMesh(level === 'high' ? k.high : k.low, this.material, capacity);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.name = `${key}:${level}`;
      this.scene.add(mesh);
      slot[level] = mesh;
    }
    return mesh;
  }

  private fill(camera: PerspectiveCamera, margin: number): void {
    camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);
    const cam = camera.position;
    const detail = this.detail;
    const band = (detail * LOD_HYSTERESIS) / 2;
    // Count first per kind and level (sizing the meshes once), then copy.
    const counts = new Map<string, Record<Level, number>>();
    const visible: ChunkInstances[] = [];
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!c) continue;
      const cx = (i % CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cz = Math.floor(i / CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2;
      const halfY = (c.maxY - c.minY) / 2;
      this.sphere.center.set(cx, c.minY + halfY, cz);
      this.sphere.radius = Math.hypot(CHUNK_SIZE * 0.71, halfY) + margin;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      visible.push(c);
      for (const [key, ck] of c.kinds) {
        const small = this.kind(key).small;
        let n = counts.get(key);
        if (!n) counts.set(key, (n = { high: 0, low: 0 }));
        const count = ck.levels.length;
        for (let j = 0; j < count; j++) {
          const o = j * 16;
          const dx = ck.matrices[o + 12]! - cam.x;
          const dy = ck.matrices[o + 13]! - cam.y;
          const dz = ck.matrices[o + 14]! - cam.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (small && d >= detail + band) {
            ck.levels[j] = 'low';
            continue;
          }
          const lv = levelFor(ck.levels[j], d, detail);
          ck.levels[j] = lv;
          n[lv]++;
        }
      }
    }
    this.drawn.high = 0;
    this.drawn.low = 0;
    for (const [key, slot] of this.meshes) {
      if (counts.has(key)) continue;
      for (const lv of LEVEL_KEYS) if (slot[lv]) slot[lv].count = 0;
    }
    for (const [key, n] of counts) {
      const small = this.kind(key).small;
      const out: Record<Level, InstancedMesh | null> = {
        high: n.high > 0 ? this.ensure(key, 'high', n.high) : (this.meshes.get(key)?.high ?? null),
        low: n.low > 0 ? this.ensure(key, 'low', n.low) : (this.meshes.get(key)?.low ?? null),
      };
      const at: Record<Level, number> = { high: 0, low: 0 };
      const fadeFrom = detail * 0.85;
      const fadeTo = detail + band;
      for (const c of visible) {
        const ck = c.kinds.get(key);
        if (!ck) continue;
        for (let j = 0; j < ck.levels.length; j++) {
          const o = j * 16;
          const dx = ck.matrices[o + 12]! - cam.x;
          const dy = ck.matrices[o + 13]! - cam.y;
          const dz = ck.matrices[o + 14]! - cam.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (small && d >= fadeTo) continue;
          const lv = ck.levels[j]!;
          const mesh = out[lv]!;
          const arr = mesh.instanceMatrix.array as Float32Array;
          const mo = at[lv]++ * 16;
          for (let e = 0; e < 16; e++) arr[mo + e] = ck.matrices[o + e]!;
          if (small && d > fadeFrom) {
            const shrink = Math.max(0, 1 - (d - fadeFrom) / (fadeTo - fadeFrom));
            for (const e of [0, 1, 2, 4, 5, 6, 8, 9, 10]) arr[mo + e]! *= shrink;
          }
        }
      }
      for (const lv of LEVEL_KEYS) {
        const mesh = out[lv];
        if (!mesh) continue;
        mesh.count = at[lv];
        mesh.visible = at[lv] > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (at[lv] > 0) mesh.instanceMatrix.addUpdateRange(0, at[lv] * 16);
        this.drawn[lv] += at[lv];
      }
    }
  }

  dispose(): void {
    for (const slot of this.meshes.values()) {
      for (const lv of LEVEL_KEYS) {
        const m = slot[lv];
        if (!m) continue;
        this.scene.remove(m);
        m.dispose();
      }
    }
    this.meshes.clear();
    this.chunks.fill(null);
  }
}
