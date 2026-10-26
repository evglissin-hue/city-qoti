import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';

export type V3 = [number, number, number];

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpN = new Vector3();
const tmpColor = new Color();
const hsl = { h: 0, s: 0, l: 0 };

/** A small deterministic generator (mulberry32). Same seed, same sequence, on every laptop. */
export function seeded(seed: number): () => number {
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A gentle hue and lightness nudge for variety; `amount` 1 is about plus or minus 4 percent. */
export function vary(hex: number, rnd: () => number, amount = 1): number {
  tmpColor.setHex(hex).getHSL(hsl);
  const h = hsl.h + (rnd() - 0.5) * 0.03 * amount;
  const l = Math.min(1, Math.max(0, hsl.l + (rnd() - 0.5) * 0.08 * amount));
  return tmpColor.setHSL((h + 1) % 1, hsl.s, l).getHex();
}

/** Mix two colors; t 0 is `a`, 1 is `b`. */
export function mixHex(a: number, b: number, t: number): number {
  const ca = new Color(a);
  return ca.lerp(new Color(b), t).getHex();
}

/**
 * Accumulates flat-shaded, vertex-colored triangles and emits one non-indexed geometry.
 * Faces take an outward hint and flip themselves if needed, so winding mistakes cannot
 * produce inside-out pieces. Every geometry carries a `glow` attribute (1 on panes and flames)
 * and baked vertex ambient occlusion (darker at the base and on undersides, lighter on top).
 */
export class ShapeBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly glows: number[] = [];
  private readonly color = new Color();
  private glowValue = 0;

  /** Sets the glow written for the following faces (1 for window panes and flames). */
  glow(value: number): this {
    this.glowValue = value;
    return this;
  }

  /** Triangle count so far. */
  get triangles(): number {
    return this.positions.length / 9;
  }

  tri(a: V3, b: V3, c: V3, hex: number, outward?: V3): this {
    tmpA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    tmpB.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    tmpN.crossVectors(tmpA, tmpB);
    if (tmpN.lengthSq() === 0) return this;
    if (outward && tmpN.x * outward[0] + tmpN.y * outward[1] + tmpN.z * outward[2] < 0) {
      [b, c] = [c, b];
      tmpN.negate();
    }
    tmpN.normalize();
    this.color.setHex(hex);
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(tmpN.x, tmpN.y, tmpN.z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
      this.glows.push(this.glowValue);
    }
    return this;
  }

  quad(a: V3, b: V3, c: V3, d: V3, hex: number, outward?: V3): this {
    return this.tri(a, b, c, hex, outward).tri(a, c, d, hex, outward);
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number): this {
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], hex, [0, 1, 0]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, [0, -1, 0]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex, [0, 0, 1]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], hex, [0, 0, -1]);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], hex, [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex, [-1, 0, 0]);
    return this;
  }

  /** A box whose top edges are chamfered by `b`, for soft, rounded-feeling blocks. */
  rbox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, b = 0.03): this {
    const bb = Math.min(b, (x1 - x0) / 2.2, (z1 - z0) / 2.2, (y1 - y0) / 1.5);
    const ym = y1 - bb;
    const top: V3[] = [
      [x0 + bb, y1, z0 + bb],
      [x1 - bb, y1, z0 + bb],
      [x1 - bb, y1, z1 - bb],
      [x0 + bb, y1, z1 - bb],
    ];
    const mid: V3[] = [
      [x0, ym, z0],
      [x1, ym, z0],
      [x1, ym, z1],
      [x0, ym, z1],
    ];
    const bot: V3[] = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
    ];
    const outs: V3[] = [
      [0, 0, -1],
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ];
    this.quad(top[0]!, top[1]!, top[2]!, top[3]!, hex, [0, 1, 0]);
    this.quad(bot[0]!, bot[1]!, bot[2]!, bot[3]!, hex, [0, -1, 0]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const o = outs[i]!;
      this.quad(bot[i]!, bot[j]!, mid[j]!, mid[i]!, hex, o);
      this.quad(mid[i]!, mid[j]!, top[j]!, top[i]!, hex, [o[0], 1, o[2]]);
    }
    return this;
  }

  /** A gable roof over [x0, x1] x [z0, z1] from eave height y0 to ridge y1. Ridge runs along x or z. */
  gable(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    y1: number,
    hex: number,
    ridgeAlongX: boolean,
  ): this {
    if (ridgeAlongX) {
      const zm = (z0 + z1) / 2;
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, zm], [x0, y1, zm], hex, [0, 1, 1]);
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, zm], [x0, y1, zm], hex, [0, 1, -1]);
      this.tri([x0, y0, z0], [x0, y0, z1], [x0, y1, zm], hex, [-1, 0, 0]);
      this.tri([x1, y0, z0], [x1, y0, z1], [x1, y1, zm], hex, [1, 0, 0]);
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, [0, -1, 0]);
    } else {
      const xm = (x0 + x1) / 2;
      this.quad([x1, y0, z0], [x1, y0, z1], [xm, y1, z1], [xm, y1, z0], hex, [1, 1, 0]);
      this.quad([x0, y0, z0], [x0, y0, z1], [xm, y1, z1], [xm, y1, z0], hex, [-1, 1, 0]);
      this.tri([x0, y0, z0], [x1, y0, z0], [xm, y1, z0], hex, [0, 0, -1]);
      this.tri([x0, y0, z1], [x1, y0, z1], [xm, y1, z1], hex, [0, 0, 1]);
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, [0, -1, 0]);
    }
    return this;
  }

  /**
   * A chunky slab gable roof with generous eaves: two sloped slabs of thickness `t` over
   * [x0, x1] x [z0, z1] (already including the overhang), eaves at y0, ridge at y1, and a ridge cap.
   */
  slabRoof(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    y1: number,
    hex: number,
    edgeHex: number,
    ridgeAlongX: boolean,
    t = 0.07,
  ): this {
    // Work in (a = along ridge, c = across ridge) and map back.
    const m = (a: number, y: number, c: number): V3 => (ridgeAlongX ? [a, y, c] : [c, y, a]);
    const a0 = ridgeAlongX ? x0 : z0;
    const a1 = ridgeAlongX ? x1 : z1;
    const c0 = ridgeAlongX ? z0 : x0;
    const c1 = ridgeAlongX ? z1 : x1;
    const cm = (c0 + c1) / 2;
    const up = (dc: number): V3 => (ridgeAlongX ? [0, 1, dc] : [dc, 1, 0]);
    const along = (da: number): V3 => (ridgeAlongX ? [da, 0, 0] : [0, 0, da]);
    for (const ce of [c0, c1]) {
      const dir = ce < cm ? -1 : 1;
      this.quad(m(a0, y0, ce), m(a1, y0, ce), m(a1, y1, cm), m(a0, y1, cm), hex, up(dir));
      this.quad(m(a0, y0 - t, ce), m(a1, y0 - t, ce), m(a1, y1 - t, cm), m(a0, y1 - t, cm), edgeHex, [
        -up(dir)[0],
        -1,
        -up(dir)[2],
      ]);
      // Eave fascia.
      this.quad(
        m(a0, y0 - t, ce),
        m(a1, y0 - t, ce),
        m(a1, y0, ce),
        m(a0, y0, ce),
        edgeHex,
        ridgeAlongX ? [0, 0, dir] : [dir, 0, 0],
      );
      // Verge ends.
      for (const ae of [a0, a1]) {
        const da = ae < (a0 + a1) / 2 ? -1 : 1;
        this.quad(m(ae, y0, ce), m(ae, y1, cm), m(ae, y1 - t, cm), m(ae, y0 - t, ce), edgeHex, along(da));
      }
    }
    // Ridge cap.
    const r = 0.05;
    const [rx0, ry0, rz0] = m(a0 - 0.02, y1 - 0.03, cm - r);
    const [rx1, ry1, rz1] = m(a1 + 0.02, y1 + 0.04, cm + r);
    this.box(
      Math.min(rx0, rx1),
      Math.min(ry0, ry1),
      Math.min(rz0, rz1),
      Math.max(rx0, rx1),
      Math.max(ry0, ry1),
      Math.max(rz0, rz1),
      edgeHex,
    );
    return this;
  }

  /** A closed cylinder (or a cone when rTop is 0) around (cx, cz). */
  cylinder(
    cx: number,
    cz: number,
    rBottom: number,
    rTop: number,
    y0: number,
    y1: number,
    hex: number,
    segments = 8,
    phase = 0,
  ): this {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2 + phase;
      const a1 = ((i + 1) / segments) * Math.PI * 2 + phase;
      const mid = (a0 + a1) / 2;
      const out: V3 = [Math.cos(mid), 0.3, Math.sin(mid)];
      const b0: V3 = [cx + Math.cos(a0) * rBottom, y0, cz + Math.sin(a0) * rBottom];
      const b1: V3 = [cx + Math.cos(a1) * rBottom, y0, cz + Math.sin(a1) * rBottom];
      const t0: V3 = [cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop];
      const t1: V3 = [cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop];
      if (rTop > 0) this.quad(b0, b1, t1, t0, hex, out);
      else this.tri(b0, b1, [cx, y1, cz], hex, out);
      if (rTop > 0) this.tri([cx, y1, cz], t0, t1, hex, [0, 1, 0]);
      this.tri([cx, y0, cz], b0, b1, hex, [0, -1, 0]);
    }
    return this;
  }

  /**
   * A low-poly blob (an octahedron, subdivided once when `detail` is 1), for canopies and bushes.
   * `wobble` and `rnd` nudge vertices for a lumpy, hand-made silhouette.
   */
  blob(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    hex: number,
    detail = 1,
    rnd?: () => number,
    wobble = 0,
    topHex?: number,
  ): this {
    const v: V3[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    const faces: [number, number, number][] = [
      [0, 2, 4],
      [4, 2, 1],
      [1, 2, 5],
      [5, 2, 0],
      [0, 4, 3],
      [4, 1, 3],
      [1, 5, 3],
      [5, 0, 3],
    ];
    const norm = (p: V3): V3 => {
      const l = Math.hypot(p[0], p[1], p[2]);
      return [p[0] / l, p[1] / l, p[2] / l];
    };
    const mid = (a: V3, b: V3): V3 => norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    // Per-direction wobble, keyed by a rounded direction so shared vertices move together.
    const bumps = new Map<string, number>();
    const bump = (p: V3): number => {
      if (!rnd || wobble === 0) return 1;
      const key = `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
      let b = bumps.get(key);
      if (b === undefined) {
        b = 1 + (rnd() - 0.5) * 2 * wobble;
        bumps.set(key, b);
      }
      return b;
    };
    const place = (p: V3): V3 => {
      const k = bump(p);
      return [cx + p[0] * rx * k, cy + p[1] * ry * k, cz + p[2] * rz * k];
    };
    for (const [i, j, k] of faces) {
      const a = v[i]!;
      const b = v[j]!;
      const c = v[k]!;
      const tris: V3[][] =
        detail > 0
          ? [
              [a, mid(a, b), mid(c, a)],
              [mid(a, b), b, mid(b, c)],
              [mid(c, a), mid(b, c), c],
              [mid(a, b), mid(b, c), mid(c, a)],
            ]
          : [[a, b, c]];
      for (const t of tris) {
        const center = norm([
          t[0]![0] + t[1]![0] + t[2]![0],
          t[0]![1] + t[1]![1] + t[2]![1],
          t[0]![2] + t[1]![2] + t[2]![2],
        ]);
        // C3D-1: an optional sunlit color for the upward faces (canopies, bushes).
        const c = topHex !== undefined && center[1] > 0.45 ? topHex : hex;
        this.tri(place(t[0]!), place(t[1]!), place(t[2]!), c, center);
      }
    }
    return this;
  }

  /**
   * C3D-1: a thin tapered blade from (x, 0, z) leaning towards `dir` (radians), two triangles back to
   * back so it reads from both sides. For grass, reeds and leaves.
   */
  blade(
    x: number,
    z: number,
    height: number,
    width: number,
    lean: number,
    dir: number,
    hex: number,
    tipHex = hex,
  ): this {
    const dx = Math.cos(dir);
    const dz = Math.sin(dir);
    // The blade's flat side faces sideways to its lean.
    const sx = -dz * width * 0.5;
    const sz = dx * width * 0.5;
    const tip: V3 = [x + dx * lean, height, z + dz * lean];
    const a: V3 = [x - sx, 0, z - sz];
    const b: V3 = [x + sx, 0, z + sz];
    const out: V3 = [-dz, 0.3, dx];
    this.tri(a, b, tip, hex, out);
    this.tri(a, b, tip, tipHex, [dz, 0.3, -dx]);
    return this;
  }

  /** C3D-1: moves everything built so far (used to lift or offset a finished piece). */
  translate(x: number, y: number, z: number): this {
    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i]! += x;
      this.positions[i + 1]! += y;
      this.positions[i + 2]! += z;
    }
    return this;
  }

  /** Scales everything built so far about the origin (used for tree growth stages). */
  scale(k: number): this {
    for (let i = 0; i < this.positions.length; i++) this.positions[i]! *= k;
    return this;
  }

  build(ao = true): BufferGeometry {
    const colors = this.colors.slice();
    if (ao) {
      let maxY = 0.001;
      for (let i = 1; i < this.positions.length; i += 3) maxY = Math.max(maxY, this.positions[i]!);
      const base = Math.min(0.28, maxY * 0.45);
      for (let v = 0; v < this.glows.length; v++) {
        if (this.glows[v]! > 0) continue;
        const y = this.positions[v * 3 + 1]!;
        const ny = this.normals[v * 3 + 1]!;
        let k = 0.74 + 0.26 * Math.min(1, Math.max(0, y / base)); // contact darkening at the base
        k *= 0.94 + 0.08 * Math.min(1, y / maxY); // gentle gradient, lighter on top
        if (ny > 0.5) k *= 1.04;
        if (ny < -0.5) k *= 0.72; // undersides of eaves and canopies
        for (let c = 0; c < 3; c++) colors[v * 3 + c] = Math.min(1, colors[v * 3 + c]! * k);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.setAttribute('glow', new Float32BufferAttribute(this.glows, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
