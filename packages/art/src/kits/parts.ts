// Modular building parts: walls in plaster, timber frame, stone, weatherboard, brick or logs;
// windows with shutters and flower boxes; doors (arched, plank, double barn); chimneys; porches;
// dormers; hanging signs and awnings. Faces are addressed in a local frame (u along the face, y up,
// o outward from the wall plane) so one part works on any of the four sides.
import { ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam, cylX, cylZ } from '../shapes';
import { SURFACE } from '../surface';

import type { KitBuildOptions } from './types';

/**
 * V1B: the builder every building kit draws with: the level from `opts.lod` (parts draw their far
 * versions at 'low') and the kit AO bake.
 */
export function kitBuilder(opts?: KitBuildOptions): ShapeBuilder {
  return new ShapeBuilder(opts?.lod ?? 'high', 'kit');
}

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
  /** V1B: faces left out (box skip letters, 'l' and 'r' for party walls). */
  skip?: string;
  /**
   * V1B: a party wall shows above the neighbor's eaves (a taller house stepping up): the height on
   * each skipped side from which its face is drawn after all.
   */
  partyFrom?: { l?: number; r?: number };
}

/** How far cladding stands proud of the wall plane: windows and doors sit on top of it. */
export function claddingDepth(m: WallMaterial): number {
  return m === 'log' ? 0.05 : m === 'weatherboard' ? 0.02 : m === 'stone' ? 0.015 : 0.012;
}

/** V1B: the surface a wall material is drawn in (V1A's material lays its pattern on it). */
export function wallSurface(m: WallMaterial): number {
  switch (m) {
    case 'brick':
      return SURFACE.brick;
    case 'stone':
      return SURFACE.stone;
    case 'weatherboard':
    case 'log':
      return SURFACE.timber;
    default:
      return SURFACE.plaster;
  }
}

/** V1B: how much each wall face's color varies, hashed from where it is (both levels alike). */
export const WALL_JITTER = 0.03;

export function wallsOf(s: ShapeBuilder, w: WallSpec): void {
  // V1B: a structural part: it draws its far version even inside a kit's decoration.
  s.essential(() => wallsBody(s, w));
}

function wallsBody(s: ShapeBuilder, w: WallSpec): void {
  const { x0, z0, x1, z1, y0, y1, rnd } = w;
  const core = w.material === 'log' ? vary(palette.darkWood, rnd, 0.5) : w.color;
  // V1B: the wall body in its surface, never its bottom; at the far level never its top either (a
  // roof or the floor above covers it). `skip` leaves out party walls.
  const skip = (w.skip ?? '') + 'b' + (s.low ? 't' : '');
  s.surface(wallSurface(w.material)).jitter(WALL_JITTER);
  s.box(x0, y0, z0, x1, y1, z1, w.material === 'log' && s.low ? w.color : core, skip);
  for (const side of ['l', 'r'] as const) {
    const from = w.partyFrom?.[side];
    if (from === undefined || from >= y1 - 0.01) continue;
    const ya = Math.max(y0, from);
    faceQuad(s, { dir: side === 'l' ? 'x-' : 'x+', plane: side === 'l' ? x0 : x1 }, z0, ya, z1, y1, 0, core);
  }
  s.jitter(0).surface(SURFACE.timber);
  s.levels(
    () => {
      if (w.plain) {
        if (w.material === 'timber' || w.material === 'plaster') cornerPosts(s, w);
        return;
      }
      switch (w.material) {
        case 'plaster':
          cornerPosts(s, w);
          for (const y of w.beams ?? []) ringBox(s, w, 0.03, y - 0.03, y + 0.03, w.trim);
          break;
        case 'timber':
          cornerPosts(s, w);
          for (const y of w.beams ?? []) ringBox(s, w, 0.03, y - 0.03, y + 0.03, w.trim);
          timberFrame(s, w);
          break;
        case 'stone':
          s.surface(SURFACE.stone);
          stones(s, w);
          break;
        case 'brick':
          s.surface(SURFACE.stone);
          ringBox(s, w, 0.01, y0, y0 + 0.08, palette.foundation);
          quoins(s, w, palette.stone);
          ringBox(s, w, 0.015, y1 - 0.05, y1, palette.stone);
          break;
        case 'weatherboard':
          boards(s, w);
          break;
        case 'log':
          logs(s, w);
          break;
      }
    },
    () => farTrim(s, w),
  );
  s.surface(SURFACE.plain);
}

/**
 * V1B: the far level's trim as flat strips on the wall faces: timber framing keeps its corner posts,
 * plates and floor beams (the black and white reads from across the valley), plaster its corner
 * posts and wall plate, brick and stone their coping band.
 */
function farTrim(s: ShapeBuilder, w: WallSpec): void {
  const { x0, z0, x1, z1, y1 } = w;
  const m = w.material;
  if (m === 'log' || m === 'weatherboard') return;
  const o = claddingDepth(m) * 0.6 + 0.004;
  const skip = w.skip ?? '';
  const faces = facesOf(x0, z0, x1, z1).filter(({ f }) => !skip.includes(FACE_LETTER[f.dir]));
  const strip = (f: Face, u0: number, ya: number, u1: number, yb: number, hex: number): void =>
    faceQuad(s, f, u0, ya, u1, yb, o, hex);
  if (m === 'stone' || m === 'brick') {
    s.surface(SURFACE.stone);
    for (const { f, u0, u1 } of faces) strip(f, u0, y1 - 0.05, u1, y1, palette.stone);
    return;
  }
  // Posts are a pixel wide from where the far level shows; the plates and floor beams still read.
  s.surface(SURFACE.timber);
  for (const { f, u0, u1 } of faces) {
    strip(f, u0, y1 - 0.055, u1, y1, w.trim);
    if (m === 'timber') for (const y of w.beams ?? []) strip(f, u0, y - 0.03, u1, y + 0.03, w.trim);
  }
}

/** Box face letters (`ShapeBuilder.box` skip) for each face direction. */
export const FACE_LETTER: Record<FaceDir, string> = { 'z+': 'f', 'z-': 'k', 'x+': 'r', 'x-': 'l' };

/**
 * V1B: the wall outline grown by `d`, except on party walls (`skip`), which stay flush so nothing
 * pokes into the neighbor's house; and a box through it that leaves those faces out.
 */
function ringBox(s: ShapeBuilder, w: WallSpec, d: number, ya: number, yb: number, hex: number): void {
  const k = w.skip ?? '';
  s.box(
    w.x0 - (k.includes('l') ? 0 : d),
    ya,
    w.z0 - (k.includes('k') ? 0 : d),
    w.x1 + (k.includes('r') ? 0 : d),
    yb,
    w.z1 + (k.includes('f') ? 0 : d),
    hex,
    k,
  );
}

/** V1B: the faces of a wall that show (party walls left out). */
function wallFaces(w: WallSpec): { f: Face; u0: number; u1: number }[] {
  const k = w.skip ?? '';
  return facesOf(w.x0, w.z0, w.x1, w.z1).filter(({ f }) => !k.includes(FACE_LETTER[f.dir]));
}

/** V1B: true when a corner at (x, z) of the outline stands on a party wall. */
function partyCorner(w: WallSpec, x: number, z: number): boolean {
  const k = w.skip ?? '';
  return (
    (k.includes('l') && x === w.x0) ||
    (k.includes('r') && x === w.x1) ||
    (k.includes('f') && z === w.z1) ||
    (k.includes('k') && z === w.z0)
  );
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
    if (partyCorner(w, x, z)) continue;
    s.box(x - p, y0, z - p, x + p, y1, z + p, w.trim);
  }
  ringBox(s, w, 0.035, y1 - 0.055, y1, w.trim);
  ringBox(s, w, 0.03, y0, y0 + 0.05, w.trim);
}

/** Studs and diagonal braces on every face, between the floor beams. */
function timberFrame(s: ShapeBuilder, w: WallSpec): void {
  const levels = [w.y0, ...(w.beams ?? []), w.y1];
  for (const { f, u0, u1 } of wallFaces(w)) {
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
      if (partyCorner(w, x, z)) continue;
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
    const hidden = (w.skip ?? '').includes(FACE_LETTER[f.dir]);
    for (let i = 0; i < n; i++) {
      const u = u0 + 0.12 + w.rnd() * (len - 0.24);
      const y = w.y0 + 0.06 + w.rnd() * (w.y1 - w.y0 - 0.14);
      const sw = 0.07 + w.rnd() * 0.07;
      const sh = 0.045 + w.rnd() * 0.04;
      const c = vary(w.color, w.rnd, 2);
      if (!hidden) faceBox(s, f, u - sw / 2, y, 0, u + sw / 2, y + sh, 0.014, c);
    }
  }
  ringBox(s, w, 0.02, w.y0, w.y0 + 0.06, vary(palette.foundation, w.rnd, 0.5));
}

/** Horizontal clapboards: each board slightly kicked out at its foot, with corner boards. */
function boards(s: ShapeBuilder, w: WallSpec): void {
  const n = Math.max(3, Math.round((w.y1 - w.y0) / 0.09));
  const step = (w.y1 - w.y0) / n;
  for (const { f, u0, u1 } of facesOf(w.x0, w.z0, w.x1, w.z1)) {
    const out = outwardOf(f);
    const hidden = (w.skip ?? '').includes(FACE_LETTER[f.dir]);
    for (let i = 0; i < n; i++) {
      const ya = w.y0 + i * step;
      const yb = ya + step;
      const hex = vary(w.color, w.rnd, 0.35);
      if (hidden) {
        vary(hex, w.rnd, 0.4);
        continue;
      }
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
    if (hidden) continue;
    faceBox(s, f, u0 - 0.02, w.y0, 0, u0 + 0.05, w.y1, 0.03, w.trim);
    faceBox(s, f, u1 - 0.05, w.y0, 0, u1 + 0.02, w.y1, 0.03, w.trim);
  }
  ringBox(s, w, 0.03, w.y1 - 0.05, w.y1, w.trim);
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
  /** V1B: a lintel over the window in this color (stone or brick styles), none when absent. */
  lintel?: number;
  /** V1B: the sill's color (the frame's when absent). */
  sill?: number;
  /** V1B: panes per row and rows (muntins between them), 2 by 2 when absent. */
  panes?: [number, number];
}

/** V1B: a window's lintel and sill color for a wall material (stone dressings on brick and stone). */
export function dressingsOf(m: WallMaterial, frame: number): { lintel?: number; sill: number } {
  if (m === 'brick') return { lintel: palette.stone, sill: palette.stone };
  if (m === 'stone') return { lintel: vary(palette.stone, () => 0.7, 1), sill: palette.stone };
  return { sill: frame };
}

/**
 * A window centered at (u, y) on a face. Near: a frame with a reveal, a glowing pane, muntins, a
 * sill, a lintel where the style has one, ledged shutters and a flower box. Far (V1B): the frame,
 * pane, shutters and box as flat quads, the pane still glowing at night.
 */
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
  s.levels(
    () => windowNear(s, f, u, y, w, h, style, rnd, o),
    () => {
      // Layered quads, far enough apart not to fight in depth: the shutters as one board behind the
      // glass (or the frame, for a window without them), the glass; the flower box in front.
      if (style.shutter !== null) {
        s.surface(SURFACE.timber);
        const sw = w * 0.42 + fw;
        faceQuad(s, f, u - w / 2 - sw, y - h / 2, u + w / 2 + sw, y + h / 2, o + 0.01, style.shutter);
      }
      // A frame a pixel wide is lost beside shutters at this distance: only bare windows keep it.
      s.surface(SURFACE.plain);
      if (style.shutter === null)
        faceQuad(s, f, u - w / 2 - fw, y - h / 2 - fw, u + w / 2 + fw, y + h / 2 + fw, o + 0.02, style.frame);
      s.glow(1).surface(SURFACE.glass);
      faceQuad(s, f, u - w / 2, y - h / 2, u + w / 2, y + h / 2, o + 0.03, palette.windowDay);
      s.glow(0);
      if (style.box) {
        s.surface(SURFACE.flowers);
        const by = y - h / 2 - 0.05;
        faceQuad(s, f, u - w / 2 - 0.02, by - 0.07, u + w / 2 + 0.02, by + 0.04, o + 0.08, palette.leaf);
      }
      s.surface(SURFACE.plain);
    },
  );
  lights?.push(facePoint(f, u, y, o + 0.05));
}

function windowNear(
  s: ShapeBuilder,
  f: Face,
  u: number,
  y: number,
  w: number,
  h: number,
  style: WindowStyle,
  rnd: () => number,
  o: number,
): void {
  const fw = 0.035;
  const top = y + h / 2;
  const bot = y - h / 2;
  s.surface(SURFACE.plain);
  // The frame stands proud of the wall; the pane sits back in it, so the frame casts a reveal.
  faceBox(s, f, u - w / 2 - fw, bot - fw, o, u + w / 2 + fw, top + fw, o + 0.024, style.frame);
  s.glow(1).surface(SURFACE.glass);
  faceQuad(s, f, u - w / 2, bot, u + w / 2, top, o + 0.026, palette.windowDay);
  if (style.arch) {
    const seg = 4;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI;
      const a1 = ((i + 1) / seg) * Math.PI;
      const r = w / 2;
      s.tri(
        facePoint(f, u, top, o + 0.026),
        facePoint(f, u + Math.cos(a0) * r, top + Math.sin(a0) * r, o + 0.026),
        facePoint(f, u + Math.cos(a1) * r, top + Math.sin(a1) * r, o + 0.026),
        palette.windowDay,
        outwardOf(f),
      );
    }
  }
  s.glow(0).surface(SURFACE.plain);
  if (style.arch)
    faceBox(
      s,
      f,
      u - w / 2 - fw,
      top + w / 2 - 0.01,
      o,
      u + w / 2 + fw,
      top + w / 2 + fw,
      o + 0.024,
      style.frame,
    );
  // Muntins: glazing bars between the panes, as thin strips over the glass.
  const [cols, rows] = style.panes ?? [2, 2];
  for (let i = 1; i < cols; i++) {
    const mu = u - w / 2 + (w * i) / cols;
    faceQuad(s, f, mu - 0.009, bot, mu + 0.009, top, o + 0.03, style.frame);
  }
  for (let j = 1; j < rows; j++) {
    const my = bot + (h * j) / rows;
    faceQuad(s, f, u - w / 2, my - 0.009, u + w / 2, my + 0.009, o + 0.031, style.frame);
  }
  // Sill and lintel.
  s.surface(style.lintel !== undefined || style.sill !== undefined ? SURFACE.stone : SURFACE.plain);
  faceBox(
    s,
    f,
    u - w / 2 - 0.055,
    bot - fw - 0.04,
    o,
    u + w / 2 + 0.055,
    bot - fw + 0.004,
    o + 0.065,
    style.sill ?? style.frame,
  );
  if (style.lintel !== undefined && !style.arch) {
    s.surface(SURFACE.stone);
    faceBox(s, f, u - w / 2 - 0.05, top + fw, o, u + w / 2 + 0.05, top + fw + 0.06, o + 0.03, style.lintel);
  }
  if (style.shutter !== null) {
    s.surface(SURFACE.timber);
    const sw = w * 0.42;
    for (const [a, b] of [
      [u - w / 2 - fw - sw, u - w / 2 - fw - 0.004],
      [u + w / 2 + fw + 0.004, u + w / 2 + fw + sw],
    ] as const) {
      faceBox(s, f, a, bot, o + 0.005, b, top, o + 0.026, style.shutter);
      // Ledges: two darker rails read as a ledged and braced shutter.
      const rail = vary(style.shutter, rnd, 2);
      for (const ry of [bot + h * 0.2, top - h * 0.2])
        faceQuad(s, f, a, ry - 0.012, b, ry + 0.012, o + 0.028, rail);
    }
  }
  if (style.box) {
    s.surface(SURFACE.timber);
    const by = bot - fw - 0.04;
    faceBox(s, f, u - w / 2 - 0.02, by - 0.07, o + 0.02, u + w / 2 + 0.02, by, o + 0.1, palette.wood);
    s.surface(SURFACE.leaf);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const fu = u - w / 2 + (w * (i + 0.5)) / n;
      const p = facePoint(f, fu, by + 0.02, o + 0.06);
      s.blob(p[0], p[1], p[2], 0.045, 0.035, 0.045, vary(palette.leaf, rnd, 0.8), 0);
      const c = style.flowers[Math.floor(rnd() * style.flowers.length)] ?? palette.flowerA;
      const q = facePoint(f, fu + (rnd() - 0.5) * 0.03, by + 0.05, o + 0.07);
      s.surface(SURFACE.plain);
      s.blob(q[0], q[1], q[2], 0.028, 0.024, 0.028, c, 0);
      s.surface(SURFACE.leaf);
    }
  }
  s.surface(SURFACE.plain);
}

export type DoorKind = 'arched' | 'plank' | 'double' | 'dutch';

/** V1B: what dresses a door beyond its leaf: a fanlight over it, a hood on brackets. */
export interface DoorExtras {
  /** A half-round glazed fanlight over the door (brick and stucco styles). */
  fanlight?: boolean;
  /** A flat hood on two brackets over the door, in this color (timber styles). */
  hood?: number;
}

/**
 * A door: arched plank door with a step, a square plank door, a dutch door or barn doors. V1B: the
 * far level is the frame and the leaf as flat quads (and the fanlight's glass, lit at night).
 */
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
  extras: DoorExtras = {},
): void {
  const r = w / 2;
  s.levels(
    () => {
      doorNear(s, f, u, w, h, hex, frame, kind, o);
      if (extras.fanlight) {
        const fy = h + 0.04;
        const fr = r + 0.02;
        s.surface(SURFACE.plain);
        faceBox(s, f, u - fr - 0.03, fy - 0.01, o, u + fr + 0.03, fy + 0.02, o + 0.03, frame);
        for (const [rad, oo, hx] of [
          [fr + 0.03, o + 0.012, frame],
          [fr - 0.01, o + 0.02, palette.windowDay],
        ] as const) {
          if (hx === palette.windowDay) s.glow(1).surface(SURFACE.glass);
          for (let i = 0; i < 4; i++) {
            const a0 = (i / 4) * Math.PI;
            const a1 = ((i + 1) / 4) * Math.PI;
            s.tri(
              facePoint(f, u, fy + 0.02, oo),
              facePoint(f, u + Math.cos(a0) * rad, fy + 0.02 + Math.sin(a0) * rad * 0.8, oo),
              facePoint(f, u + Math.cos(a1) * rad, fy + 0.02 + Math.sin(a1) * rad * 0.8, oo),
              hx,
              outwardOf(f),
            );
          }
          s.glow(0).surface(SURFACE.plain);
        }
      }
      if (extras.hood !== undefined) {
        s.surface(SURFACE.timber);
        const hy = h + 0.06;
        faceBox(s, f, u - r - 0.1, hy, o, u + r + 0.1, hy + 0.035, o + 0.2, extras.hood);
        for (const side of [-1, 1])
          beam(
            s,
            facePoint(f, u + side * (r + 0.05), hy - 0.14, o),
            facePoint(f, u + side * (r + 0.05), hy, o + 0.16),
            0.014,
            extras.hood,
          );
        s.surface(SURFACE.plain);
      }
    },
    () => {
      const top = kind === 'arched' ? h - r * 0.4 : h;
      s.surface(SURFACE.plain);
      faceQuad(s, f, u - r - 0.04, 0.03, u + r + 0.04, top + 0.04, o + 0.012, frame);
      s.surface(SURFACE.timber);
      faceQuad(s, f, u - r, 0.04, u + r, top, o + 0.018, hex);
      if (extras.fanlight) {
        s.glow(1).surface(SURFACE.glass);
        faceQuad(s, f, u - r, h + 0.06, u + r, h + 0.06 + r * 0.7, o + 0.016, palette.windowDay);
        s.glow(0);
      }
      s.surface(SURFACE.plain);
    },
  );
}

function doorNear(
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
  s.surface(SURFACE.stone);
  faceBox(s, f, u - r - 0.06, 0, o, u + r + 0.06, 0.035, o + 0.12, palette.stone);
  s.surface(SURFACE.timber);
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

/**
 * A chunky chimney (brick or stone) with a cap and pots; returns the smoke anchor at its top. V1B:
 * the far level is the stack as a box; `pots` 2 puts a pair on the cap (party walls, big stacks).
 */
export function chimneyPart(
  s: ShapeBuilder,
  x: number,
  z: number,
  y0: number,
  y1: number,
  hex: number,
  big = false,
  pots = big ? 2 : 1,
): V3 {
  const r = big ? 0.15 : 0.1;
  const rz = big ? 0.12 : r;
  const surf =
    hex === palette.brick || ((hex >> 16) & 255) > ((hex >> 8) & 255) + 30 ? SURFACE.brick : SURFACE.stone;
  s.surface(surf);
  s.levels(
    () => {
      s.rbox(x - r, y0, z - rz, x + r, y1, z + rz, hex, 0.015);
      // A string course below the cap, the cap stone, and the pots.
      s.box(
        x - r - 0.012,
        y1 - 0.18,
        z - rz - 0.012,
        x + r + 0.012,
        y1 - 0.14,
        z + rz + 0.012,
        vary(hex, () => 0.3, 2),
      );
      s.surface(SURFACE.stone);
      s.rbox(x - r - 0.03, y1, z - rz - 0.03, x + r + 0.03, y1 + 0.06, z + rz + 0.03, palette.stone, 0.015);
      s.surface(SURFACE.plain);
      for (let i = 0; i < pots; i++) {
        const px = pots === 1 ? x : x + (i === 0 ? -r * 0.5 : r * 0.5);
        s.cylinder(px, z, 0.042, 0.048, y1 + 0.06, y1 + 0.14 - i * 0.02, palette.roofTerracotta, 6);
        s.cylinder(px, z, 0.05, 0.05, y1 + 0.14 - i * 0.02, y1 + 0.155 - i * 0.02, palette.roofTerracotta, 6);
      }
    },
    () => s.box(x - r, y0, z - rz, x + r, y1 + 0.06, z + rz, hex),
  );
  s.surface(SURFACE.plain);
  return [x, y1 + 0.15, z];
}

/** A low stone foundation, slightly wider than the walls. V1B: `skip` leaves out party walls. */
export function foundationPart(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
  skip = '',
): void {
  s.surface(SURFACE.stone).jitter(WALL_JITTER);
  if (skip || s.low)
    s.essential(() => s.box(x0, 0, z0, x1, h, z1, palette.foundation, skip + (s.low ? 't' : '')));
  else s.rbox(x0, 0, z0, x1, h, z1, palette.foundation, 0.035);
  s.jitter(0).surface(SURFACE.plain);
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
  // Two slopes running out from the wall (V1B: the far level keeps the slopes and the gable).
  s.surface(SURFACE.tile);
  for (const side of [-1, 1]) {
    const a = p(u + side * half, y, 0);
    const b = p(u + side * half, y, depth);
    const c = p(u, peak, depth);
    const d = p(u, peak, 0);
    s.essential(() =>
      s.quad(a, b, c, d, roof, [out[0] * 0 + (f.dir[0] === 'x' ? 0 : side), 1, f.dir[0] === 'x' ? side : 0]),
    );
    s.surface(SURFACE.timber);
    s.nearOnly(() => s.quad(a, b, c, d, trim, [0, -1, 0]));
    s.surface(SURFACE.tile);
  }
  s.surface(SURFACE.timber);
  s.essential(() => s.tri(p(u - half, y, depth), p(u + half, y, depth), p(u, peak, depth), trim, out));
  // Shade on the wall and step under the hood.
  const c0 = p(u - half, 0, 0);
  const c1 = p(u + half, y, depth);
  s.occlude(c0[0], 0, c0[2], c1[0], y, c1[2], 0.12, 0.12);
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
  s.surface(SURFACE.plain);
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
  // V1B: dormers are near-only detail (the far level keeps the plain roof plane).
  s.nearOnly(() => dormerNear(s, f, u, yBase, depth, wall, roof, trim, rnd, lights));
}

function dormerNear(
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
  s.surface(SURFACE.plaster);
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
  s.surface(SURFACE.tile);
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
  s.surface(SURFACE.plaster);
  s.tri(p(u - w / 2, yBase + h, 0.001), p(u + w / 2, yBase + h, 0.001), p(u, peak - 0.03, 0.001), wall, out);
  s.surface(SURFACE.timber);
  faceBox(s, f, u - w / 2 - 0.02, yBase + h - 0.02, 0, u + w / 2 + 0.02, yBase + h + 0.01, 0.03, trim);
  s.surface(SURFACE.plain);
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
  const o0 = 0.08;
  const o1 = 0.34;
  const center = p(u, y - 0.16, (o0 + o1) / 2);
  // V1B: a near-only detail.
  s.nearOnly(() => {
    // The bracket runs out from the wall; the board hangs edge-on to the street (facing along u).
    beam(s, p(u, y, 0), p(u, y, 0.36), 0.012, palette.metal);
    beam(s, p(u, y - 0.12, 0), p(u, y, 0.2), 0.008, palette.metal);
    for (const o of [o0 + 0.03, o1 - 0.03]) beam(s, p(u, y, o), p(u, y - 0.05, o), 0.004, palette.metal);
    s.surface(SURFACE.timber);
    faceBox(s, f, u - 0.015, y - 0.27, o0, u + 0.015, y - 0.05, o1, board);
    faceBox(s, f, u - 0.02, y - 0.285, o0 - 0.01, u + 0.02, y - 0.265, o1 + 0.01, palette.timber);
    s.surface(SURFACE.plain);
    if (emblem) emblem(s, center, f);
  });
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
  s.surface(SURFACE.awning);
  if (s.low) {
    // V1B: the far level is the canvas as one sloping quad (the awning pattern draws the stripes).
    s.essential(() =>
      s.quad(
        facePoint(f, u0, y, 0),
        facePoint(f, u1, y, 0),
        facePoint(f, u1, y - drop, depth),
        facePoint(f, u0, y - drop, depth),
        a,
        [out[0], 1, out[2]],
      ),
    );
    s.surface(SURFACE.plain);
    return;
  }
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
  s.surface(SURFACE.plain);
}
