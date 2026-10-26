// Modular building parts: walls in plaster, timber frame, stone, weatherboard, brick or logs;
// windows with shutters and flower boxes; doors (arched, plank, double barn); chimneys; porches;
// dormers; hanging signs and awnings. Faces are addressed in a local frame (u along the face, y up,
// o outward from the wall plane) so one part works on any of the four sides.
import { vary, type ShapeBuilder, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam, cylX, cylZ } from '../shapes';

export type FaceDir = 'z+' | 'z-' | 'x+' | 'x-';

export interface Face {
  dir: FaceDir;
  /** The wall plane coordinate (z for z faces, x for x faces). */
  plane: number;
}

export function facePoint(f: Face, u: number, y: number, o: number): V3 {
  switch (f.dir) {
    case 'z+':
      return [u, y, f.plane + o];
    case 'z-':
      return [u, y, f.plane - o];
    case 'x+':
      return [f.plane + o, y, u];
    case 'x-':
      return [f.plane - o, y, u];
  }
}

export function outwardOf(f: Face): V3 {
  switch (f.dir) {
    case 'z+':
      return [0, 0, 1];
    case 'z-':
      return [0, 0, -1];
    case 'x+':
      return [1, 0, 0];
    case 'x-':
      return [-1, 0, 0];
  }
}

/** An axis-aligned box given in face-local coordinates. */
export function faceBox(
  s: ShapeBuilder,
  f: Face,
  u0: number,
  y0: number,
  o0: number,
  u1: number,
  y1: number,
  o1: number,
  hex: number,
): void {
  const a = facePoint(f, u0, y0, o0);
  const b = facePoint(f, u1, y1, o1);
  s.box(
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.max(a[2], b[2]),
    hex,
  );
}

/** A quad lying in a face plane (offset o), facing out. */
export function faceQuad(
  s: ShapeBuilder,
  f: Face,
  u0: number,
  y0: number,
  u1: number,
  y1: number,
  o: number,
  hex: number,
): void {
  s.quad(
    facePoint(f, u0, y0, o),
    facePoint(f, u1, y0, o),
    facePoint(f, u1, y1, o),
    facePoint(f, u0, y1, o),
    hex,
    outwardOf(f),
  );
}

/** The four faces of an outline, with each face's u range. */
export function facesOf(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): { f: Face; u0: number; u1: number }[] {
  return [
    { f: { dir: 'z+', plane: z1 }, u0: x0, u1: x1 },
    { f: { dir: 'z-', plane: z0 }, u0: x0, u1: x1 },
    { f: { dir: 'x+', plane: x1 }, u0: z0, u1: z1 },
    { f: { dir: 'x-', plane: x0 }, u0: z0, u1: z1 },
  ];
}

// --- Walls -----------------------------------------------------------------------------------------

export type WallMaterial = 'plaster' | 'timber' | 'stone' | 'weatherboard' | 'brick' | 'log';

export interface WallSpec {
  material: WallMaterial;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y0: number;
  y1: number;
  /** Plaster, board or stone color. */
  color: number;
  /** Timber framing and trim. */
  trim: number;
  rnd: () => number;
  /** Heights of floor beams (timber and plaster walls). */
  beams?: number[];
  /** Low detail: no studs, stones or boards. */
  plain?: boolean;
}

/** How far cladding stands proud of the wall plane: windows and doors sit on top of it. */
export function claddingDepth(m: WallMaterial): number {
  return m === 'log' ? 0.05 : m === 'weatherboard' ? 0.02 : m === 'stone' ? 0.015 : 0.012;
}

export function wallsOf(s: ShapeBuilder, w: WallSpec): void {
  const { x0, z0, x1, z1, y0, y1, rnd } = w;
  const core = w.material === 'log' ? vary(palette.darkWood, rnd, 0.5) : w.color;
  s.box(x0, y0, z0, x1, y1, z1, core);
  if (w.plain) {
    if (w.material === 'timber' || w.material === 'plaster') cornerPosts(s, w);
    return;
  }
  switch (w.material) {
    case 'plaster':
      cornerPosts(s, w);
      for (const y of w.beams ?? [])
        s.box(x0 - 0.03, y - 0.03, z0 - 0.03, x1 + 0.03, y + 0.03, z1 + 0.03, w.trim);
      break;
    case 'timber':
      cornerPosts(s, w);
      for (const y of w.beams ?? [])
        s.box(x0 - 0.03, y - 0.03, z0 - 0.03, x1 + 0.03, y + 0.03, z1 + 0.03, w.trim);
      timberFrame(s, w);
      break;
    case 'stone':
      stones(s, w);
      break;
    case 'brick':
      s.box(x0 - 0.01, y0, z0 - 0.01, x1 + 0.01, y0 + 0.08, z1 + 0.01, palette.foundation);
      quoins(s, w, palette.stone);
      s.box(x0 - 0.015, y1 - 0.05, z0 - 0.015, x1 + 0.015, y1, z1 + 0.015, palette.stone);
      break;
    case 'weatherboard':
      boards(s, w);
      break;
    case 'log':
      logs(s, w);
      break;
  }
}

function cornerPosts(s: ShapeBuilder, w: WallSpec): void {
  const { x0, z0, x1, z1, y0, y1 } = w;
  const p = 0.045;
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ] as const) {
    s.box(x - p, y0, z - p, x + p, y1, z + p, w.trim);
  }
  s.box(x0 - 0.035, y1 - 0.055, z0 - 0.035, x1 + 0.035, y1, z1 + 0.035, w.trim);
  s.box(x0 - 0.03, y0, z0 - 0.03, x1 + 0.03, y0 + 0.05, z1 + 0.03, w.trim);
}

/** Studs and diagonal braces on every face, between the floor beams. */
function timberFrame(s: ShapeBuilder, w: WallSpec): void {
  const levels = [w.y0, ...(w.beams ?? []), w.y1];
  for (const { f, u0, u1 } of facesOf(w.x0, w.z0, w.x1, w.z1)) {
    const len = u1 - u0;
    const bays = Math.max(1, Math.round(len / 0.5));
    for (let l = 0; l < levels.length - 1; l++) {
      const ya = levels[l]! + 0.04;
      const yb = levels[l + 1]! - 0.04;
      for (let b = 1; b < bays; b++) {
        const u = u0 + (len * b) / bays;
        faceBox(s, f, u - 0.022, ya, 0, u + 0.022, yb, 0.012, w.trim);
      }
      // Braces in the end bays, leaning in toward the middle.
      const bw = len / bays;
      if (bw > 0.25) {
        const k = 0.016;
        beam(s, facePoint(f, u0 + 0.04, ya, k), facePoint(f, u0 + bw * 0.85, yb, k), 0.016, w.trim);
        beam(s, facePoint(f, u1 - 0.04, ya, k), facePoint(f, u1 - bw * 0.85, yb, k), 0.016, w.trim);
      }
    }
  }
}

function quoins(s: ShapeBuilder, w: WallSpec, hex: number): void {
  const { x0, z0, x1, z1, y0, y1, rnd } = w;
  const h = 0.12;
  let k = 0;
  for (let y = y0 + 0.06; y + h <= y1 + 0.001; y += h, k++) {
    for (const [x, z, sx, sz] of [
      [x0, z0, 1, 1],
      [x1, z0, -1, 1],
      [x1, z1, -1, -1],
      [x0, z1, 1, -1],
    ] as const) {
      const lx = k % 2 ? 0.16 : 0.09;
      const lz = k % 2 ? 0.09 : 0.16;
      const c = vary(hex, rnd, 1.2);
      s.box(
        Math.min(x, x + sx * lx) - 0.012,
        y,
        Math.min(z, z + sz * 0.012) - 0.012,
        Math.max(x, x + sx * lx) + 0.012,
        y + h - 0.012,
        Math.max(z, z + sz * 0.012) + 0.012,
        c,
      );
      s.box(
        Math.min(x, x + sx * 0.012) - 0.012,
        y,
        Math.min(z, z + sz * lz) - 0.012,
        Math.max(x, x + sx * 0.012) + 0.012,
        y + h - 0.012,
        Math.max(z, z + sz * lz) + 0.012,
        c,
      );
    }
  }
}

/** Rubble stone: quoins at the corners and a scatter of proud, varied stones on each face. */
function stones(s: ShapeBuilder, w: WallSpec): void {
  quoins(s, w, vary(palette.stone, w.rnd, 0.6));
  for (const { f, u0, u1 } of facesOf(w.x0, w.z0, w.x1, w.z1)) {
    const len = u1 - u0;
    const n = Math.round(len * 5);
    for (let i = 0; i < n; i++) {
      const u = u0 + 0.12 + w.rnd() * (len - 0.24);
      const y = w.y0 + 0.06 + w.rnd() * (w.y1 - w.y0 - 0.14);
      const sw = 0.07 + w.rnd() * 0.07;
      const sh = 0.045 + w.rnd() * 0.04;
      faceBox(s, f, u - sw / 2, y, 0, u + sw / 2, y + sh, 0.014, vary(w.color, w.rnd, 2));
    }
  }
  s.box(
    w.x0 - 0.02,
    w.y0,
    w.z0 - 0.02,
    w.x1 + 0.02,
    w.y0 + 0.06,
    w.z1 + 0.02,
    vary(palette.foundation, w.rnd, 0.5),
  );
}

/** Horizontal clapboards: each board slightly kicked out at its foot, with corner boards. */
function boards(s: ShapeBuilder, w: WallSpec): void {
  const n = Math.max(3, Math.round((w.y1 - w.y0) / 0.09));
  const step = (w.y1 - w.y0) / n;
  for (const { f, u0, u1 } of facesOf(w.x0, w.z0, w.x1, w.z1)) {
    const out = outwardOf(f);
    for (let i = 0; i < n; i++) {
      const ya = w.y0 + i * step;
      const yb = ya + step;
      const hex = vary(w.color, w.rnd, 0.35);
      s.quad(
        facePoint(f, u0, ya, 0.02),
        facePoint(f, u1, ya, 0.02),
        facePoint(f, u1, yb, 0.004),
        facePoint(f, u0, yb, 0.004),
        hex,
        [out[0], 0.25, out[2]],
      );
      s.quad(
        facePoint(f, u0, ya, 0),
        facePoint(f, u1, ya, 0),
        facePoint(f, u1, ya, 0.02),
        facePoint(f, u0, ya, 0.02),
        vary(hex, w.rnd, 0.4),
        [out[0], -1, out[2]],
      );
    }
    faceBox(s, f, u0 - 0.02, w.y0, 0, u0 + 0.05, w.y1, 0.03, w.trim);
    faceBox(s, f, u1 - 0.05, w.y0, 0, u1 + 0.02, w.y1, 0.03, w.trim);
  }
  s.box(w.x0 - 0.03, w.y1 - 0.05, w.z0 - 0.03, w.x1 + 0.03, w.y1, w.z1 + 0.03, w.trim);
}

/** Log cabin walls: stacked logs whose ends cross and stick out at the corners. */
function logs(s: ShapeBuilder, w: WallSpec): void {
  const r = 0.055;
  const n = Math.max(3, Math.floor((w.y1 - w.y0) / (r * 1.8)));
  const step = (w.y1 - w.y0) / n;
  const stick = 0.09;
  for (let i = 0; i < n; i++) {
    const y = w.y0 + step * (i + 0.5);
    const along = i % 2 === 0;
    const hex = vary(palette.wood, w.rnd, 0.8);
    const end = vary(0xc9a26e, w.rnd, 0.6);
    if (along) {
      for (const z of [w.z0, w.z1]) cylX(s, w.x0 - stick, w.x1 + stick, y, z, r, hex, 6, end);
    } else {
      for (const x of [w.x0, w.x1]) cylZ(s, w.z0 - stick, w.z1 + stick, x, y, r, hex, 6, end);
    }
  }
}

// --- Openings ---------------------------------------------------------------------------------------

export interface WindowStyle {
  frame: number;
  shutter: number | null;
  box: boolean;
  flowers: readonly number[];
  /** Arched top (round-headed), for halls and mills. */
  arch?: boolean;
}

/** A window centered at (u, y) on a face: frame, glowing pane, mullions, shutters and a flower box. */
export function windowPart(
  s: ShapeBuilder,
  f: Face,
  u: number,
  y: number,
  w: number,
  h: number,
  style: WindowStyle,
  rnd: () => number,
  lights?: V3[],
  o = 0,
): void {
  const fw = 0.035;
  faceBox(s, f, u - w / 2 - fw, y - h / 2 - fw, o, u + w / 2 + fw, y + h / 2 + fw, o + 0.02, style.frame);
  s.glow(1);
  faceBox(s, f, u - w / 2, y - h / 2, o + 0.02, u + w / 2, y + h / 2, o + 0.028, palette.windowDay);
  if (style.arch) {
    const seg = 4;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI;
      const a1 = ((i + 1) / seg) * Math.PI;
      const r = w / 2;
      s.tri(
        facePoint(f, u, y + h / 2, o + 0.028),
        facePoint(f, u + Math.cos(a0) * r, y + h / 2 + Math.sin(a0) * r, o + 0.028),
        facePoint(f, u + Math.cos(a1) * r, y + h / 2 + Math.sin(a1) * r, o + 0.028),
        palette.windowDay,
        outwardOf(f),
      );
    }
  }
  s.glow(0);
  if (style.arch)
    faceBox(
      s,
      f,
      u - w / 2 - fw,
      y + h / 2 + w / 2 - 0.01,
      o,
      u + w / 2 + fw,
      y + h / 2 + w / 2 + fw,
      o + 0.02,
      style.frame,
    );
  faceBox(s, f, u - 0.012, y - h / 2, o + 0.028, u + 0.012, y + h / 2, o + 0.038, style.frame);
  faceBox(s, f, u - w / 2, y - 0.012, o + 0.028, u + w / 2, y + 0.012, o + 0.038, style.frame);
  // Sill.
  faceBox(
    s,
    f,
    u - w / 2 - 0.05,
    y - h / 2 - 0.05,
    o,
    u + w / 2 + 0.05,
    y - h / 2 - 0.02,
    o + 0.05,
    style.frame,
  );
  if (style.shutter !== null) {
    const sw = w * 0.42;
    faceBox(
      s,
      f,
      u - w / 2 - fw - sw,
      y - h / 2,
      o + 0.005,
      u - w / 2 - fw,
      y + h / 2,
      o + 0.03,
      style.shutter,
    );
    faceBox(
      s,
      f,
      u + w / 2 + fw,
      y - h / 2,
      o + 0.005,
      u + w / 2 + fw + sw,
      y + h / 2,
      o + 0.03,
      style.shutter,
    );
    // A cut-out heart would be lovely but costs triangles; a darker rail reads as planks.
    faceBox(
      s,
      f,
      u - w / 2 - fw - sw,
      y - 0.01,
      o + 0.03,
      u - w / 2 - fw,
      y + 0.01,
      o + 0.034,
      vary(style.shutter, rnd, 2),
    );
    faceBox(
      s,
      f,
      u + w / 2 + fw,
      y - 0.01,
      o + 0.03,
      u + w / 2 + fw + sw,
      y + 0.01,
      o + 0.034,
      vary(style.shutter, rnd, 2),
    );
  }
  if (style.box) {
    const by = y - h / 2 - 0.05;
    faceBox(s, f, u - w / 2 - 0.02, by - 0.07, o + 0.02, u + w / 2 + 0.02, by, o + 0.1, palette.wood);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const fu = u - w / 2 + (w * (i + 0.5)) / n;
      const p = facePoint(f, fu, by + 0.02, o + 0.06);
      s.blob(p[0], p[1], p[2], 0.045, 0.035, 0.045, vary(palette.leaf, rnd, 0.8), 0);
      const c = style.flowers[Math.floor(rnd() * style.flowers.length)] ?? palette.flowerA;
      const q = facePoint(f, fu + (rnd() - 0.5) * 0.03, by + 0.05, o + 0.07);
      s.blob(q[0], q[1], q[2], 0.028, 0.024, 0.028, c, 0);
    }
  }
  lights?.push(facePoint(f, u, y, o + 0.05));
}

export type DoorKind = 'arched' | 'plank' | 'double' | 'dutch';

/** A door: arched plank door with a step, a square plank door, a dutch door or barn doors. */
export function doorPart(
  s: ShapeBuilder,
  f: Face,
  u: number,
  w: number,
  h: number,
  hex: number,
  frame: number,
  kind: DoorKind = 'arched',
  o = 0,
): void {
  const r = w / 2;
  const out = outwardOf(f);
  // Step.
  faceBox(s, f, u - r - 0.06, 0, o, u + r + 0.06, 0.035, o + 0.12, palette.stone);
  if (kind === 'double') {
    faceBox(s, f, u - r - 0.04, 0, o, u + r + 0.04, h + 0.04, o + 0.02, frame);
    for (const side of [-1, 1]) {
      const a = side < 0 ? u - r : u + 0.006;
      const b = side < 0 ? u - 0.006 : u + r;
      faceBox(s, f, a, 0.035, o + 0.02, b, h, o + 0.035, hex);
      // The X brace of a barn door.
      const k = o + 0.04;
      s.quad(
        facePoint(f, a + 0.02, 0.06, k),
        facePoint(f, a + 0.06, 0.06, k),
        facePoint(f, b - 0.02, h - 0.03, k),
        facePoint(f, b - 0.06, h - 0.03, k),
        palette.white,
        out,
      );
      s.quad(
        facePoint(f, b - 0.02, 0.06, k),
        facePoint(f, b - 0.06, 0.06, k),
        facePoint(f, a + 0.02, h - 0.03, k),
        facePoint(f, a + 0.06, h - 0.03, k),
        palette.white,
        out,
      );
      faceBox(s, f, a, h - 0.05, o + 0.035, b, h - 0.02, o + 0.042, palette.white);
      faceBox(s, f, a, 0.04, o + 0.035, b, 0.07, o + 0.042, palette.white);
    }
    return;
  }
  if (kind === 'plank' || kind === 'dutch') {
    faceBox(s, f, u - r - 0.04, 0, o, u + r + 0.04, h + 0.04, o + 0.02, frame);
    faceBox(s, f, u - r, 0.035, o + 0.02, u + r, h, o + 0.035, hex);
    for (const du of [-r / 3, r / 3])
      faceBox(
        s,
        f,
        u + du - 0.004,
        0.04,
        o + 0.035,
        u + du + 0.004,
        h - 0.01,
        o + 0.038,
        vary(hex, () => 0.2, 2),
      );
    if (kind === 'dutch')
      faceBox(s, f, u - r, h * 0.5 - 0.015, o + 0.035, u + r, h * 0.5 + 0.015, o + 0.045, frame);
    const k = facePoint(f, u + r * 0.6, h * 0.45, o + 0.045);
    s.blob(k[0], k[1], k[2], 0.014, 0.014, 0.014, palette.mustard, 0);
    return;
  }
  const yr = h - r;
  faceBox(s, f, u - r - 0.04, 0, o, u + r + 0.04, yr, o + 0.02, frame);
  faceBox(s, f, u - r, 0.035, o + 0.02, u + r, yr, o + 0.035, hex);
  const seg = 5;
  for (const [rad, o0, o1, col] of [
    [r + 0.04, o, o + 0.02, frame],
    [r, o + 0.02, o + 0.035, hex],
  ] as const) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI;
      const a1 = ((i + 1) / seg) * Math.PI;
      const p0f = facePoint(f, u + Math.cos(a0) * rad, yr + Math.sin(a0) * rad, o1);
      const p1f = facePoint(f, u + Math.cos(a1) * rad, yr + Math.sin(a1) * rad, o1);
      s.tri(facePoint(f, u, yr, o1), p0f, p1f, col, out);
      const p0b = facePoint(f, u + Math.cos(a0) * rad, yr + Math.sin(a0) * rad, o0);
      const p1b = facePoint(f, u + Math.cos(a1) * rad, yr + Math.sin(a1) * rad, o0);
      const mid = (a0 + a1) / 2;
      const rim = facePoint(f, u + Math.cos(mid), yr + Math.sin(mid), 0);
      const c = facePoint(f, u, yr, 0);
      s.quad(p0b, p1b, p1f, p0f, col, [rim[0] - c[0], rim[1] - c[1], rim[2] - c[2]]);
    }
  }
  const k = facePoint(f, u + r * 0.55, yr * 0.55, o + 0.045);
  s.blob(k[0], k[1], k[2], 0.015, 0.015, 0.015, palette.mustard, 0);
}

// --- Chimneys, porches, dormers ----------------------------------------------------------------------

/** A chunky chimney (brick or stone) with a cap and a pot; returns the smoke anchor at its top. */
export function chimneyPart(
  s: ShapeBuilder,
  x: number,
  z: number,
  y0: number,
  y1: number,
  hex: number,
  big = false,
): V3 {
  const r = big ? 0.15 : 0.1;
  s.rbox(x - r, y0, z - r, x + r, y1, z + r, hex, 0.015);
  s.box(
    x - r - 0.012,
    y1 - 0.18,
    z - r - 0.012,
    x + r + 0.012,
    y1 - 0.14,
    z + r + 0.012,
    vary(hex, () => 0.3, 2),
  );
  s.rbox(x - r - 0.03, y1, z - r - 0.03, x + r + 0.03, y1 + 0.06, z + r + 0.03, palette.stone, 0.015);
  s.cylinder(x, z, 0.045, 0.05, y1 + 0.06, y1 + 0.13, palette.roofTerracotta, 6);
  return [x, y1 + 0.15, z];
}

/** A low stone foundation, slightly wider than the walls. */
export function foundationPart(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
): void {
  s.rbox(x0, 0, z0, x1, h, z1, palette.foundation, 0.035);
}

/** Legacy simple walls (plaster box with corner posts, a top plate and an optional beam). */
export function wallsPart(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y0: number,
  y1: number,
  plaster: number,
  timber: number,
  beamY: number | null,
): void {
  wallsOf(s, {
    material: 'plaster',
    x0,
    z0,
    x1,
    z1,
    y0,
    y1,
    color: plaster,
    trim: timber,
    rnd: () => 0.5,
    ...(beamY !== null ? { beams: [beamY] } : {}),
  });
}

/** A little gabled hood over a door on two brackets, or on two posts when `posts`. */
export function porchPart(
  s: ShapeBuilder,
  f: Face,
  u: number,
  w: number,
  y: number,
  depth: number,
  roof: number,
  trim: number,
  posts: boolean,
): void {
  const out = outwardOf(f);
  const p = (uu: number, yy: number, o: number): V3 => facePoint(f, uu, yy, o);
  const half = w / 2 + 0.08;
  const peak = y + 0.2;
  // Two slopes running out from the wall.
  for (const side of [-1, 1]) {
    const a = p(u + side * half, y, 0);
    const b = p(u + side * half, y, depth);
    const c = p(u, peak, depth);
    const d = p(u, peak, 0);
    s.quad(a, b, c, d, roof, [out[0] * 0 + (f.dir[0] === 'x' ? 0 : side), 1, f.dir[0] === 'x' ? side : 0]);
    s.quad(a, b, c, d, trim, [0, -1, 0]);
  }
  s.tri(p(u - half, y, depth), p(u + half, y, depth), p(u, peak, depth), trim, out);
  if (posts) {
    for (const side of [-1, 1])
      faceBox(
        s,
        f,
        u + side * (half - 0.04) - 0.025,
        0,
        depth - 0.07,
        u + side * (half - 0.04) + 0.025,
        y,
        depth - 0.02,
        trim,
      );
  } else {
    for (const side of [-1, 1])
      beam(
        s,
        p(u + side * (half - 0.05), y - 0.2, 0),
        p(u + side * (half - 0.05), y - 0.01, depth - 0.05),
        0.016,
        trim,
      );
  }
}

/** A dormer on a roof slope facing `f`: a small box with a window and its own little gable. */
export function dormerPart(
  s: ShapeBuilder,
  f: Face,
  u: number,
  yBase: number,
  depth: number,
  wall: number,
  roof: number,
  trim: number,
  rnd: () => number,
  lights?: V3[],
): void {
  const w = 0.32;
  const h = 0.26;
  faceBox(s, f, u - w / 2, yBase, -depth, u + w / 2, yBase + h, 0, wall);
  windowPart(
    s,
    f,
    u,
    yBase + h * 0.5,
    0.16,
    0.14,
    { frame: palette.white, shutter: null, box: false, flowers: [] },
    rnd,
    lights,
  );
  const out = outwardOf(f);
  const p = (uu: number, yy: number, o: number): V3 => facePoint(f, uu, yy, o);
  const peak = yBase + h + 0.16;
  for (const side of [-1, 1]) {
    s.quad(
      p(u + side * (w / 2 + 0.05), yBase + h, 0.05),
      p(u + side * (w / 2 + 0.05), yBase + h, -depth),
      p(u, peak, -depth),
      p(u, peak, 0.05),
      roof,
      [f.dir[0] === 'x' ? 0 : side, 1, f.dir[0] === 'x' ? side : 0],
    );
  }
  s.tri(p(u - w / 2, yBase + h, 0.001), p(u + w / 2, yBase + h, 0.001), p(u, peak - 0.03, 0.001), wall, out);
  faceBox(s, f, u - w / 2 - 0.02, yBase + h - 0.02, 0, u + w / 2 + 0.02, yBase + h + 0.01, 0.03, trim);
}

/** A hanging sign on an iron bracket, sticking out from a face at height y. Returns the board's center. */
export function hangingSign(
  s: ShapeBuilder,
  f: Face,
  u: number,
  y: number,
  board: number,
  emblem: ((s: ShapeBuilder, c: V3, f: Face) => void) | null,
): { center: V3; normal: V3 } {
  const p = (uu: number, yy: number, o: number): V3 => facePoint(f, uu, yy, o);
  // The bracket runs out from the wall; the board hangs edge-on to the street (facing along u).
  beam(s, p(u, y, 0), p(u, y, 0.36), 0.012, palette.metal);
  beam(s, p(u, y - 0.12, 0), p(u, y, 0.2), 0.008, palette.metal);
  const o0 = 0.08;
  const o1 = 0.34;
  for (const o of [o0 + 0.03, o1 - 0.03]) beam(s, p(u, y, o), p(u, y - 0.05, o), 0.004, palette.metal);
  faceBox(s, f, u - 0.015, y - 0.27, o0, u + 0.015, y - 0.05, o1, board);
  faceBox(s, f, u - 0.02, y - 0.285, o0 - 0.01, u + 0.02, y - 0.265, o1 + 0.01, palette.timber);
  const center = p(u, y - 0.16, (o0 + o1) / 2);
  if (emblem) emblem(s, center, f);
  const normal: V3 = f.dir[0] === 'z' ? [1, 0, 0] : [0, 0, 1];
  return { center, normal };
}

/** A sloping canvas awning in stripes over a face opening. */
export function awningPart(
  s: ShapeBuilder,
  f: Face,
  u0: number,
  u1: number,
  y: number,
  depth: number,
  a: number,
  b: number,
  stripes = 6,
): void {
  const out = outwardOf(f);
  const drop = 0.16;
  for (let i = 0; i < stripes; i++) {
    const ua = u0 + ((u1 - u0) * i) / stripes;
    const ub = u0 + ((u1 - u0) * (i + 1)) / stripes;
    const hex = i % 2 === 0 ? a : b;
    const q: V3[] = [
      facePoint(f, ua, y, 0),
      facePoint(f, ub, y, 0),
      facePoint(f, ub, y - drop, depth),
      facePoint(f, ua, y - drop, depth),
    ];
    s.quad(q[0]!, q[1]!, q[2]!, q[3]!, hex, [out[0], 1, out[2]]);
    s.quad(
      q[0]!,
      q[1]!,
      q[2]!,
      q[3]!,
      vary(hex, () => 0.2, 1.5),
      [-out[0], -1, -out[2]],
    );
    // Scalloped valance.
    const v0 = facePoint(f, ua, y - drop, depth);
    const v1 = facePoint(f, ub, y - drop, depth);
    const vm = facePoint(f, (ua + ub) / 2, y - drop - 0.07, depth);
    s.tri(v0, v1, vm, hex, out);
    s.tri(v0, v1, vm, hex, [-out[0], 0, -out[2]]);
  }
}
