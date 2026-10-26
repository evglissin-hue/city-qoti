// C4E: the little things that make a grown village look lived in: ivy up a corner, a lean-to
// against a side wall, garden edges (picket, wattle, dry stone, hedge, iron railings), bay windows,
// shopfronts with display panes, washing lines, vegetable rows, flower borders, hens, a pump, a
// water trough and post-and-rail fencing. Kit-local coordinates, like the rest of the part library.
import { vary, type ShapeBuilder, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam, cylX, cylZ, panel } from '../shapes';
import type { GardenEdge } from './district';
import { faceBox, facePoint, outwardOf, type Face } from './parts';
import { picket, wattle } from './props';
import { roofPart, type RoofMaterial } from './roofs';
import { FLOWERS } from './style';

export const IVY = 0x47703a;
export const IVY_LIGHT = 0x5f8a45;

/** Ivy climbing a wall from the ground: a lumpy band of leaves between u0 and u1, up to `top`. */
export function ivyPart(
  s: ShapeBuilder,
  f: Face,
  u0: number,
  u1: number,
  top: number,
  rnd: () => number,
): void {
  const n = Math.max(4, Math.round((u1 - u0) * 9 + top * 7));
  for (let i = 0; i < n; i++) {
    const t = rnd();
    // Thicker near the ground, thinning toward the top, leaning to one side as it climbs.
    const y = 0.04 + Math.sqrt(t) * top;
    const spread = (1 - (y / top) * 0.6) * (u1 - u0);
    const u = u0 + (u1 - u0) * 0.5 + (rnd() - 0.5) * spread;
    const p = facePoint(f, u, y, 0.03);
    const r = 0.045 + rnd() * 0.04;
    s.blob(p[0], p[1], p[2], r, r * 0.9, r, vary(rnd() < 0.5 ? IVY : IVY_LIGHT, rnd, 0.8), 0);
  }
}

/** A lean-to shed against a wall face: posts or boards, a sloping roof, logs or tools inside. */
export function leanToPart(
  s: ShapeBuilder,
  f: Face,
  u0: number,
  u1: number,
  depth: number,
  high: number,
  low: number,
  board: number,
  roof: number,
  material: RoofMaterial,
  trim: number,
  rnd: () => number,
  open = true,
): void {
  const out = outwardOf(f);
  // Back and side boards; the front stays open when `open`, showing a woodstack.
  for (const u of [u0, u1]) faceBox(s, f, u - 0.02, 0, 0, u + 0.02, low, depth, vary(board, rnd, 0.4));
  faceBox(s, f, u0, 0, depth - 0.03, u1, open ? 0.06 : low - 0.02, depth, vary(board, rnd, 0.5));
  if (!open) {
    const steps = Math.max(3, Math.round((u1 - u0) / 0.09));
    for (let i = 1; i < steps; i++) {
      const u = u0 + ((u1 - u0) * i) / steps;
      faceBox(s, f, u - 0.004, 0.02, depth, u + 0.004, low - 0.04, depth + 0.006, vary(board, rnd, 1.4));
    }
  } else {
    // Split logs stacked under the roof.
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const n = Math.max(2, Math.round((u1 - u0 - 0.08) / 0.07));
      for (let i = 0; i < n; i++) {
        const u = u0 + 0.06 + i * 0.07 + (r % 2) * 0.03;
        if (u > u1 - 0.05) continue;
        const p = facePoint(f, u, 0.035 + r * 0.06, depth * 0.5);
        if (f.dir[0] === 'z')
          cylZ(
            s,
            p[2] - depth * 0.35,
            p[2] + depth * 0.35,
            p[0],
            p[1],
            0.03,
            vary(palette.bark, rnd),
            3,
            0xd9b98a,
          );
        else
          cylX(
            s,
            p[0] - depth * 0.35,
            p[0] + depth * 0.35,
            p[1],
            p[2],
            0.03,
            vary(palette.bark, rnd),
            3,
            0xd9b98a,
          );
      }
    }
  }
  // The roof: high against the wall, low at the outer edge.
  const a = facePoint(f, u0 - 0.06, 0, -0.02);
  const b = facePoint(f, u1 + 0.06, 0, depth + 0.1);
  const along = f.dir[0] === 'z';
  roofPart(s, {
    shape: 'lean',
    material,
    x0: Math.min(a[0], b[0]),
    z0: Math.min(a[2], b[2]),
    x1: Math.max(a[0], b[0]),
    z1: Math.max(a[2], b[2]),
    y0: low,
    y1: high,
    color: roof,
    trim,
    ridgeAlongX: along,
    rnd,
    // High against the wall: the low coordinate for + faces, the high one for - faces.
    ...(out[0] + out[2] < 0 ? { highAtC1: true } : {}),
  });
}

/** A run of garden edge between two ground points, with an optional gate gap around `gate`. */
export function gardenEdge(
  s: ShapeBuilder,
  kind: GardenEdge,
  a: [number, number],
  b: [number, number],
  rnd: () => number,
  gate?: [number, number],
  paint: number = palette.white,
): void {
  if (gate) {
    // Split the run either side of the gate (0.34 wide), leaving posts at the gap.
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dz * dz);
    const t = ((gate[0] - a[0]) * dx + (gate[1] - a[1]) * dz) / (len * len);
    const g = 0.17 / len;
    const p = (k: number): [number, number] => [a[0] + dx * k, a[1] + dz * k];
    if (t - g > 0.02) gardenEdge(s, kind, a, p(t - g), rnd, undefined, paint);
    if (t + g < 0.98) gardenEdge(s, kind, p(t + g), b, rnd, undefined, paint);
    if (kind !== 'hedge') {
      for (const k of [t - g, t + g]) {
        const q = p(k);
        const h = kind === 'wall' ? 0.24 : 0.26;
        const c = kind === 'wall' ? vary(palette.stone, rnd) : kind === 'railing' ? palette.ink : paint;
        s.box(q[0] - 0.025, 0, q[1] - 0.025, q[0] + 0.025, h, q[1] + 0.025, c);
        s.box(q[0] - 0.03, h, q[1] - 0.03, q[0] + 0.03, h + 0.02, q[1] + 0.03, c);
      }
    }
    return;
  }
  switch (kind) {
    case 'picket':
      picket(s, a, b, paint);
      break;
    case 'wattle':
      wattle(s, a, b, rnd);
      break;
    case 'wall':
      dryStoneWall(s, a, b, rnd);
      break;
    case 'hedge':
      hedgeRun(s, a, b, rnd);
      break;
    case 'railing':
      railing(s, a, b);
      break;
  }
}

/** A low dry stone wall with a row of coping stones. */
export function dryStoneWall(
  s: ShapeBuilder,
  a: [number, number],
  b: [number, number],
  rnd: () => number,
): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.05) return;
  const n = Math.max(1, Math.round(len / 0.14));
  const ux = dx / len;
  const uz = dz / len;
  const t = 0.06;
  for (let i = 0; i < n; i++) {
    const k0 = (i / n) * len;
    const k1 = ((i + 1) / n) * len;
    for (let row = 0; row < 2; row++) {
      const off = row === 1 ? 0.07 : 0;
      const ka = Math.max(0, k0 - off);
      const kb = Math.min(len, k1 - off);
      if (kb - ka < 0.03) continue;
      const x0 = a[0] + ux * ka;
      const z0 = a[1] + uz * ka;
      const x1 = a[0] + ux * kb;
      const z1 = a[1] + uz * kb;
      const y0 = row * 0.09;
      const y1 = y0 + 0.085 + (rnd() - 0.5) * 0.02;
      s.box(
        Math.min(x0, x1) - Math.abs(uz) * t,
        y0,
        Math.min(z0, z1) - Math.abs(ux) * t,
        Math.max(x0, x1) + Math.abs(uz) * t,
        y1,
        Math.max(z0, z1) + Math.abs(ux) * t,
        vary(palette.stone, rnd, 1.6),
      );
    }
  }
  // Coping: stones on edge along the top.
  const m = Math.max(2, Math.round(len / 0.07));
  for (let i = 0; i < m; i++) {
    const k = ((i + 0.5) / m) * len;
    const x = a[0] + ux * k;
    const z = a[1] + uz * k;
    s.box(x - 0.025, 0.17, z - 0.025, x + 0.025, 0.215, z + 0.025, vary(0xa39c90, rnd, 1.2));
  }
}

/** A clipped hedge run. */
export function hedgeRun(s: ShapeBuilder, a: [number, number], b: [number, number], rnd: () => number): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(1, Math.round(len / 0.22));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a[0] + dx * t;
    const z = a[1] + dz * t;
    const leaf = vary(0x4f7d3a, rnd, 0.6);
    s.blob(x, 0.13, z, (len / n) * 0.62, 0.14, 0.11, leaf, 1, rnd, 0.08, vary(0x6a9447, rnd, 0.6));
  }
}

/** Iron railings on a low plinth, for town fronts. */
export function railing(s: ShapeBuilder, a: [number, number], b: [number, number]): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.05) return;
  const ux = dx / len;
  const uz = dz / len;
  const w = 0.04;
  s.box(
    Math.min(a[0], b[0]) - Math.abs(uz) * w,
    0,
    Math.min(a[1], b[1]) - Math.abs(ux) * w,
    Math.max(a[0], b[0]) + Math.abs(uz) * w,
    0.05,
    Math.max(a[1], b[1]) + Math.abs(ux) * w,
    palette.stone,
  );
  const n = Math.max(2, Math.round(len / 0.07));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + dx * t;
    const z = a[1] + dz * t;
    beam(s, [x, 0.05, z], [x, 0.24, z], 0.006, palette.ink);
    if (i % 2 === 0) s.blob(x, 0.25, z, 0.011, 0.016, 0.011, palette.ink, 0);
  }
  beam(s, [a[0], 0.21, a[1]], [b[0], 0.21, b[1]], 0.007, palette.ink);
  beam(s, [a[0], 0.09, a[1]], [b[0], 0.09, b[1]], 0.006, palette.ink);
}

/** Post and rail fencing (paddocks and pastures): stout posts, two rails. */
export function postAndRail(
  s: ShapeBuilder,
  a: [number, number],
  b: [number, number],
  rnd: () => number,
): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(1, Math.round(len / 0.45));
  const wood = vary(0x9a7a52, rnd, 0.5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + dx * t;
    const z = a[1] + dz * t;
    s.box(x - 0.022, 0, z - 0.022, x + 0.022, 0.27, z + 0.022, vary(palette.timber, rnd, 0.4));
  }
  for (const y of [0.12, 0.22]) beam(s, [a[0], y, a[1]], [b[0], y, b[1]], 0.014, wood);
}

/** A canted bay window on a face: three glowing panes under a little lead roof. */
export function bayWindow(
  s: ShapeBuilder,
  f: Face,
  u: number,
  y0: number,
  w: number,
  h: number,
  depth: number,
  frame: number,
  roof: number,
  rnd: () => number,
  lights: V3[],
  o = 0,
  box = false,
): void {
  const half = w / 2;
  const front = half * 0.62;
  const p = (uu: number, yy: number, oo: number): V3 => facePoint(f, uu, yy, o + oo);
  const out = outwardOf(f);
  // Sill block and the three faces of the bay.
  const ring: [number, number][] = [
    [u - half, 0],
    [u - front, depth],
    [u + front, depth],
    [u + half, 0],
  ];
  for (let i = 0; i < 3; i++) {
    const [ua, oa] = ring[i]!;
    const [ub, ob] = ring[i + 1]!;
    // Panel below the glass, the glass, a head above.
    s.quad(p(ua, y0, oa), p(ub, y0, ob), p(ub, y0 + 0.08, ob), p(ua, y0 + 0.08, oa), vary(frame, rnd, 0.3), [
      out[0] + (ub - ua === 0 ? 0 : 0),
      0,
      out[2],
    ]);
    s.glow(1);
    s.quad(
      p(ua, y0 + 0.08, oa + 0.004),
      p(ub, y0 + 0.08, ob + 0.004),
      p(ub, y0 + h - 0.04, ob + 0.004),
      p(ua, y0 + h - 0.04, oa + 0.004),
      palette.windowDay,
      [out[0], 0, out[2]],
    );
    s.glow(0);
    s.quad(p(ua, y0 + h - 0.04, oa), p(ub, y0 + h - 0.04, ob), p(ub, y0 + h, ob), p(ua, y0 + h, oa), frame, [
      out[0],
      0,
      out[2],
    ]);
    beam(s, p(ua, y0, oa + 0.01), p(ua, y0 + h, oa + 0.01), 0.012, frame);
  }
  beam(s, p(u + half, y0, 0.01), p(u + half, y0 + h, 0.01), 0.012, frame);
  // The sides of the bay are closed by the faces themselves; a floor and a lead roof cap it.
  const cap = (yy: number, hex: number, up: V3): void => {
    s.tri(p(u - half, yy, 0), p(u - front, yy, depth), p(u + front, yy, depth), hex, up);
    s.tri(p(u - half, yy, 0), p(u + front, yy, depth), p(u + half, yy, 0), hex, up);
  };
  cap(y0, frame, [0, -1, 0]);
  const ry = y0 + h;
  s.quad(
    p(u - half - 0.03, ry, 0),
    p(u + half + 0.03, ry, 0),
    p(u + front + 0.02, ry + 0.02, depth + 0.04),
    p(u - front - 0.02, ry + 0.02, depth + 0.04),
    roof,
    [out[0], 1, out[2]],
  );
  s.quad(
    p(u - half - 0.03, ry + 0.09, 0),
    p(u + half + 0.03, ry + 0.09, 0),
    p(u + front + 0.02, ry + 0.02, depth + 0.04),
    p(u - front - 0.02, ry + 0.02, depth + 0.04),
    roof,
    [out[0], 1, out[2]],
  );
  if (box) {
    const by = y0 - 0.02;
    faceBox(s, f, u - front, by - 0.06, o + depth, u + front, by, o + depth + 0.07, palette.wood);
    for (let i = 0; i < 4; i++) {
      const q = p(u - front + 0.05 + ((2 * front - 0.1) * i) / 3, by + 0.02, depth + 0.035);
      s.blob(q[0], q[1], q[2], 0.04, 0.03, 0.035, vary(palette.leaf, rnd, 0.8), 0);
      s.blob(q[0], q[1] + 0.025, q[2], 0.022, 0.02, 0.022, FLOWERS[Math.floor(rnd() * FLOWERS.length)]!, 0);
    }
  }
  lights.push(p(u, y0 + h / 2, depth + 0.05));
}

/**
 * A shopfront between u0 and u1: a stall riser, big multi-pane display windows either side of a
 * glazed door, pilasters and a fascia board. Returns the fascia's center (for the sign text).
 */
export function shopfront(
  s: ShapeBuilder,
  f: Face,
  u0: number,
  u1: number,
  doorU: number,
  h: number,
  paint: number,
  rnd: () => number,
  lights: V3[],
  o = 0,
): { fascia: V3; fasciaW: number } {
  const riser = 0.16;
  const door = 0.15;
  const ins = o + 0.02;
  // Pilasters at the ends and either side of the door.
  for (const u of [u0, u1, doorU - door, doorU + door])
    faceBox(s, f, u - 0.03, 0, o, u + 0.03, h, o + 0.05, paint);
  // Stall risers and glass.
  for (const [a, b] of [
    [u0 + 0.03, doorU - door - 0.03],
    [doorU + door + 0.03, u1 - 0.03],
  ] as const) {
    if (b - a < 0.08) continue;
    faceBox(s, f, a, 0, o, b, riser, o + 0.04, vary(paint, rnd, 0.6));
    faceBox(s, f, a - 0.005, riser, o, b + 0.005, riser + 0.02, o + 0.06, paint);
    s.glow(1);
    faceBox(s, f, a, riser + 0.02, ins, b, h - 0.04, ins + 0.006, palette.windowDay);
    s.glow(0);
    // Glazing bars: a grid of small panes.
    const cols = Math.max(2, Math.round((b - a) / 0.11));
    for (let i = 1; i < cols; i++) {
      const u = a + ((b - a) * i) / cols;
      faceBox(s, f, u - 0.006, riser + 0.02, ins + 0.006, u + 0.006, h - 0.04, ins + 0.014, palette.white);
    }
    faceBox(
      s,
      f,
      a,
      riser + (h - riser) * 0.62,
      ins + 0.006,
      b,
      riser + (h - riser) * 0.62 + 0.012,
      ins + 0.014,
      palette.white,
    );
    lights.push(facePoint(f, (a + b) / 2, (riser + h) / 2, o + 0.08));
  }
  // The door: half glazed.
  faceBox(
    s,
    f,
    doorU - door + 0.03,
    0.02,
    o,
    doorU + door - 0.03,
    h - 0.02,
    o + 0.025,
    vary(paint, rnd, 1.2),
  );
  s.glow(1);
  faceBox(
    s,
    f,
    doorU - door + 0.06,
    h * 0.5,
    o + 0.025,
    doorU + door - 0.06,
    h - 0.06,
    o + 0.03,
    palette.windowDay,
  );
  s.glow(0);
  const knob = facePoint(f, doorU + door - 0.07, h * 0.42, o + 0.035);
  s.blob(knob[0], knob[1], knob[2], 0.012, 0.012, 0.012, palette.mustard, 0);
  faceBox(s, f, doorU - door - 0.02, 0, o, doorU + door + 0.02, 0.03, o + 0.14, palette.stone);
  // Fascia and cornice.
  faceBox(s, f, u0 - 0.04, h, o, u1 + 0.04, h + 0.15, o + 0.06, paint);
  faceBox(s, f, u0 - 0.06, h + 0.15, o, u1 + 0.06, h + 0.18, o + 0.09, vary(paint, rnd, 0.8));
  return { fascia: facePoint(f, (u0 + u1) / 2, h + 0.075, o + 0.062), fasciaW: u1 - u0 - 0.1 };
}

/** A washing line between two posts with a few things pegged out. */
export function washingLine(
  s: ShapeBuilder,
  a: [number, number],
  b: [number, number],
  rnd: () => number,
): void {
  for (const p of [a, b]) beam(s, [p[0], 0, p[1]], [p[0], 0.46, p[1]], 0.012, palette.timber);
  beam(s, [a[0], 0.44, a[1]], [b[0], 0.42, b[1]], 0.003, 0xe8e2d4);
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const n = 3 + Math.floor(rnd() * 2);
  const colors = [palette.white, 0x7fa7c4, palette.plasterRose, palette.mustard, 0x8fa37a];
  for (let i = 0; i < n; i++) {
    const t0 = 0.12 + (i / n) * 0.78;
    const t1 = t0 + 0.12;
    const p0: V3 = [a[0] + dx * t0, 0.43, a[1] + dz * t0];
    const p1: V3 = [a[0] + dx * t1, 0.43, a[1] + dz * t1];
    const hang = 0.1 + rnd() * 0.08;
    const c = colors[Math.floor(rnd() * colors.length)]!;
    panel(s, p0, p1, [p1[0], p1[1] - hang, p1[2]], [p0[0], p0[1] - hang, p0[2]], c, vary(c, rnd, 1.4));
  }
}

/** Vegetable rows in a bed: soil ridges with cabbages, leeks and carrot tops. */
export function vegRows(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  rnd: () => number,
  alongX = true,
): void {
  s.rbox(x0, 0, z0, x1, 0.03, z1, vary(palette.soil, rnd, 0.4), 0.02);
  const rows = Math.max(2, Math.round((alongX ? z1 - z0 : x1 - x0) / 0.16));
  for (let r = 0; r < rows; r++) {
    const c = (alongX ? z0 : x0) + ((alongX ? z1 - z0 : x1 - x0) * (r + 0.5)) / rows;
    const len = alongX ? x1 - x0 : z1 - z0;
    const n = Math.max(2, Math.round(len / 0.13));
    const kind = r % 3;
    for (let i = 0; i < n; i++) {
      const a = (alongX ? x0 : z0) + (len * (i + 0.5)) / n;
      const x = alongX ? a : c;
      const z = alongX ? c : a;
      if (kind === 0) s.blob(x, 0.06, z, 0.045, 0.035, 0.045, vary(0x7fae4e, rnd, 0.8), 0);
      else if (kind === 1) s.cylinder(x, z, 0.012, 0.02, 0.03, 0.12, vary(0x8fbf6a, rnd, 0.6), 4);
      else s.blob(x, 0.05, z, 0.03, 0.03, 0.03, vary(0x6f9a4a, rnd, 1.2), 0);
    }
  }
}

/** A border of flowers along a line (cottage garden), as small bright clumps. */
export function flowerBorder(
  s: ShapeBuilder,
  a: [number, number],
  b: [number, number],
  rnd: () => number,
): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(2, Math.round(len / 0.12));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a[0] + dx * t + (rnd() - 0.5) * 0.04;
    const z = a[1] + dz * t + (rnd() - 0.5) * 0.04;
    s.blob(x, 0.04, z, 0.05, 0.045, 0.05, vary(palette.leaf, rnd, 0.9), 0);
    s.blob(
      x + (rnd() - 0.5) * 0.03,
      0.085,
      z,
      0.028,
      0.022,
      0.028,
      FLOWERS[Math.floor(rnd() * FLOWERS.length)]!,
      0,
    );
  }
}

/** A hen: a plump body, a tail tuft and a red comb. */
export function hen(s: ShapeBuilder, x: number, z: number, heading: number, rnd: () => number): void {
  const c = [palette.white, 0xb8693a, 0x5a4636][Math.floor(rnd() * 3)]!;
  const dx = Math.cos(heading);
  const dz = Math.sin(heading);
  s.blob(x, 0.055, z, 0.045, 0.04, 0.045, c, 0);
  s.blob(x + dx * 0.04, 0.095, z + dz * 0.04, 0.022, 0.025, 0.022, c, 0);
  s.blob(x - dx * 0.045, 0.085, z - dz * 0.045, 0.018, 0.03, 0.02, vary(c, rnd, 1.5), 0);
  s.blob(x + dx * 0.045, 0.122, z + dz * 0.045, 0.008, 0.01, 0.008, palette.accentRed, 0);
  s.blob(x + dx * 0.064, 0.098, z + dz * 0.064, 0.008, 0.005, 0.008, palette.mustard, 0);
}

/** A hand pump on a stone block. */
export function pump(s: ShapeBuilder, x: number, z: number, hex: number): void {
  s.rbox(x - 0.06, 0, z - 0.06, x + 0.06, 0.05, z + 0.06, palette.stone, 0.01);
  s.cylinder(x, z, 0.03, 0.028, 0.05, 0.3, hex, 6);
  beam(s, [x, 0.27, z], [x, 0.24, z + 0.08], 0.01, hex);
  beam(s, [x, 0.3, z], [x - 0.12, 0.36, z], 0.008, hex);
  s.cylinder(
    x,
    z + 0.11,
    0.06,
    0.07,
    0,
    0.06,
    vary(palette.wood, () => 0.3, 1),
    8,
  );
}

/** A stone or wooden water trough along x or z. */
export function trough(s: ShapeBuilder, x: number, z: number, alongX: boolean, stone = true): void {
  const hx = alongX ? 0.22 : 0.08;
  const hz = alongX ? 0.08 : 0.22;
  const c = stone ? palette.stone : palette.wood;
  s.rbox(x - hx, 0, z - hz, x + hx, 0.11, z + hz, c, 0.012);
  s.box(x - hx + 0.025, 0.105, z - hz + 0.025, x + hx - 0.025, 0.112, z + hz - 0.025, palette.waterDeep);
}

/** A garden bench of the district's color tucked against something. */
export function gate(s: ShapeBuilder, a: [number, number], b: [number, number], hex: number): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    beam(s, [a[0] + dx * t, 0.03, a[1] + dz * t], [a[0] + dx * t, 0.22, a[1] + dz * t], 0.01, hex);
  }
  beam(s, [a[0], 0.08, a[1]], [b[0], 0.08, b[1]], 0.008, hex);
  beam(s, [a[0], 0.18, a[1]], [b[0], 0.18, b[1]], 0.008, hex);
  beam(s, [a[0], 0.08, a[1]], [b[0], 0.18, b[1]], 0.006, hex);
}
