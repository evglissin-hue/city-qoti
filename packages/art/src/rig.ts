// A small flat-shaded builder for rigged, tinted figures (residents and what they carry). Like
// ShapeBuilder, but every face also records a paint channel and a rig group, written as the
// `paint` and `rig` vertex attributes that the resident material reads:
//
// - paint 0 keeps the vertex color, 1 takes the instance color (clothes), 2 and 3 take the
//   per-instance fur tints (main and light fur). Tinted faces store a white shade, so baked
//   occlusion still darkens them.
// - rig 0 is rigid; the others swing in the vertex shader (see RIG and resident shader hooks).
import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import type { V3 } from './geometry';

export const PAINT = { fixed: 0, cloth: 1, fur: 2, furLight: 3 } as const;
export type Paint = (typeof PAINT)[keyof typeof PAINT];

/** Rig groups and their pivots; the shader swings each group about its pivot. */
export const RIG = { none: 0, armL: 1, armR: 2, footL: 3, footR: 4, ears: 5, tail: 6 } as const;
export type Rig = (typeof RIG)[keyof typeof RIG];

/** Pivots in figure space (feet at y 0, facing +z). The shader keeps a copy of these numbers. */
export const RIG_PIVOTS: Record<Rig, V3> = {
  0: [0, 0, 0],
  1: [0.066, 0.15, 0],
  2: [-0.066, 0.15, 0],
  3: [0.034, 0.03, 0.01],
  4: [-0.034, 0.03, 0.01],
  5: [0, 0.255, 0.01],
  6: [0, 0.07, -0.06],
};

export interface Channel {
  hex: number;
  paint?: Paint;
  rig?: Rig;
  /** C4P: darkens a tinted face (a hem, a cuff) by this factor; fixed faces ignore it. */
  shade?: number;
}

const ta = new Vector3();
const tb = new Vector3();
const tn = new Vector3();
const tmp = new Color();

export class RigBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];
  private readonly paint: number[] = [];
  private readonly rig: number[] = [];

  /** While set, vertex normals come from this function (smooth shading) instead of the face. */
  private normalAt: ((p: V3) => V3 | null) | null = null;

  get triangles(): number {
    return this.pos.length / 9;
  }

  tri(a: V3, b: V3, c: V3, ch: Channel, outward?: V3): this {
    ta.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    tb.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    tn.crossVectors(ta, tb);
    if (tn.lengthSq() === 0) return this;
    if (outward && tn.x * outward[0] + tn.y * outward[1] + tn.z * outward[2] < 0) {
      [b, c] = [c, b];
      tn.negate();
    }
    tn.normalize();
    const paint = ch.paint ?? PAINT.fixed;
    tmp.setHex(paint === PAINT.fixed ? ch.hex : 0xffffff);
    if (paint !== PAINT.fixed && ch.shade !== undefined) tmp.multiplyScalar(ch.shade);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      const n = this.normalAt?.(p);
      if (n) this.nor.push(n[0], n[1], n[2]);
      else this.nor.push(tn.x, tn.y, tn.z);
      this.col.push(tmp.r, tmp.g, tmp.b);
      this.paint.push(paint);
      this.rig.push(ch.rig ?? RIG.none);
    }
    return this;
  }

  quad(a: V3, b: V3, c: V3, d: V3, ch: Channel, outward?: V3): this {
    return this.tri(a, b, c, ch, outward).tri(a, c, d, ch, outward);
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, ch: Channel): this {
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], ch, [0, 1, 0]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], ch, [0, -1, 0]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], ch, [0, 0, 1]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], ch, [0, 0, -1]);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], ch, [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], ch, [-1, 0, 0]);
    return this;
  }

  /**
   * A lathed ellipsoid: `seg` slices around y (slice 0 centered on +z when `phase` is 0) and
   * `rings` bands from top to bottom. `pick` chooses the channel per face from its mean direction,
   * so one body can carry a vest band, a light belly and a dark cap (null skips the face).
   */
  ellipsoid(
    c: V3,
    r: V3,
    seg: number,
    rings: number,
    pick: (nx: number, ny: number, nz: number, ring: number) => Channel | null,
    phase = Math.PI / seg,
    top = 0,
    bottom = Math.PI,
  ): this {
    this.normalAt = (p) => {
      const x = (p[0] - c[0]) / (r[0] * r[0]);
      const y = (p[1] - c[1]) / (r[1] * r[1]);
      const z = (p[2] - c[2]) / (r[2] * r[2]);
      const l = Math.sqrt(x * x + y * y + z * z) || 1;
      return [x / l, y / l, z / l];
    };
    const at = (t: number, p: number): V3 => [
      c[0] + r[0] * Math.sin(t) * Math.sin(p),
      c[1] + r[1] * Math.cos(t),
      c[2] + r[2] * Math.sin(t) * Math.cos(p),
    ];
    for (let i = 0; i < rings; i++) {
      const t0 = top + ((bottom - top) * i) / rings;
      const t1 = top + ((bottom - top) * (i + 1)) / rings;
      const tm = (t0 + t1) / 2;
      for (let j = 0; j < seg; j++) {
        const p0 = (j / seg) * Math.PI * 2 + phase;
        const p1 = ((j + 1) / seg) * Math.PI * 2 + phase;
        const pm = (p0 + p1) / 2;
        const out: V3 = [Math.sin(tm) * Math.sin(pm), Math.cos(tm), Math.sin(tm) * Math.cos(pm)];
        const ch = pick(out[0], out[1], out[2], i);
        if (!ch) continue;
        const a = at(t0, p0);
        const b = at(t0, p1);
        const cc = at(t1, p1);
        const d = at(t1, p0);
        if (t0 <= 0.0001) this.tri(a, cc, d, ch, out);
        else if (t1 >= Math.PI - 0.0001) this.tri(a, b, cc, ch, out);
        else this.quad(a, b, cc, d, ch, out);
      }
    }
    this.normalAt = null;
    return this;
  }

  /** An octahedron stretched to radii r: the cheapest rounded nub (8 faces). */
  nub(c: V3, r: V3, ch: Channel): this {
    const px: V3 = [c[0] + r[0], c[1], c[2]];
    const nx: V3 = [c[0] - r[0], c[1], c[2]];
    const py: V3 = [c[0], c[1] + r[1], c[2]];
    const ny: V3 = [c[0], c[1] - r[1], c[2]];
    const pz: V3 = [c[0], c[1], c[2] + r[2]];
    const nz: V3 = [c[0], c[1], c[2] - r[2]];
    for (const [a, b, y] of [
      [px, pz, py],
      [pz, nx, py],
      [nx, nz, py],
      [nz, px, py],
      [px, pz, ny],
      [pz, nx, ny],
      [nx, nz, ny],
      [nz, px, ny],
    ] as const) {
      const out: V3 = [
        a[0] + b[0] + y[0] - 3 * c[0],
        a[1] + b[1] + y[1] - 3 * c[1],
        a[2] + b[2] + y[2] - 3 * c[2],
      ];
      this.tri(a, b, y, ch, out);
    }
    return this;
  }

  /**
   * A tapered tube along a polyline (for tails and ear tips): `n` sides, radius per point.
   * Cheap and good for curls.
   */
  tube(points: V3[], radii: number[], n: number, chs: Channel | ((i: number) => Channel)): this {
    const frames: { p: V3; u: V3; v: V3 }[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const q = points[Math.min(points.length - 1, i + 1)]!;
      const o = points[Math.max(0, i - 1)]!;
      const t = new Vector3(q[0] - o[0], q[1] - o[1], q[2] - o[2]).normalize();
      const ref = Math.abs(t.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
      const u = new Vector3().crossVectors(t, ref).normalize();
      const v = new Vector3().crossVectors(t, u).normalize();
      frames.push({ p, u: [u.x, u.y, u.z], v: [v.x, v.y, v.z] });
    }
    const ring = (i: number, k: number): V3 => {
      const f = frames[i]!;
      const a = (k / n) * Math.PI * 2;
      const r = radii[i]!;
      return [
        f.p[0] + (f.u[0] * Math.cos(a) + f.v[0] * Math.sin(a)) * r,
        f.p[1] + (f.u[1] * Math.cos(a) + f.v[1] * Math.sin(a)) * r,
        f.p[2] + (f.u[2] * Math.cos(a) + f.v[2] * Math.sin(a)) * r,
      ];
    };
    const normals = new Map<string, V3>();
    const key = (p: V3): string => `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}`;
    for (let i = 0; i < points.length; i++) {
      for (let k = 0; k <= n; k++) {
        const p = ring(i, k);
        const f = frames[i]!;
        const d: V3 = [p[0] - f.p[0], p[1] - f.p[1], p[2] - f.p[2]];
        const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
        if (l > 1e-6) normals.set(key(p), [d[0] / l, d[1] / l, d[2] / l]);
      }
    }
    this.normalAt = (p) => normals.get(key(p)) ?? null;
    for (let i = 0; i < points.length - 1; i++) {
      const ch = typeof chs === 'function' ? chs(i) : chs;
      for (let k = 0; k < n; k++) {
        const a = ring(i, k);
        const b = ring(i, k + 1);
        const c = ring(i + 1, k + 1);
        const d = ring(i + 1, k);
        const m = frames[i]!.p;
        const mid: V3 = [(a[0] + c[0]) / 2 - m[0], (a[1] + c[1]) / 2 - m[1], (a[2] + c[2]) / 2 - m[2]];
        if (radii[i + 1]! <= 0.0001) this.tri(a, b, c, ch, mid);
        else if (radii[i]! <= 0.0001) this.tri(a, c, d, ch, mid);
        else this.quad(a, b, c, d, ch, mid);
      }
    }
    this.normalAt = null;
    return this;
  }

  /**
   * Emits the geometry with baked occlusion (darker toward the feet and on undersides) and the
   * `paint`, `rig` and `glow` attributes. `height` is the figure height the occlusion fades over.
   * With `tints`, the paint channels are baked into the vertex colors (and paint reads 0), for
   * still figures drawn with the plain kit material.
   */
  build(height = 0.3, tints?: { cloth: number; fur: number; furLight: number }): BufferGeometry {
    const colors = this.col.slice();
    const paint = this.paint.slice();
    if (tints) {
      const by = [0xffffff, tints.cloth, tints.fur, tints.furLight];
      for (let v = 0; v < paint.length; v++) {
        if (paint[v] === PAINT.fixed) continue;
        tmp.setHex(by[paint[v]!]!);
        colors[v * 3] = colors[v * 3]! * tmp.r;
        colors[v * 3 + 1] = colors[v * 3 + 1]! * tmp.g;
        colors[v * 3 + 2] = colors[v * 3 + 2]! * tmp.b;
        paint[v] = PAINT.fixed;
      }
    }
    for (let v = 0; v < this.paint.length; v++) {
      const y = this.pos[v * 3 + 1]!;
      const ny = this.nor[v * 3 + 1]!;
      let k = 0.8 + 0.2 * Math.min(1, Math.max(0, y / (height * 0.45)));
      if (ny > 0.5) k *= 1.04;
      if (ny < -0.5) k *= 0.8;
      for (let c = 0; c < 3; c++) colors[v * 3 + c] = Math.min(1, colors[v * 3 + c]! * k);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.setAttribute('paint', new Float32BufferAttribute(paint, 1));
    g.setAttribute('rig', new Float32BufferAttribute(this.rig, 1));
    g.setAttribute('glow', new Float32BufferAttribute(new Float32Array(this.paint.length), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
