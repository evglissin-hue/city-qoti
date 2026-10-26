import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';

type V3 = [number, number, number];

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpN = new Vector3();

/**
 * Accumulates flat-shaded, vertex-colored triangles and emits one non-indexed geometry.
 * Faces take an outward hint and flip themselves if needed, so winding mistakes cannot
 * produce inside-out pieces.
 */
export class ShapeBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly color = new Color();

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
  ): this {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
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

  /** A low-poly blob (octahedron subdivided once), for canopies and bushes. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, hex: number): this {
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
    const place = (p: V3): V3 => [cx + p[0] * rx, cy + p[1] * ry, cz + p[2] * rz];
    for (const [i, j, k] of faces) {
      const a = v[i]!;
      const b = v[j]!;
      const c = v[k]!;
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      for (const t of [
        [a, ab, ca],
        [ab, b, bc],
        [ca, bc, c],
        [ab, bc, ca],
      ] as V3[][]) {
        const center = norm([
          t[0]![0] + t[1]![0] + t[2]![0],
          t[0]![1] + t[1]![1] + t[2]![1],
          t[0]![2] + t[1]![2] + t[2]![2],
        ]);
        this.tri(place(t[0]!), place(t[1]!), place(t[2]!), hex, center);
      }
    }
    return this;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
