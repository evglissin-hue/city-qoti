import { content } from '@qoti/content';
import { DECOR_ROTATIONS, MAP_SIZE, type Rect } from '@qoti/sim';
import { DataTexture, LinearFilter, RedFormat, UnsignedByteType, type Texture } from 'three';
import type { Mirror } from '../state/mirror';
import { fpToWorld } from './coords';

/**
 * V1C: the ground AO texture. Soft ambient occlusion pooling on the ground next to walls, in narrow
 * streets and courtyards, and under tree crowns, in world space at about 2.5 texels a tile (480 x
 * 480 for the 192-tile map), sampled by the ground shader (ground.ts) and, if V1A wants it, by the
 * kit material for the bottoms of walls (`groundAoUniforms`).
 *
 * Sources go into a mask (0 open, 1 fully covered): building footprints from the occupant layer,
 * walls, hedges and fences from the linear decor, tree crowns from the tree layer and the decor
 * trees, and a little from other decor. The mask is blurred twice, a tight contact blur and a wide
 * enclosure blur, and the light left is 1 - contact * CONTACT_WEIGHT - enclosure * ENCLOSURE_WEIGHT.
 * It is never directional, so it looks right with the sun on any side.
 *
 * Edits rebuild only the touched tiles plus the blur's reach (a few milliseconds a chunk at most),
 * and the terrain layer reports the change so the still-frame cache and the cached shadows redraw.
 */

/** Texels per tile side. */
export const AO_TEXELS_PER_TILE = 2.5;
/** Texels per map side. */
export const AO_SIZE = Math.round(MAP_SIZE * AO_TEXELS_PER_TILE);
/** Box radii in texels; each blur runs twice, so the contact one reaches about 1.6 tiles, the wide one about 5. */
export const CONTACT_RADIUS = 2;
export const ENCLOSURE_RADIUS = 6;
/** How much each blur darkens, and the darkest the ground gets. *(tune)* */
export const CONTACT_WEIGHT = 0.7;
export const ENCLOSURE_WEIGHT = 0.25;
export const AO_FLOOR = 0.36;
/**
 * Under a building's own lot (its yard, its garden: the occupant layer covers the whole lot, the
 * walls stand inside it) the occlusion is this much gentler, so a yard is not a dark pit.
 */
export const LOT_LIFT = 0.55;
/** Texels an edit reaches after both passes of the wide blur. */
const REACH = ENCLOSURE_RADIUS * 2;
/** Tiles of decor and crowns that can spill into a neighboring tile's texels. */
const SOURCE_PAD = 2;

const T = AO_TEXELS_PER_TILE;
const S = AO_SIZE;

/** A soft source: a disc (len 0) or a capsule along (dx, dz), radius r, strength v. */
interface Blob {
  x: number;
  z: number;
  dx: number;
  dz: number;
  len: number;
  r: number;
  v: number;
  /** Falloff: 1 a hard edge with a short ramp (walls), 0 a dome (crowns). */
  hard: number;
}

/** How each kind of decor shadows the ground around it. Exported for tests. */
export function decorBlob(defId: string, fx: number, fz: number, rot: number): Blob | null {
  const def = content.decorById.get(defId);
  if (!def) return null;
  const x = fpToWorld(fx);
  const z = fpToWorld(fz);
  const tags = def.tags;
  if (tags.includes('tree')) return { x, z, dx: 0, dz: 0, len: 0, r: 1, v: 0.7, hard: 0 };
  if (def.linear) {
    const a = (rot * 2 * Math.PI) / DECOR_ROTATIONS;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    // Hedges and walls stand solid; a fence or a verge lets most of the light through.
    const hedge = tags.includes('hedge');
    const wall = tags.includes('wall');
    const r = hedge ? 0.32 : wall ? 0.26 : 0.12;
    const v = hedge ? 1 : wall ? 0.9 : tags.includes('fence') ? 0.4 : 0.2;
    return { x, z, dx, dz, len: 0.5, r, v, hard: 1 };
  }
  // Benches, planters, wells and the like: a small, faint pool.
  const r = Math.min(0.6, (def.radius / 256) * 0.9);
  return { x, z, dx: 0, dz: 0, len: 0, r, v: 0.3, hard: 0 };
}

function blobKey(b: Blob): string {
  return `${b.x.toFixed(3)},${b.z.toFixed(3)},${b.dx.toFixed(2)},${b.dz.toFixed(2)},${b.r},${b.v}`;
}

/** Sliding-window box blur of radius r along rows (step 1) or columns (step w), in place via tmp. */
function boxPass(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
): void {
  const n = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 1 : w;
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * w : l;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[base + Math.min(n - 1, Math.max(0, k)) * step]!;
    for (let i = 0; i < n; i++) {
      dst[base + i * step] = acc * inv;
      acc += src[base + Math.min(n - 1, i + r + 1) * step]! - src[base + Math.max(0, i - r) * step]!;
    }
  }
}

/** Two box passes each way (close to a Gaussian). */
function blur(
  src: Float32Array,
  out: Float32Array,
  tmp: Float32Array,
  w: number,
  h: number,
  r: number,
): void {
  boxPass(src, tmp, w, h, r, true);
  boxPass(tmp, out, w, h, r, false);
  boxPass(out, tmp, w, h, r, true);
  boxPass(tmp, out, w, h, r, false);
}

export class GroundAo {
  readonly texture: DataTexture;
  /** The uniform the ground shader binds (and V1A's kit material may). */
  readonly uniform: { value: DataTexture };
  /** Milliseconds the last rebuild took, and texels it wrote (for the overlay and tests). */
  lastMs = 0;
  lastTexels = 0;
  rebuilds = 0;
  private readonly mask = new Float32Array(S * S);
  private readonly bytes = new Uint8Array(S * S);
  private blobs = new Map<number, Blob>();
  private blobKeys = new Map<number, string>();
  /** Dirty tile rects (inclusive) waiting for a rebuild. */
  private dirty: Rect[] = [];
  private scratch = new Float32Array(0);

  constructor(private readonly mirror: Mirror) {
    this.texture = new DataTexture(this.bytes, S, S, RedFormat, UnsignedByteType);
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.uniform = { value: this.texture };
    this.syncDecor();
    this.dirty = [];
    this.rebuildRect([0, 0, MAP_SIZE - 1, MAP_SIZE - 1]);
  }

  /** True while edits wait for a rebuild. */
  get pending(): boolean {
    return this.dirty.length > 0;
  }

  /** Marks tiles (inclusive rect) whose sources changed. */
  markRect(rect: Rect): void {
    this.dirty.push([rect[0], rect[1], rect[2], rect[3]]);
  }

  markAll(): void {
    this.dirty = [[0, 0, MAP_SIZE - 1, MAP_SIZE - 1]];
  }

  /** Re-reads the decor that shadows the ground and marks the tiles of what came, went or moved. */
  syncDecor(): void {
    const next = new Map<number, Blob>();
    const keys = new Map<number, string>();
    for (const d of this.mirror.decor.values()) {
      const b = decorBlob(d.def, d.fx, d.fz, d.rot);
      if (!b) continue;
      next.set(d.id, b);
      keys.set(d.id, blobKey(b));
    }
    const touch = (b: Blob) => {
      const x = Math.floor(b.x);
      const z = Math.floor(b.z);
      this.dirty.push([x - 1, z - 1, x + 1, z + 1]);
    };
    for (const [id, b] of this.blobs) if (keys.get(id) !== this.blobKeys.get(id)) touch(b);
    for (const [id, b] of next) if (keys.get(id) !== this.blobKeys.get(id)) touch(b);
    this.blobs = next;
    this.blobKeys = keys;
  }

  /**
   * Rebuilds what is dirty, merged into one rect when the edits lie close together. Returns true
   * when the texture changed (V1X: only if a texel did, so an occupant change that leaves every
   * footprint where it was, such as a building finishing on its own site, keeps the still frame). A single building or a chunk takes well under the 4 ms budget.
   */
  update(): boolean {
    if (this.dirty.length === 0) return false;
    const rects = this.dirty;
    this.dirty = [];
    // Merge everything into the bounding rect when it is not much bigger than the parts.
    let area = 0;
    const box: Rect = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rects) {
      area += (r[2] - r[0] + 1) * (r[3] - r[1] + 1);
      box[0] = Math.min(box[0], r[0]);
      box[1] = Math.min(box[1], r[1]);
      box[2] = Math.max(box[2], r[2]);
      box[3] = Math.max(box[3], r[3]);
    }
    const t0 = now();
    const before = this.changed;
    let texels = 0;
    if ((box[2] - box[0] + 1) * (box[3] - box[1] + 1) <= area * 2 + 256) texels = this.rebuildRect(box);
    else for (const r of rects) texels += this.rebuildRect(r);
    this.lastMs = now() - t0;
    this.lastTexels = texels;
    return this.changed !== before;
  }

  /** V1X: texel writes that changed a value, so `update` can tell a real change from a repaint. */
  private changed = 0;

  /** Recomputes the mask for a tile rect and the light around it. Returns texels written. */
  private rebuildRect(rect: Rect): number {
    // Sources: the rect plus the reach of crowns and decor standing just outside it.
    const sx0 = Math.max(0, Math.floor((rect[0] - SOURCE_PAD) * T));
    const sz0 = Math.max(0, Math.floor((rect[1] - SOURCE_PAD) * T));
    const sx1 = Math.min(S - 1, Math.ceil((rect[2] + 1 + SOURCE_PAD) * T) - 1);
    const sz1 = Math.min(S - 1, Math.ceil((rect[3] + 1 + SOURCE_PAD) * T) - 1);
    this.paintMask(sx0, sz0, sx1, sz1);
    // Output: everything the changed mask reaches; input: the output plus the blur's own reach.
    const ox0 = Math.max(0, sx0 - REACH);
    const oz0 = Math.max(0, sz0 - REACH);
    const ox1 = Math.min(S - 1, sx1 + REACH);
    const oz1 = Math.min(S - 1, sz1 + REACH);
    const ix0 = Math.max(0, ox0 - REACH);
    const iz0 = Math.max(0, oz0 - REACH);
    const ix1 = Math.min(S - 1, ox1 + REACH);
    const iz1 = Math.min(S - 1, oz1 + REACH);
    const w = ix1 - ix0 + 1;
    const h = iz1 - iz0 + 1;
    const n = w * h;
    if (this.scratch.length < n * 4) this.scratch = new Float32Array(n * 4);
    const src = this.scratch.subarray(0, n);
    const near = this.scratch.subarray(n, n * 2);
    const wide = this.scratch.subarray(n * 2, n * 3);
    const tmp = this.scratch.subarray(n * 3, n * 4);
    for (let z = 0; z < h; z++)
      src.set(this.mask.subarray((iz0 + z) * S + ix0, (iz0 + z) * S + ix0 + w), z * w);
    blur(src, near, tmp, w, h, CONTACT_RADIUS);
    blur(src, wide, tmp, w, h, ENCLOSURE_RADIUS);
    const changedBefore = this.changed;
    for (let z = oz0; z <= oz1; z++) {
      const lz = z - iz0;
      for (let x = ox0; x <= ox1; x++) {
        const li = lz * w + (x - ix0);
        let light = Math.max(
          AO_FLOOR,
          Math.min(1, 1 - near[li]! * CONTACT_WEIGHT - wide[li]! * ENCLOSURE_WEIGHT),
        );
        // Deep inside a lot (the contact blur near 1) the light lifts; at its edge it does not, so
        // the change is as soft as the blur and never a lighter square with a hard rim.
        const inside = Math.max(0, Math.min(1, (near[li]! - 0.6) / 0.4));
        light += (1 - light) * LOT_LIFT * inside * inside * (3 - 2 * inside);
        const v = Math.round(255 * light);
        if (this.bytes[z * S + x] !== v) {
          this.bytes[z * S + x] = v;
          this.changed++;
        }
      }
    }
    if (this.changed !== changedBefore) this.texture.needsUpdate = true;
    this.rebuilds++;
    return (ox1 - ox0 + 1) * (oz1 - oz0 + 1);
  }

  /** Writes the source mask for a texel rect (inclusive). */
  private paintMask(x0: number, z0: number, x1: number, z1: number): void {
    const L = this.mirror.layers;
    const N = MAP_SIZE;
    for (let z = z0; z <= z1; z++) {
      const wz = (z + 0.5) / T;
      const tz = Math.floor(wz);
      for (let x = x0; x <= x1; x++) {
        const wx = (x + 0.5) / T;
        const tx = Math.floor(wx);
        let v = L.occupant[tz * N + tx] ? 1 : 0;
        if (v < 1) {
          // Forest crowns: a soft dome around each tree's tile center, from its own tile and the
          // neighbors (a crown is wider than its tile).
          for (let dz = -1; dz <= 1; dz++) {
            const nz = tz + dz;
            if (nz < 0 || nz >= N) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = tx + dx;
              if (nx < 0 || nx >= N || !L.tree[nz * N + nx]) continue;
              const ex = wx - nx - 0.5;
              const ez = wz - nz - 0.5;
              const d2 = (ex * ex + ez * ez) / 0.81;
              if (d2 < 1) v = Math.max(v, 0.42 * (1 - d2));
            }
          }
        }
        this.mask[z * S + x] = v;
      }
    }
    // Decor on top, rasterized into the same rect.
    const wx0 = x0 / T;
    const wz0 = z0 / T;
    const wx1 = (x1 + 1) / T;
    const wz1 = (z1 + 1) / T;
    for (const b of this.blobs.values()) {
      const reach = b.r + b.len + 0.2;
      if (b.x + reach < wx0 || b.x - reach > wx1 || b.z + reach < wz0 || b.z - reach > wz1) continue;
      const bx0 = Math.max(x0, Math.floor((b.x - reach) * T));
      const bz0 = Math.max(z0, Math.floor((b.z - reach) * T));
      const bx1 = Math.min(x1, Math.ceil((b.x + reach) * T));
      const bz1 = Math.min(z1, Math.ceil((b.z + reach) * T));
      for (let z = bz0; z <= bz1; z++) {
        const pz = (z + 0.5) / T - b.z;
        for (let x = bx0; x <= bx1; x++) {
          const px = (x + 0.5) / T - b.x;
          // Distance to the capsule's core segment.
          const along = Math.max(-b.len, Math.min(b.len, px * b.dx + pz * b.dz));
          const qx = px - b.dx * along;
          const qz = pz - b.dz * along;
          const d = Math.sqrt(qx * qx + qz * qz) / b.r;
          let k: number;
          if (b.hard) k = d < 1 ? 1 : Math.max(0, 1 - (d - 1) * 2.5);
          else k = d < 1 ? 1 - d * d : 0;
          if (k <= 0) continue;
          const i = z * S + x;
          this.mask[i] = Math.max(this.mask[i]!, b.v * k);
        }
      }
    }
  }

  /** The light value (0 to 1) at a world point, nearest texel. For tests and debugging. */
  sample(x: number, z: number): number {
    const tx = Math.min(S - 1, Math.max(0, Math.floor(x * T)));
    const tz = Math.min(S - 1, Math.max(0, Math.floor(z * T)));
    return this.bytes[tz * S + tx]! / 255;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** A clock for the rebuild timing (the client, not the sim: performance is fine here). */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** GLSL: `qGroundAo(worldXZ)`, the light left on the ground there (1 open, lower in occlusion). */
export const GROUND_AO_GLSL = /* glsl */ `
uniform sampler2D uGroundAo;
float qGroundAo(vec2 wp) {
  return texture2D(uGroundAo, wp / ${MAP_SIZE.toFixed(1)}).r;
}
`;

const aoUniforms = new WeakMap<object, { value: Texture }>();

/**
 * The ground AO texture's uniform for a world (one per WorldEnv): the terrain layer sets its value
 * to the live texture; until then (or without a terrain layer, as in the gallery) it is a white
 * texel, no occlusion. V1A's kit material can bind the same object for the bottoms of walls.
 */
export function groundAoFor(env: object): { value: Texture } {
  let u = aoUniforms.get(env);
  if (!u) {
    const white = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat, UnsignedByteType);
    white.needsUpdate = true;
    u = { value: white };
    aoUniforms.set(env, u);
  }
  return u;
}
