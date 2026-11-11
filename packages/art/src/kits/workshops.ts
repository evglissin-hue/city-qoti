/* eslint-disable */
// R1E: workshop trades by level (kits/business.ts has the rules every level follows). Each draw
// fits its trade's look into the workshop's 3x3 lot in its district style: the baker's oven, the
// weaver's long windows and tenter frame, the carpenter's open bay and timber, the chandler's
// dipping rack and the cider maker's mill and press.
//
// Every trade is one shared body (sized by level) plus a signature function. The signature masses
// (the oven dome and smoke, the dyed cloth, the plank stacks and open bay, the candle rack, the
// barrel pyramid) sit outside `s.detail` so the far level still reads as the trade; their small
// things (loaves, tools, hoops, candles one by one) are near-only.
import { vary, type ShapeBuilder } from '../geometry';
import { palette } from '../palette';
import { beam, cylZ } from '../shapes';
import { shell, signBoard, windowRow, type Built, type Shell } from './buildings';
import { awningPart, chimneyPart, claddingDepth, doorPart, faceBox, facePoint, hangingSign } from './parts';
import type { Face, WallMaterial, WindowStyle } from './parts';
import { gardenEdge } from './details';
import type { DistrictLook } from './district';
import { clamp, EMBLEMS, homeLook, makingOf, start, workbench, type Emblem } from './grown';
import { crateOf, GOOD_COLORS, pileOf } from './goods';
import { barrel, flowerPot, sawhorse, wallLantern } from './props';
import { roofPart } from './roofs';
import type { KitAnchors, KitBuildOptions } from './types';
import {
  goodsOutFront,
  levelOf,
  outLevel,
  paintedSign,
  type BusinessDraw,
  type BusinessLevel,
} from './business';
import { bakeOven } from './workplaces';
import { appleMill, screwPress, tenterFrame } from './village';
import { chairOf, dippingRack } from './trades';

// --- The shared body -----------------------------------------------------------------------------

/** What every workshop trade is drawn on: the sized building, its door and the lot's zones. */
interface Body {
  s: ShapeBuilder;
  anchors: KitAnchors;
  L: DistrictLook;
  rnd: () => number;
  look: () => number;
  level: BusinessLevel;
  w: number;
  d: number;
  /** The walls (ground plan) and the front wall's plane. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Door position along x, and the building's center. */
  du: number;
  front: Face;
  clad: number;
  sh: Shell;
  /** The feature side: the side wall (1 is x+) that carries the trade's big piece. */
  side: 1 | -1;
  /** Where the lot ends on the feature side, and how much room there is between it and the wall. */
  edge: number;
  room: number;
  good: string | null;
  paint: number;
  /** Where the output pile and the level 2 trestle stand (a trade may move them). */
  pile: [number, number];
  goodsAt: [number, number];
}

interface BodySpec {
  salt: number;
  paint: number;
  /** Force the feature side (default: by the look stream). */
  side?: 1 | -1;
  wall?: (L: DistrictLook) => WallMaterial;
}

// Building size by level: modest and one storey, wider with room for a lean-to, then two storeys.
const WIDTH = [1.5, 1.8, 1.9] as const;
const DEPTH = [1.3, 1.4, 1.5] as const;
const FRONT = [0.95, 1.0, 1.05] as const;

function workshopBody(opts: KitBuildOptions | undefined, spec: BodySpec): Body {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const level = levelOf(opts);
  const L = homeLook(opts, spec.salt);
  const { rnd, look } = L;
  const { s, anchors } = start(opts);
  const bw = WIDTH[level - 1]!;
  const du = ex + 0.5;
  const cx = clamp(du, bw / 2 + 0.45, w - bw / 2 - 0.45);
  const x0 = cx - bw / 2;
  const x1 = cx + bw / 2;
  const z1 = d - FRONT[level - 1]!;
  const z0 = z1 - DEPTH[level - 1]!;
  const side: 1 | -1 = spec.side ?? (look() < 0.5 ? -1 : 1);
  const wall: WallMaterial = spec.wall
    ? spec.wall(L)
    : L.wall === 'plaster' && look() < 0.5
      ? 'weatherboard'
      : L.wall;
  const wallColor = wall === L.wall ? L.wallColor : vary(0x8a6f58, rnd, 0.5);
  const storeys2 = level === 3;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.08,
    wallH: storeys2 ? 1.5 : level === 2 ? 0.86 : 0.8,
    wall,
    wallColor,
    trim: L.trim,
    ...(storeys2
      ? { upper: { at: 0.78, wall: L.upper, color: L.upperColor, jetty: L.upper === 'timber' ? 0.06 : 0.02 } }
      : {}),
    roof: {
      shape: L.roofShape === 'hip' ? 'halfHip' : L.roofShape,
      material: L.roofMaterial === 'thatch' ? 'shingle' : L.roofMaterial,
      color: L.roofMaterial === 'thatch' ? vary(0x8a6f58, rnd, 0.5) : L.roofColor,
      rise: storeys2 ? 0.7 : 0.58,
      overhang: 0.16,
      ridgeAlongX: false,
    },
    rnd,
  });
  const clad = claddingDepth(wall);
  const front: Face = { dir: 'z+', plane: z1 };
  doorPart(s, front, du, 0.56, 0.62, vary(spec.paint, rnd, 0.3), L.trim, 'double', clad);
  (globalThis as any).__T?.('door', (s as any).n / 3);
  const edge = side > 0 ? w - 0.1 : 0.1;
  const good = (typeof opts?.params?.make === 'string' && opts.params.make) || makingOf(opts);
  return {
    s,
    anchors,
    L,
    rnd,
    look,
    level,
    w,
    d,
    x0,
    x1,
    z0,
    z1,
    du,
    front,
    clad,
    sh,
    side,
    edge,
    room: Math.abs(edge - (side > 0 ? x1 : x0)),
    good: good || null,
    paint: spec.paint,
    pile: [clamp(du - side * 0.9, 0.35, w - 0.35), z1 + 0.4],
    goodsAt: [clamp(du - side * 0.8, 0.35, w - 0.35), d - 0.28],
  };
}

/** The feature side's wall plane. */
function wallOf(b: Body): number {
  return b.side > 0 ? b.x1 : b.x0;
}

/** A point on the feature side, `dx` out from its wall (toward the lot's edge). */
function outX(b: Body, dx: number): number {
  return wallOf(b) + b.side * dx;
}

/**
 * The level pieces every trade shares, drawn after its signature: front windows, a window row on the
 * quiet side, the output pile and yard; level 1 a small hanging sign and a lantern; level 2 the
 * painted sign above the door and the goods trestle out front; level 3 an upper storey's windows and
 * the sign above, the awning, a fenced yard, a second pile and barrels.
 */
function finish(
  b: Body,
  emblem: Emblem,
  opts: KitBuildOptions | undefined,
  quiet: 'windows' | 'none' = 'windows',
): Built {
  const { s, anchors, L, rnd, level, w, d, x0, x1, z0, z1, du, front, clad, sh, paint } = b;
  (globalThis as any).__T?.('trade-start', (s as any).n / 3);
  const style: WindowStyle = { frame: L.frame, shutter: null, box: false, flowers: [] };
  const lights = anchors.lights!;
  const upFront: Face = { dir: 'z+', plane: sh.outer[3] };
  const upClad = claddingDepth(level === 3 ? L.upper : L.wall);
  // The painted sign (level 2 on the wall above the door, level 3 on the upper storey).
(globalThis as any).__T?.('finish start', (s as any).n / 3);
  if (level === 2) paintedSign(s, front, du, sh.top - 0.13, 0.5, clad, paint, anchors);
  else if (level === 3) paintedSign(s, upFront, du, sh.top - 0.42, 0.5, upClad, paint, anchors);
  else if (L.custom.sign) signBoard(s, front, du, sh.top - 0.06, 0.5, clad, anchors);
  // The awning over the door and windows.
  if (level === 3)
    awningPart(
      s,
      front,
      clamp(du - 0.72, x0 + 0.02, x1),
      clamp(du + 0.72, x0, x1 - 0.02),
      0.7,
      0.36,
      vary(paint, rnd, 0.3),
      palette.white,
      6,
    );
(globalThis as any).__T?.('sign+awning', (s as any).n / 3);
  // The goods out front and a second pile and barrels at level 3.
  const good = b.good;
  if (level >= 2) goodsOutFront(s, good, b.goodsAt[0], b.goodsAt[1], rnd, 2);
  (globalThis as any).__T?.('goods+piles', (s as any).n / 3);
  if (good) pileOf(s, good, outLevel(opts, good, level === 1 ? 1 : 2), b.pile[0], 0, b.pile[1], rnd);
  if (level === 3 && good)
    pileOf(
      s,
      good,
      Math.max(1, outLevel(opts, good, 1) - 1),
      clamp((b.side > 0 ? x0 : x1) - b.side * 0.3, 0.32, w - 0.32),
      0,
      z0 + 0.5,
      rnd,
    );
  (globalThis as any).__T?.('prefinish', (s as any).n / 3);
  s.detail(() => {
    // Windows: the quiet side wall, the front either side of the door, an upper storey at level 3.
    if (quiet === 'windows') {
      const f: Face = { dir: b.side > 0 ? 'x-' : 'x+', plane: b.side > 0 ? x0 : x1 };
      windowRow(s, f, z0, z1, 0.5, style, rnd, lights, [], 0.48, [0.3, 0.26], clad);
    }
    for (const u of [x0 + 0.24, x1 - 0.24])
      if (Math.abs(u - du) > 0.4)
        windowRow(
          s,
          front,
          u - 0.12,
          u + 0.12,
          0.46,
          { ...style, box: L.windowBoxes },
          rnd,
          lights,
          [],
          0.3,
          [0.2, 0.22],
          clad,
        );
    if (level === 3) {
      for (const u of [x0 + 0.3, x1 - 0.3])
        windowRow(
          s,
          upFront,
          u - 0.12,
          u + 0.12,
          sh.top - 0.5,
          style,
          rnd,
          lights,
          [],
          0.3,
          [0.2, 0.26],
          upClad,
        );
    }
    // The yard: packed earth, bigger with each level.
    const half = [0.85, 1.1, 1.42][level - 1]!;
    s.rbox(
      clamp(du - half, 0.08, w),
      0,
      z1 + 0.04,
      clamp(du + half, 0, w - 0.08),
      0.008,
      d - 0.1,
      vary(0xb59a6e, rnd, 0.4),
      0.05,
    );
    if (level === 1) {
      hangingSign(s, front, du + (b.side > 0 ? -0.5 : 0.5), 0.82, vary(palette.paper, rnd, 0.3), emblem);
    }
    if (level >= 2) {
      anchorLantern(b, du + 0.42);
    } else anchorLantern(b, du - 0.42);
  (globalThis as any).__T?.('windows+yard', (s as any).n / 3);
    if (level === 3) {
      // A fenced yard in the district's edge, a gate on the path, barrels by the quiet wall.
      const edgeKind = L.garden ?? 'picket';
      const fz = d - 0.06;
      gardenEdge(s, edgeKind, [0.3, fz], [w - 0.3, fz], rnd, [du, fz], paint);(globalThis as any).__T?.('fence front', (s as any).n / 3);
      (globalThis as any).__T?.('fence all', (s as any).n / 3);
      const qx = b.side > 0 ? x0 - 0.18 : x1 + 0.18;
      barrel(s, qx, 0, z1 - 0.2, rnd);
      barrel(s, qx, 0, z1 - 0.42, rnd, 0.85);
(globalThis as any).__T?.('barrels', (s as any).n / 3);
      flowerPot(s, du - 0.45, 0, z1 + 0.14, rnd);
      flowerPot(s, du + 0.45, 0, z1 + 0.14, rnd);
    }
  });
  (globalThis as any).__T?.('end', (s as any).n / 3);
  return { s, anchors };
}

function anchorLantern(b: Body, u: number): void {
  const { s, front, clad } = b;
  (globalThis as any).__T?.('trade-start', (s as any).n / 3);
  b.anchors.lights!.push(wallLantern(s, facePoint(front, u, 0.7, clad), [0, 0, 1]));
}

/** A brick flue on the ridge side, smoking. */
function flue(b: Body, dx = 0, big = false): void {
  const { s, anchors, x0, x1, z0, sh } = b;
  (globalThis as any).__T?.('trade-start', (s as any).n / 3);
  if (!b.L.chimney && !big) return;
  const brick = b.L.wall === 'stone' ? vary(b.L.wallColor, b.rnd) : palette.brick;
  anchors.smoke!.push(chimneyPart(s, (x0 + x1) / 2 + dx, z0 + 0.4, sh.top - 0.1, sh.ridge + 0.1, brick, big));
}

// --- Bakery --------------------------------------------------------------------------------------

/** The baker: a domed brick oven bulging from the side wall, loaves and flour, the bread sign. */
function bakery(opts: KitBuildOptions | undefined): ReturnType<BusinessDraw> {
  const b = workshopBody(opts, { salt: 61, paint: palette.accentRed });
  const { s, anchors, rnd, level, z0, z1, x0, x1, w, du, front, clad } = b;
  (globalThis as any).__T?.('trade-start', (s as any).n / 3);
  // Signature: the oven (dome and flue) and its wood stack, far visible.
  const k = [1, 1.12, 1.25][level - 1]!;
  anchors.smoke!.push(bakeOven(s, wallOf(b), (z0 + z1) / 2 - 0.1, b.side, rnd, k, 0));
  if (level >= 2)
    pileOf(s, 'firewood', level === 2 ? 1 : 2, clamp(outX(b, b.room * 0.5), 0.3, w - 0.3), 0, z0 + 0.12, rnd);
(globalThis as any).__T?.('oven', (s as any).n / 3);
  flue(b, -b.side * 0.4, level >= 2);(globalThis as any).__T?.('flue', (s as any).n / 3);
  s.detail(() => {
    // Loaves on a sill, flour sacks by the door and a warm window.
    const u0 = b.side > 0 ? x0 + 0.1 : x1 - 0.5;
    faceBox(s, front, u0, 0.34, 0, u0 + 0.4, 0.38, 0.1, palette.timber);
    for (let i = 0; i < 4; i++) {
      const p = facePoint(front, u0 + 0.07 + i * 0.1, 0.4, 0.05);
      s.blob(p[0], p[1], p[2], 0.04, 0.026, 0.03, vary(GOOD_COLORS.bread, rnd, 0.8), 1);
    }
    anchors.lights!.push(facePoint(front, u0 + 0.2, 0.55, 0.05 + clad));
    for (let i = 0; i < 2 + level; i++)
      s.blob(
        du + (b.side > 0 ? 0.5 : -0.5) + (i % 2) * 0.14,
        0.075 + (i > 1 ? 0.1 : 0),
        z1 + 0.14,
        0.08,
        0.07,
        0.07,
        vary(GOOD_COLORS.sack, rnd, 0.5),
        1,
      );
  });
  (globalThis as any).__T?.('trade-end', (s as any).n / 3);
  return finish(b, EMBLEMS.bread!, opts, 'windows');
}

// --- Weaver --------------------------------------------------------------------------------------

const DYES = [0xb5483c, 0x3f5f93, 0xd9b43a, 0xb5483c, 0x3f5f93];

/** The weaver: long window bands under the eaves, the tenter frame with dyed cloth, dye tubs. */
function weaver(opts: KitBuildOptions | undefined): ReturnType<BusinessDraw> {
  const b = workshopBody(opts, { salt: 63, paint: 0x3f5f93 });
  const { s, anchors, rnd, level, z0, z1, w, d, du, sh } = b;
  (globalThis as any).__T?.('trade-start', (s as any).n / 3);
  const lights = anchors.lights!;
  // The weavers' windows: a long band of panes under the eaves, both side walls.
  s.detail(() => {
    const yb = sh.top - 0.46;
    for (const f of [
      { dir: 'x+', plane: sh.outer[2] },
      { dir: 'x-', plane: sh.outer[0] },
    ] as Face[]) {
      faceBox(s, f, z0 + 0.08, yb - 0.02, 0.01, z1 - 0.08, yb + 0.3, 0.03, palette.white);
      s.glow(1);
      faceBox(s, f, z0 + 0.11, yb + 0.01, 0.03, z1 - 0.11, yb + 0.27, 0.035, palette.windowDay);
      s.glow(0);
      const n = Math.max(3, Math.floor((z1 - z0 - 0.2) / 0.16));
      for (let i = 1; i < n; i++) {
        const u = z0 + 0.11 + ((z1 - z0 - 0.22) * i) / n;
        faceBox(s, f, u - 0.007, yb + 0.01, 0.035, u + 0.007, yb + 0.27, 0.042, palette.white);
      }
      lights.push(facePoint(f, (z0 + z1) / 2, yb + 0.14, 0.08));
    }
  });
  // Signature: the tenter frames with madder red, woad blue and weld yellow cloth, and dye tubs.
  const fx0 = b.side > 0 ? du + 0.42 : 0.14;
  const fx1 = b.side > 0 ? w - 0.14 : du - 0.42;
  const fz = z1 + 0.52;
  tenterFrame(s, fx0, fx1, fz, rnd, DYES);
  if (level >= 2) tenterFrame(s, fx0, fx1, d - 0.2, rnd, DYES.slice(1));
  if (level === 3) tenterFrame(s, outX(b, 0.04), b.edge, z0 + 0.5, rnd, DYES.slice(2));
  const tubX = (i: number): number => du + b.side * (0.5 + i * 0.26);
  for (let i = 0; i < 3; i++) {
    const x = tubX(i);
    s.cylinder(x, z1 + 0.16, 0.1, 0.11, 0, 0.12, palette.darkWood, 8);
    s.cylinder(x, z1 + 0.16, 0.085, 0.085, 0.12, 0.125, DYES[i]!, 8);
  }
  b.pile = [clamp(du - b.side * 0.9, 0.35, w - 0.35), z1 + 0.4];
  flue(b);
  return finish(
    b,
    (ss, c) => {
      for (const k of [-1, 1]) ss.blob(c[0] + k * 0.02, c[1], c[2], 0.012, 0.03, 0.07, GOOD_COLORS.cloth, 0);
    },
    opts,
    'none',
  );
}

// --- Carpenter -----------------------------------------------------------------------------------

/** A stack of pale boards lying along z, `n` layers, as one block far off. */
function plankStack(
  s: ShapeBuilder,
  x: number,
  z0: number,
  z1: number,
  half: number,
  n: number,
  rnd: () => number,
): void {
  s.proxy((p) => {
    p.box(x - half - 0.02, 0, z0 + 0.03, x - half + 0.02, 0.05, z0 + 0.07, palette.darkWood);
    p.box(x + half - 0.02, 0, z0 + 0.03, x + half + 0.02, 0.05, z0 + 0.07, palette.darkWood);
    p.box(x - half - 0.02, 0, z1 - 0.07, x - half + 0.02, 0.05, z1 - 0.03, palette.darkWood);
    p.box(x + half - 0.02, 0, z1 - 0.07, x + half + 0.02, 0.05, z1 - 0.03, palette.darkWood);
    for (let i = 0; i < n; i++) {
      const dx = (rnd() - 0.5) * 0.03;
      p.box(
        x - half + dx,
        0.05 + i * 0.03,
        z0,
        x + half + dx,
        0.077 + i * 0.03,
        z1,
        vary(i % 2 ? GOOD_COLORS.plankDark : GOOD_COLORS.plank, rnd, 0.6),
      );
    }
  });
}

/** The carpenter: an open bay on posts beside the shop with pale stacks, a half-made chair. */
function carpenter(opts: KitBuildOptions | undefined): ReturnType<BusinessDraw> {
  const b = workshopBody(opts, {
    salt: 65,
    paint: 0x5f7a52,
    wall: (L) => (L.wall === 'plaster' || L.wall === 'brick' ? 'weatherboard' : L.wall),
  });
  const { s, rnd, level, z0, z1, w, du } = b;
  (globalThis as any).__T?.('trade-start', (s as any).n / 3);
  // Signature: the open bay (a lean-to roof on posts) and the pale plank stacks inside it.
  const depth = Math.min(0.62, b.room - 0.04);
  const wx = wallOf(b);
  const ox = wx + b.side * depth;
  const bz0 = z0 + 0.12;
  const bz1 = z1 - 0.04;
  const roofTop = 0.76;
  roofPart(s, {
    shape: 'lean',
    material: b.sh.roof.material,
    x0: Math.min(wx, ox) - (b.side < 0 ? 0.08 : 0),
    z0: bz0 - 0.06,
    x1: Math.max(wx, ox) + (b.side > 0 ? 0.08 : 0),
    z1: bz1 + 0.06,
    y0: 0.5,
    y1: roofTop,
    color: vary(b.sh.roof.color, rnd, 0.3),
    trim: b.L.trim,
    ridgeAlongX: false,
    rnd,
    ...(b.side < 0 ? { highAtC1: true } : {}),
  });
  for (const pz of [bz0, (bz0 + bz1) / 2, bz1]) beam(s, [ox, 0, pz], [ox, 0.54, pz], 0.022, b.L.trim);
  const half = (depth - 0.1) / 2;
  const sx = wx + b.side * (0.06 + half);
  const mid = (bz0 + bz1) / 2;
  plankStack(s, sx, bz0 + 0.04, mid - 0.04, half, [5, 7, 9][level - 1]!, rnd);
  plankStack(s, sx, mid + 0.04, bz1 - 0.04, half, [3, 5, 6][level - 1]!, rnd);
  s.detail(() => {
    // A sawhorse with a board across and a half-made chair in the yard, shavings.
    const hx = outX(b, b.room * 0.4);
    sawhorse(s, hx, z1 + 0.3, true, rnd);
    s.box(hx - 0.2, 0.2, z1 + 0.27, hx + 0.2, 0.215, z1 + 0.33, GOOD_COLORS.plank);
    const cxx = hx;
    const czz = z1 + 0.6;
    chairOf(s, cxx, czz, vary(0xc79a62, rnd, 0.4));
    workbench(s, hx, z1 + 0.9, true, rnd);
    s.blob(hx + 0.2, 0.012, z1 + 0.5, 0.05, 0.01, 0.04, 0xe6cfa0, 0);
  });
  b.pile = [clamp(du - b.side * 0.9, 0.35, w - 0.35), z1 + 0.42];
  const stove = (b.x0 + b.x1) / 2 - b.side * 0.3;
  b.anchors.smoke!.push([stove, b.sh.ridge + 0.32, z0 + 0.4]);
  s.cylinder(stove, z0 + 0.4, 0.045, 0.045, b.sh.top - 0.05, b.sh.ridge + 0.22, palette.metal, 6);
  s.cylinder(stove, z0 + 0.4, 0.08, 0, b.sh.ridge + 0.22, b.sh.ridge + 0.3, palette.metal, 6);
  return finish(
    b,
    (ss, c) => {
      ss.box(c[0] - 0.03, c[1] - 0.05, c[2] + 0.015, c[0] + 0.03, c[1] - 0.035, c[2] + 0.025, 0x6e4a2e);
      ss.box(c[0] - 0.03, c[1] - 0.035, c[2] + 0.015, c[0] - 0.02, c[1] + 0.05, c[2] + 0.025, 0x6e4a2e);
    },
    opts,
    'windows',
  );
}

// --- Chandler ------------------------------------------------------------------------------------

/** A wide dipping rack hung with rows of cream candles; one cream block far off. */
function candleRack(s: ShapeBuilder, x: number, z: number, rows: number, rnd: () => number): void {
  for (const dx of [-0.36, 0.36])
    beam(s, [x + dx, 0, z - 0.1], [x + dx, 0.5, z - 0.1], 0.014, palette.timber);
  for (const dx of [-0.36, 0.36])
    beam(s, [x + dx, 0, z + 0.1], [x + dx, 0.5, z + 0.1], 0.014, palette.timber);
  beam(s, [x - 0.4, 0.5, z - 0.1], [x + 0.4, 0.5, z - 0.1], 0.014, palette.timber);
  beam(s, [x - 0.4, 0.5, z + 0.1], [x + 0.4, 0.5, z + 0.1], 0.014, palette.timber);
  s.levels(
    () => {
      for (let r = 0; r < rows; r++)
        for (let i = 0; i < 9; i++) {
          const cx = x - 0.32 + i * 0.08;
          const cz = z - 0.1 + r * (0.2 / Math.max(1, rows - 1));
          s.cylinder(cx, cz, 0.012, 0.016, 0.22, 0.5, vary(GOOD_COLORS.candle, rnd, 0.3), 5);
          s.cylinder(cx, cz, 0.004, 0.004, 0.18, 0.22, GOOD_COLORS.candleWick, 3);
        }
    },
    () => {
      s.box(x - 0.34, 0.2, z - 0.1, x + 0.34, 0.5, z + 0.1, GOOD_COLORS.candle);
    },
  );
}

/** The chandler: a wide candle rack, a wax pot over a little fire, honey pots, a candle sign. */
function chandler(opts: KitBuildOptions | undefined): ReturnType<BusinessDraw> {
  const b = workshopBody(opts, { salt: 67, paint: 0x45607a });
  const { s, anchors, rnd, level, z0, z1, w, du, front, clad } = b;
  (globalThis as any).__T?.('trade-start', (s as any).n / 3);
  // Signature: the cream rack out front on the feature side.
  const rx = clamp(du + b.side * 0.85, 0.5, w - 0.5);
  candleRack(s, rx, z1 + 0.4, level === 1 ? 2 : 3, rnd);
  // The wax pot over a little fire beside the wall, smoking.
  const px = outX(b, Math.min(0.28, b.room * 0.5));
  s.cylinder(px, z0 + 0.45, 0.11, 0.1, 0, 0.05, 0x8d8a82, 8);
  s.cylinder(px, z0 + 0.45, 0.085, 0.1, 0.05, 0.17, 0x3d3f44, 8);
  s.cylinder(px, z0 + 0.45, 0.07, 0.07, 0.17, 0.175, 0xece4d2, 8);
  s.glow(2);
  s.blob(px, 0.04, z0 + 0.45 + 0.09, 0.03, 0.03, 0.03, palette.lantern, 0);
  s.glow(0);
  anchors.smoke!.push([px, 0.3, z0 + 0.45]);
  pileOf(
    s,
    'honey',
    level === 1 ? 2 : 3,
    clamp(outX(b, Math.min(0.28, b.room * 0.5)), 0.3, w - 0.3),
    0,
    z0 + 1.0,
    rnd,
  );
  s.detail(() => {
    // A warm window with candles in it.
    const u = b.side > 0 ? b.x0 + 0.25 : b.x1 - 0.25;
    if (Math.abs(u - du) > 0.4) {
      for (let i = 0; i < 3; i++) {
        const p = facePoint(front, u - 0.07 + i * 0.07, 0.4, 0.05 + clad);
        s.cylinder(p[0], p[2], 0.01, 0.01, 0.4, 0.46 + (i % 2) * 0.03, 0xf3ecdc, 5);
        s.glow(2);
        s.blob(p[0], 0.47 + (i % 2) * 0.03, p[2], 0.007, 0.012, 0.007, palette.lantern, 0);
        s.glow(0);
      }
      anchors.lights!.push(facePoint(front, u, 0.46, 0.06 + clad));
    }
    dippingRack(s, b.side > 0 ? b.x0 - 0.25 : b.x1 + 0.25, z1 - 0.1, rnd);
  });
  flue(b, -b.side * 0.3);
  return finish(
    b,
    (ss, c) => {
      ss.cylinder(c[0], c[2] + 0.02, 0.015, 0.015, c[1] - 0.05, c[1] + 0.03, 0xf3ecdc, 6);
      ss.glow(2);
      ss.blob(c[0], c[1] + 0.05, c[2] + 0.02, 0.012, 0.02, 0.012, palette.lantern, 0);
      ss.glow(0);
    },
    opts,
    'windows',
  );
}

// --- Cider maker ---------------------------------------------------------------------------------

/** Barrels lying on their sides in a pyramid (rows of `n`, n - 1 ... 1), along z, near the wall. */
function barrelPyramid(s: ShapeBuilder, x: number, z: number, rows: number, rnd: () => number): void {
  const r = 0.085;
  s.proxy((p) => {
    for (let row = 0; row < rows; row++) {
      const n = rows - row;
      for (let i = 0; i < n; i++) {
        const bx = x + (i - (n - 1) / 2) * r * 2.05;
        const by = r + row * r * 1.8;
        const col = vary(i % 2 ? palette.wood : 0xb98a5a, rnd, 0.5);
        cylZ(p, z - 0.13, z + 0.13, bx, by, r, col, 8, vary(0xc79a62, rnd, 0.4));
        for (const dz of [-0.08, 0.08]) cylZ(p, z + dz - 0.01, z + dz + 0.01, bx, by, r + 0.004, 0x55595e, 8);
      }
    }
  });
}

/** The cider maker: the press shed with the screw press, the mill, a barrel pyramid, apple crates. */
function ciderMaker(opts: KitBuildOptions | undefined): ReturnType<BusinessDraw> {
  const b = workshopBody(opts, { salt: 69, paint: 0x7f9a52, side: 1 });
  const { s, rnd, level, z0, z1, x1, w, d, du } = b;
  (globalThis as any).__T?.('trade-start', (s as any).n / 3);
  // Signature: the barrel pyramid beside the wall.
  const bx = clamp(outX(b, b.room * 0.5), 0.3, w - 0.34);
  barrelPyramid(s, bx, z1 - 0.45, level + 1, rnd);
  if (level >= 2) barrelPyramid(s, bx, z0 + 0.3, level, rnd);
  // The open press shed: four posts and a lean roof over the screw press.
  const sx0 = du + 0.42;
  const sx1 = w - 0.1;
  const sz0 = z1 + 0.1;
  const sz1 = d - 0.45;
  for (const px of [sx0, sx1])
    for (const pz of [sz0 + 0.05, sz1]) beam(s, [px, 0, pz], [px, 0.62, pz], 0.022, palette.timber);
  roofPart(s, {
    shape: 'lean',
    material: b.sh.roof.material,
    x0: sx0 - 0.06,
    z0: sz0 - 0.04,
    x1: sx1 + 0.06,
    z1: sz1 + 0.08,
    y0: 0.56,
    y1: 0.8,
    color: vary(b.sh.roof.color, rnd, 0.3),
    trim: b.L.trim,
    ridgeAlongX: true,
    rnd,
  });
  s.detail(() => {
    screwPress(s, (sx0 + sx1) / 2, (sz0 + sz1) / 2, rnd);
    appleMill(s, 0.46, z1 + 0.4, rnd);
    for (let i = 0; i < 2 + level; i++)
      crateOf(
        s,
        'apples',
        x1 + 0.2 + (i % 3) * 0.0,
        i > 2 ? 0.12 : 0,
        d - 0.6 + (i % 3) * 0.0 - (i > 2 ? 0 : i) * 0.0,
        rnd,
      );
  });
  b.pile = [clamp(b.x0 - 0.3, 0.32, w - 0.35), z0 + 0.55];
  b.goodsAt = [(sx0 + sx1) / 2, d - 0.28];
  flue(b, -0.3);
  return finish(
    b,
    (ss, c) => {
      for (const k of [-1, 1]) ss.blob(c[0] + k * 0.02, c[1], c[2], 0.012, 0.05, 0.05, palette.apple, 1);
    },
    opts,
    'windows',
  );
}

/** Workshop draws by the look kit id a trade names (content `TradeDef.look`). */
export const WORKSHOP_LOOKS: Readonly<Record<string, BusinessDraw>> = {
  bakery,
  carpenter,
  chandler,
  'cider-press': ciderMaker,
  weaver,
};
