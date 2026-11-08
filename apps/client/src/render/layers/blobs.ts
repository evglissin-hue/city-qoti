// V1C: soft blob shadows under moving things. Since V1D nothing on a moving layer casts into the
// cached sun shadow map (a moving caster's shadow would stay behind on the still-frame cache), so
// animals and carts get a soft dark disc on the ground instead, the way residents have had one
// since C3D. Residents keep their own (the agents layer draws theirs with each figure and drops it
// with the figure beyond the resident detail distance, so one draw call covers both); this layer
// takes everything else that moves.
//
// Producers (animals, carts) fill a channel each frame: `blobChannel(ctx, 'carts')`, then `begin()`,
// `push(...)` per figure and `end()`. Each channel is one instanced mesh under this layer's root,
// so the order the layers run in does not matter, and nothing waits a frame.
import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import type { LayerContext, RenderLayer } from './types';

/** A blob's darkness, as the residents' (agents.ts). */
export const BLOB_OPACITY = 0.3;
/** Lift above the ground, under the residents' (0.012) so theirs draw on top where they meet. */
const LIFT = 0.01;
/**
 * Blobs shrink away over the last 15% of this share of the decor detail distance: about the
 * resident detail distance on every preset (quality.ts: 30 of 40, 60 of 80, 100 of 140, 140 of 200).
 */
export const BLOB_DISTANCE_SHARE = 0.72;

/** One producer's blobs: positions, radii along and across its heading. */
export class BlobChannel {
  /** x, y, z, radius across, radius along, heading (6 floats per blob). */
  private data = new Float32Array(6 * 64);
  count = 0;
  mesh: InstancedMesh | null = null;

  constructor(
    readonly id: string,
    private readonly sink: BlobSink,
  ) {}

  begin(): void {
    this.count = 0;
  }

  /** A blob at a ground point: `rx` across and `rz` along `heading` (radians, as the figure faces). */
  push(x: number, y: number, z: number, rx: number, rz = rx, heading = 0): void {
    if ((this.count + 1) * 6 > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const o = this.count * 6;
    this.data[o] = x;
    this.data[o + 1] = y;
    this.data[o + 2] = z;
    this.data[o + 3] = rx;
    this.data[o + 4] = rz;
    this.data[o + 5] = heading;
    this.count++;
  }

  end(): void {
    this.sink.flush(this);
  }

  /** The blob list (for tests). */
  get blobs(): Float32Array {
    return this.data.subarray(0, this.count * 6);
  }
}

const m = new Matrix4();
const cam = new Vector3();

/** Every channel of one renderer, and the layer that draws them once it is there. */
export class BlobSink {
  readonly channels = new Map<string, BlobChannel>();
  ctx: LayerContext | null = null;
  material: MeshBasicMaterial | null = null;
  readonly geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  /** Blobs drawn at the last flush, per channel (for tests and the overlay). */
  readonly drawn = new Map<string, number>();

  channel(id: string): BlobChannel {
    let c = this.channels.get(id);
    if (!c) {
      c = new BlobChannel(id, this);
      this.channels.set(id, c);
    }
    return c;
  }

  flush(c: BlobChannel): void {
    const ctx = this.ctx;
    if (!ctx || !this.material) return;
    let mesh = c.mesh;
    if (!mesh || mesh.instanceMatrix.count < c.count) {
      if (mesh) {
        ctx.scene.remove(mesh);
        mesh.dispose();
      }
      const cap = Math.max(64, 1 << Math.ceil(Math.log2(Math.max(1, c.count))));
      mesh = new InstancedMesh(this.geometry, this.material, cap);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.noCast = true;
      ctx.scene.add(mesh);
      c.mesh = mesh;
    }
    const env = ctx.env;
    const max = (env?.detailDistance ?? 80) * BLOB_DISTANCE_SHARE;
    const fadeFrom = max * 0.85;
    cam.setFromMatrixPosition(ctx.camera.matrixWorld);
    const d = c.blobs;
    const out = mesh.instanceMatrix.array as Float32Array;
    let n = 0;
    for (let i = 0; i < c.count; i++) {
      const o = i * 6;
      const x = d[o]!;
      const y = d[o + 1]!;
      const z = d[o + 2]!;
      const dist = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
      if (dist >= max) continue;
      const k = dist > fadeFrom ? 1 - (dist - fadeFrom) / (max - fadeFrom) : 1;
      const rx = d[o + 3]! * 2 * k;
      const rz = d[o + 4]! * 2 * k;
      const h = d[o + 5]!;
      const cs = Math.cos(h);
      const sn = Math.sin(h);
      // Scale (rx across, rz along), then turn to the heading (+z forward), then place.
      m.set(cs * rx, 0, sn * rz, x, 0, 1, 0, y + LIFT, -sn * rx, 0, cs * rz, z, 0, 0, 0, 1);
      m.toArray(out, n * 16);
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, n * 16);
    mesh.instanceMatrix.needsUpdate = true;
    this.drawn.set(c.id, n);
  }

  dispose(): void {
    for (const c of this.channels.values()) {
      if (c.mesh) {
        this.ctx?.scene.remove(c.mesh);
        c.mesh.dispose();
        c.mesh = null;
      }
    }
    this.geometry.dispose();
    this.material?.dispose();
    (this.material?.alphaMap as CanvasTexture | null)?.dispose();
    this.material = null;
    this.ctx = null;
  }
}

const sinks = new WeakMap<object, BlobSink>();

/** The sink for a renderer's world (keyed by its Mirror, which every layer of it shares). */
export function blobSinkFor(mirror: object): BlobSink {
  let s = sinks.get(mirror);
  if (!s) {
    s = new BlobSink();
    sinks.set(mirror, s);
  }
  return s;
}

/** A producer's channel: `blobChannel(ctx, 'carts')`. */
export function blobChannel(ctx: LayerContext, id: string): BlobChannel {
  return blobSinkFor(ctx.mirror).channel(id);
}

/** A soft round falloff: dark in the middle, gone at the rim. */
function blobTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#d8d8d8');
    grad.addColorStop(0.75, '#6a6a6a');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

export function blobsLayer(): RenderLayer {
  let sink: BlobSink | null = null;
  return {
    id: 'blobs',
    motion: 'moving',
    init(ctx) {
      sink = blobSinkFor(ctx.mirror);
      sink.ctx = ctx;
      const tex = blobTexture();
      sink.material = new MeshBasicMaterial({
        color: 0x1e2a1a,
        transparent: true,
        opacity: BLOB_OPACITY,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        ...(tex ? { alphaMap: tex } : {}),
      });
    },
    update() {},
    dispose() {
      sink?.dispose();
      sink = null;
    },
  };
}
