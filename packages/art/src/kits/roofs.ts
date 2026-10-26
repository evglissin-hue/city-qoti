// Roofs for the hamlet: gable, hip, half-hip (jerkinhead), gambrel (barn) and lean-to shapes, in
// tile, slate, thatch or shingle. Slopes are drawn as courses: each course a strip a little
// steeper than the roof with a small riser at its foot, so rows of tiles and shingles catch the
// light. Thatch is thick and soft-edged with a rolled ridge. Gable ends are closed by `gableEnds`.
import { vary, type ShapeBuilder, type V3 } from '../geometry';
import { palette } from '../palette';

export type RoofShape = 'gable' | 'hip' | 'halfHip' | 'gambrel' | 'lean';
export type RoofMaterial = 'tile' | 'slate' | 'thatch' | 'shingle';

export interface RoofSpec {
  shape: RoofShape;
  material: RoofMaterial;
  /** Outline including the overhang. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Eave and ridge heights. For a lean-to the ridge is the high side at c0. */
  y0: number;
  y1: number;
  color: number;
  /** Fascia, verge boards and the underside. */
  trim: number;
  ridgeAlongX: boolean;
  rnd: () => number;
  /** Skip the courses (low detail). */
  plain?: boolean;
  /** Underside color (defaults to a lighter trim, so overhangs do not read as holes). */
  soffit?: number;
}

/** Base colors per roof material when no swatch is chosen. */
export const ROOF_MATERIAL_COLORS: Record<RoofMaterial, number> = {
  tile: palette.roofTerracotta,
  slate: palette.roofSlate,
  thatch: palette.roofThatch,
  shingle: 0x8a6f58,
};

const COURSE_DEPTH: Record<RoofMaterial, number> = { tile: 0.13, slate: 0.1, thatch: 0.24, shingle: 0.09 };
const LIP: Record<RoofMaterial, number> = { tile: 0.03, slate: 0.016, thatch: 0.035, shingle: 0.018 };
const THICK: Record<RoofMaterial, number> = { tile: 0.06, slate: 0.05, thatch: 0.16, shingle: 0.05 };

function lighten(hex: number, k: number): number {
  const ch = (sh: number): number => Math.min(255, Math.round(((hex >> sh) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function lerp3(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function add(a: V3, n: V3, k: number): V3 {
  return [a[0] + n[0] * k, a[1] + n[1] * k, a[2] + n[2] * k];
}

function normalOf(a: V3, b: V3, c: V3, up: V3): V3 {
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[0] * up[0] + n[1] * up[1] + n[2] * up[2] < 0) n = [-n[0], -n[1], -n[2]];
  const l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/**
 * One roof plane: bottom-left, bottom-right (the eave), top-right, top-left (toward the ridge; equal
 * for a triangle). `out` is any vector pointing up and out of the roof.
 */
function slope(
  s: ShapeBuilder,
  spec: RoofSpec,
  bl: V3,
  br: V3,
  tr: V3,
  tl: V3,
  out: V3,
  color: number,
): void {
  const n = normalOf(bl, br, tl[0] === tr[0] && tl[1] === tr[1] && tl[2] === tr[2] ? tr : tl, out);
  const m = spec.material;
  const rnd = spec.rnd;
  const len = Math.sqrt((tl[0] - bl[0]) ** 2 + (tl[1] - bl[1]) ** 2 + (tl[2] - bl[2]) ** 2);
  const courses = spec.plain ? 1 : Math.max(2, Math.round(len / COURSE_DEPTH[m]));
  const lip = spec.plain ? 0 : LIP[m];
  const t = THICK[m];
  // Risers face down the slope; keep their normal level so they read as a lit lip, not an underside.
  const downhill: V3 = [bl[0] - tl[0], 0, bl[2] - tl[2]];
  for (let k = 0; k < courses; k++) {
    const f0 = k / courses;
    const f1 = (k + 1) / courses;
    const a = lerp3(bl, tl, f0);
    const b = lerp3(br, tr, f0);
    const c = lerp3(br, tr, f1);
    const d = lerp3(bl, tl, f1);
    // Thatch rows sit a little proud of the next; tiles and slates vary gently course by course.
    const hex = m === 'thatch' ? vary(color, rnd, 0.5) : vary(color, rnd, m === 'slate' ? 0.9 : 0.6);
    const a2 = add(a, n, lip);
    const b2 = add(b, n, lip);
    s.quad(a2, b2, c, d, hex, n);
    // Thatch rows show a sunlit, combed edge; tiles and slates a shadowed lip.
    if (lip > 0) s.quad(a, b, b2, a2, m === 'thatch' ? lighten(hex, 1.12) : vary(hex, rnd, 0.3), downhill);
  }
  // Underside and the eave fascia.
  const down: V3 = [-n[0], -n[1], -n[2]];
  s.quad(
    add(bl, n, -t),
    add(br, n, -t),
    add(tr, n, -t),
    add(tl, n, -t),
    spec.soffit ?? lighten(spec.trim, 1.6),
    down,
  );
  const eaveOut: V3 = [bl[0] - tl[0], 0, bl[2] - tl[2]];
  s.quad(
    add(bl, n, -t),
    add(br, n, -t),
    add(br, n, lip),
    add(bl, n, lip),
    m === 'thatch' ? vary(color, rnd, 1.2) : spec.trim,
    eaveOut,
  );
}

/** The roof proper. Returns the ridge height actually used (thatch sits a little higher). */
export function roofPart(s: ShapeBuilder, spec: RoofSpec): void {
  const { x0, z0, x1, z1, y0, y1, ridgeAlongX } = spec;
  // Work in (a along the ridge, c across it) and map back to x, z.
  const P = (a: number, y: number, c: number): V3 => (ridgeAlongX ? [a, y, c] : [c, y, a]);
  const a0 = ridgeAlongX ? x0 : z0;
  const a1 = ridgeAlongX ? x1 : z1;
  const c0 = ridgeAlongX ? z0 : x0;
  const c1 = ridgeAlongX ? z1 : x1;
  const cm = (c0 + c1) / 2;
  const half = (c1 - c0) / 2;
  const up = (dc: number): V3 => (ridgeAlongX ? [0, 1, dc] : [dc, 1, 0]);
  const end = (da: number): V3 => (ridgeAlongX ? [da, 1, 0] : [0, 1, da]);
  const color = spec.color;
  switch (spec.shape) {
    case 'gable': {
      slope(s, spec, P(a0, y0, c1), P(a1, y0, c1), P(a1, y1, cm), P(a0, y1, cm), up(1), color);
      slope(s, spec, P(a1, y0, c0), P(a0, y0, c0), P(a0, y1, cm), P(a1, y1, cm), up(-1), color);
      verges(s, spec, P, a0, a1, c0, c1, cm, y0, y1);
      ridge(s, spec, P(a0 - 0.02, y1, cm), P(a1 + 0.02, y1, cm));
      break;
    }
    case 'hip': {
      const inset = Math.min(half, (a1 - a0) / 2);
      const ra0 = a0 + inset;
      const ra1 = a1 - inset;
      slope(s, spec, P(a0, y0, c1), P(a1, y0, c1), P(ra1, y1, cm), P(ra0, y1, cm), up(1), color);
      slope(s, spec, P(a1, y0, c0), P(a0, y0, c0), P(ra0, y1, cm), P(ra1, y1, cm), up(-1), color);
      slope(s, spec, P(a0, y0, c0), P(a0, y0, c1), P(ra0, y1, cm), P(ra0, y1, cm), end(-1), color);
      slope(s, spec, P(a1, y0, c1), P(a1, y0, c0), P(ra1, y1, cm), P(ra1, y1, cm), end(1), color);
      if (ra1 > ra0) ridge(s, spec, P(ra0, y1, cm), P(ra1, y1, cm));
      for (const [ea, ra] of [
        [a0, ra0],
        [a1, ra1],
      ] as const) {
        for (const ec of [c0, c1]) ridge(s, spec, P(ea, y0, ec), P(ra, y1, cm), 0.035);
      }
      break;
    }
    case 'halfHip': {
      // A gable whose ends are clipped near the top by a small hip.
      const yc = y0 + (y1 - y0) * 0.58;
      const k = (yc - y0) / (y1 - y0);
      const cc0 = c0 + half * k;
      const cc1 = c1 - half * k;
      const inset = Math.min((a1 - a0) / 4, half * (1 - k) * 0.9);
      const ra0 = a0 + inset;
      const ra1 = a1 - inset;
      for (const [ce, cc, dir] of [
        [c1, cc1, 1],
        [c0, cc0, -1],
      ] as const) {
        const lower =
          dir > 0
            ? [P(a0, y0, ce), P(a1, y0, ce), P(a1, yc, cc), P(a0, yc, cc)]
            : [P(a1, y0, ce), P(a0, y0, ce), P(a0, yc, cc), P(a1, yc, cc)];
        slope(s, spec, lower[0]!, lower[1]!, lower[2]!, lower[3]!, up(dir), color);
        const upper =
          dir > 0
            ? [P(a0, yc, cc), P(a1, yc, cc), P(ra1, y1, cm), P(ra0, y1, cm)]
            : [P(a1, yc, cc), P(a0, yc, cc), P(ra0, y1, cm), P(ra1, y1, cm)];
        slope(s, spec, upper[0]!, upper[1]!, upper[2]!, upper[3]!, up(dir), color);
      }
      slope(s, spec, P(a0, yc, cc0), P(a0, yc, cc1), P(ra0, y1, cm), P(ra0, y1, cm), end(-1), color);
      slope(s, spec, P(a1, yc, cc1), P(a1, yc, cc0), P(ra1, y1, cm), P(ra1, y1, cm), end(1), color);
      verges(s, spec, P, a0, a1, c0, c1, cm, y0, yc, cc0, cc1);
      ridge(s, spec, P(ra0, y1, cm), P(ra1, y1, cm));
      for (const [ea, ra] of [
        [a0, ra0],
        [a1, ra1],
      ] as const) {
        for (const ec of [cc0, cc1]) ridge(s, spec, P(ea, yc, ec), P(ra, y1, cm), 0.03);
      }
      break;
    }
    case 'gambrel': {
      // Barn roof: a steep lower slope to the knee, a shallow upper slope to the ridge.
      const yk = y0 + (y1 - y0) * 0.62;
      const ck0 = c0 + half * 0.32;
      const ck1 = c1 - half * 0.32;
      slope(s, spec, P(a0, y0, c1), P(a1, y0, c1), P(a1, yk, ck1), P(a0, yk, ck1), up(0.4), color);
      slope(s, spec, P(a0, yk, ck1), P(a1, yk, ck1), P(a1, y1, cm), P(a0, y1, cm), up(1), color);
      slope(s, spec, P(a1, y0, c0), P(a0, y0, c0), P(a0, yk, ck0), P(a1, yk, ck0), up(-0.4), color);
      slope(s, spec, P(a1, yk, ck0), P(a0, yk, ck0), P(a0, y1, cm), P(a1, y1, cm), up(-1), color);
      for (const ae of [a0, a1]) {
        const da = ae === a0 ? -1 : 1;
        for (const [p0, p1] of [
          [P(ae, y0, c0), P(ae, yk, ck0)],
          [P(ae, yk, ck0), P(ae, y1, cm)],
          [P(ae, y0, c1), P(ae, yk, ck1)],
          [P(ae, yk, ck1), P(ae, y1, cm)],
        ] as const)
          board(s, spec, p0, p1, ridgeAlongX ? [da, 0, 0] : [0, 0, da]);
      }
      ridge(s, spec, P(a0 - 0.02, y1, cm), P(a1 + 0.02, y1, cm));
      break;
    }
    case 'lean': {
      // High side at c0, low eave at c1.
      slope(s, spec, P(a0, y0, c1), P(a1, y0, c1), P(a1, y1, c0), P(a0, y1, c0), up(1), color);
      for (const ae of [a0, a1]) {
        const da = ae === a0 ? -1 : 1;
        board(s, spec, P(ae, y0, c1), P(ae, y1, c0), ridgeAlongX ? [da, 0, 0] : [0, 0, da]);
      }
      board(s, spec, P(a0, y1, c0), P(a1, y1, c0), ridgeAlongX ? [0, 0, -1] : [-1, 0, 0]);
      break;
    }
  }
}

/** A flat verge or barge board along an edge, facing `out`. */
function board(s: ShapeBuilder, spec: RoofSpec, a: V3, b: V3, out: V3): void {
  const t = THICK[spec.material] + 0.03;
  const lip = spec.plain ? 0.01 : LIP[spec.material] + 0.01;
  const o: V3 = [out[0] * 0.012, 0, out[2] * 0.012];
  const hex = spec.material === 'thatch' ? vary(spec.color, spec.rnd, 1.4) : spec.trim;
  s.quad(
    add(a, [0, 1, 0], lip),
    add(b, [0, 1, 0], lip),
    add(add(b, [0, -1, 0], t), o, 1),
    add(add(a, [0, -1, 0], t), o, 1),
    hex,
    out,
  );
}

function verges(
  s: ShapeBuilder,
  spec: RoofSpec,
  P: (a: number, y: number, c: number) => V3,
  a0: number,
  a1: number,
  c0: number,
  c1: number,
  cm: number,
  y0: number,
  yTop: number,
  cc0 = cm,
  cc1 = cm,
): void {
  for (const ae of [a0, a1]) {
    const da = ae === a0 ? -1 : 1;
    const out: V3 = spec.ridgeAlongX ? [da, 0, 0] : [0, 0, da];
    board(s, spec, P(ae, y0, c0), P(ae, yTop, cc0), out);
    board(s, spec, P(ae, y0, c1), P(ae, yTop, cc1), out);
  }
}

/** A ridge (or hip) cap from a to b: rolled for thatch, a capped strip otherwise. */
function ridge(s: ShapeBuilder, spec: RoofSpec, a: V3, b: V3, r = 0.05): void {
  const thatch = spec.material === 'thatch';
  const rr = thatch ? r * 1.6 : r;
  const hex = thatch
    ? vary(spec.color, spec.rnd, 1.5)
    : spec.material === 'shingle'
      ? spec.trim
      : vary(spec.color, spec.rnd, 1.6);
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  if (len < 1e-4) return;
  // A five-sided cap (flat top, two shoulders, two skirts) along the line.
  const f: V3 = [d[0] / len, d[1] / len, d[2] / len];
  let side: V3 = [f[2], 0, -f[0]];
  const sl = Math.sqrt(side[0] * side[0] + side[2] * side[2]) || 1;
  side = [side[0] / sl, 0, side[2] / sl];
  const prof: [number, number][] = [
    [-1, -0.7],
    [-0.75, 0.25],
    [0, 0.55],
    [0.75, 0.25],
    [1, -0.7],
  ];
  const pt = (base: V3, i: number): V3 => {
    const [u, v] = prof[i]!;
    return [base[0] + side[0] * u * rr, base[1] + v * rr, base[2] + side[2] * u * rr];
  };
  for (let i = 0; i < prof.length - 1; i++) {
    const [u0, v0] = prof[i]!;
    const [u1, v1] = prof[i + 1]!;
    const out: V3 = [side[0] * (u0 + u1), v0 + v1 + 0.3, side[2] * (u0 + u1)];
    s.quad(pt(a, i), pt(b, i), pt(b, i + 1), pt(a, i + 1), hex, out);
  }
  for (const [base, dir] of [
    [a, -1],
    [b, 1],
  ] as const) {
    for (let i = 1; i < prof.length - 1; i++)
      s.tri(pt(base, 0), pt(base, i), pt(base, i + 1), hex, [f[0] * dir, 0, f[2] * dir]);
  }
}

/** Height of the roof's top surface across the ridge at `c` (in the roof's across coordinate). */
function profile(spec: RoofSpec, c: number): number {
  const { y0, y1 } = spec;
  const c0 = spec.ridgeAlongX ? spec.z0 : spec.x0;
  const c1 = spec.ridgeAlongX ? spec.z1 : spec.x1;
  const cm = (c0 + c1) / 2;
  const half = (c1 - c0) / 2;
  const dc = Math.abs(c - cm);
  switch (spec.shape) {
    case 'lean':
      return y1 - ((y1 - y0) * (c - c0)) / (c1 - c0);
    case 'gambrel': {
      const yk = y0 + (y1 - y0) * 0.62;
      const dk = half * 0.68;
      return dc >= dk ? y0 + ((yk - y0) * (half - dc)) / (half - dk) : yk + ((y1 - yk) * (dk - dc)) / dk;
    }
    case 'halfHip':
      return Math.min(y0 + (y1 - y0) * (1 - dc / half), y0 + (y1 - y0) * 0.58);
    default:
      return y0 + (y1 - y0) * (1 - dc / half);
  }
}

/**
 * Closes the gable ends under a gable, half-hip, gambrel or lean-to roof with wall material, from
 * the top of the walls (y) up to the underside of the roof. (wx0, wz0, wx1, wz1) is the wall outline.
 */
export function gableEnds(
  s: ShapeBuilder,
  spec: RoofSpec,
  wx0: number,
  wz0: number,
  wx1: number,
  wz1: number,
  y: number,
  hex: number,
): void {
  if (spec.shape === 'hip') return;
  const along = spec.ridgeAlongX;
  const P = (a: number, yy: number, c: number): V3 => (along ? [a, yy, c] : [c, yy, a]);
  const a0 = along ? wx0 : wz0;
  const a1 = along ? wx1 : wz1;
  const c0 = along ? wz0 : wx0;
  const c1 = along ? wz1 : wx1;
  const rc0 = along ? spec.z0 : spec.x0;
  const rc1 = along ? spec.z1 : spec.x1;
  const cm = (rc0 + rc1) / 2;
  const half = (rc1 - rc0) / 2;
  // Points along the top: the wall corners and the roof's breaks in between.
  const cs: number[] = [c0];
  if (spec.shape === 'gable') cs.push(cm);
  if (spec.shape === 'gambrel') cs.push(cm - half * 0.68, cm, cm + half * 0.68);
  // A half-hip's little hip plane is level across the ridge, at a height set by how far the wall
  // stands in from the roof's end: the gable rises until it meets that plane.
  let cap = Infinity;
  if (spec.shape === 'halfHip') {
    const ra0 = along ? spec.x0 : spec.z0;
    const ra1 = along ? spec.x1 : spec.z1;
    const k = 0.58;
    const yc = spec.y0 + (spec.y1 - spec.y0) * k;
    const inset = Math.min((ra1 - ra0) / 4, half * (1 - k) * 0.9);
    const delta = Math.max(0, a0 - ra0);
    cap = yc + (spec.y1 - yc) * Math.min(1, delta / inset) * 0.95;
    const dc = half * (1 - (cap - spec.y0) / (spec.y1 - spec.y0));
    cs.push(cm - dc, cm + dc);
  }
  cs.push(c1);
  const t = THICK[spec.material] + 0.01;
  const roofAt = (c: number): number =>
    spec.shape === 'halfHip'
      ? Math.min(spec.y0 + (spec.y1 - spec.y0) * (1 - Math.abs(c - cm) / half), cap)
      : profile(spec, c);
  const top = cs
    .filter((c) => c >= c0 - 1e-6 && c <= c1 + 1e-6)
    .sort((a, b) => a - b)
    .map((c) => [c, Math.max(y, roofAt(c) - t)] as const);
  for (const ae of [a0, a1]) {
    const out: V3 = along ? [ae === a0 ? -1 : 1, 0, 0] : [0, 0, ae === a0 ? -1 : 1];
    const base = P(ae, y, (c0 + c1) / 2);
    const ring: V3[] = [P(ae, y, c0), ...top.map(([c, yy]) => P(ae, yy, c)), P(ae, y, c1)];
    for (let i = 0; i < ring.length - 1; i++) s.tri(base, ring[i]!, ring[i + 1]!, hex, out);
  }
}
