// R1E: farm trades by level (kits/business.ts has the rules every level follows). Each draw fits
// its trade's look into the farmstead's 3x3 lot in its district style: grain and a barn, a market
// garden's rows, an orchard's trees, a dairy's byre and cows, a sheep run's fold and the hives.
//
// Every farm shares one lot: a small farmhouse in the district look at the front corner by the
// road, a packed-earth yard in front, a gate in the front fence, and the produce area behind and
// beside the house. The produce area grows with the level (more trees, rows, hives, animals); level
// 2 sets the painted sign on two posts by the gate and the good out front; level 3 adds an
// outbuilding and the fullest produce. The signature masses (barn and rick, crop rows, canopies,
// the byre and its paddock, the fold, the hive rows) draw at both levels of detail; tools, crates,
// hens and ladders are near-only.
import type { ShapeBuilder } from '../geometry';
import { mixHex, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { SURFACE } from '../surface';
import { beam } from '../shapes';
import { shell, windowRow, type Built } from './buildings';
import { type BusinessDraw, goodsOutFront, levelOf, paintedSign, type BusinessLevel } from './business';
import { gardenEdge, hen, postAndRail, trough } from './details';
import { clamp, homeLook, makingOf, start, steppingStones, windowsOf } from './grown';
import { cheeseWheel, crateOf, GOOD_COLORS, pileOf } from './goods';
import { chimneyPart, claddingDepth, doorPart, faceBox, windowPart, type Face } from './parts';
import { hayBale, ladder, scarecrow, wateringCan } from './props';
import { roofPart, type RoofMaterial } from './roofs';
import type { DistrictLook } from './district';
import { orchardTree, paddock, seasonOf, shepherdsHut, skep } from './village';
import type { KitAnchors, KitBuildOptions } from './types';

const YARD = 0xb59a6e;

/** Everything a farm trade draws against: the shared lot, with x mirrored when the road side flips. */
interface Lot {
  s: ShapeBuilder;
  anchors: KitAnchors;
  L: DistrictLook;
  rnd: () => number;
  look: () => number;
  w: number;
  d: number;
  lvl: BusinessLevel;
  season: number;
  /** The house stands at the left (x-) of the lot; false mirrors every x. */
  left: boolean;
  doorU: number;
  make: string | null;
  /** The z where produce stops and the yard begins. */
  yardZ: number;
  /** Mirror an x into the lot (identity when the house is at the left). */
  m: (x: number) => number;
  /** A mirrored, sorted x range. */
  xr: (x0: number, x1: number) => [number, number];
}

/**
 * A humble outbuilding: weatherboard walls under a small gable roof of shingle (or what the look
 * names) with a little overhang, a plank door and a window on the end. The ridge runs along x or z.
 * P2-E2: it is built with the same shell, surfaces and roof builder as the farm's other buildings.
 */
function shed(
  lot: Lot,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  opts: {
    wallH?: number;
    wall?: number;
    roof?: number;
    rise?: number;
    ridgeAlongX?: boolean;
    material?: RoofMaterial;
  } = {},
): void {
  const { s, rnd, L, anchors } = lot;
  const [a, b] = lot.xr(x0, x1);
  const base = 0.04;
  const top = base + (opts.wallH ?? 0.42);
  const wallH = top - base;
  const alongX = opts.ridgeAlongX ?? true;
  const material = opts.material ?? 'shingle';
  const rise = opts.rise ?? 0.32;
  const wall = vary(opts.wall ?? 0x9a7a58, rnd, 0.4);
  // A low stone footing, then weatherboard walls (the timber surface lays the boards) and gable ends.
  s.surface(SURFACE.stone);
  s.box(a - 0.02, 0, z0 - 0.02, b + 0.02, base, z1 + 0.02, palette.foundation, 'b' + (s.low ? 't' : ''));
  s.surface(SURFACE.timber);
  s.box(a, base, z0, b, top, z1, wall, 'b' + (s.low ? 't' : ''));
  const ridge = top + rise;
  const zm = (z0 + z1) / 2;
  const xm = (a + b) / 2;
  if (alongX) {
    s.tri([a, top, z0], [a, top, z1], [a, ridge, zm], wall, [-1, 0, 0]);
    s.tri([b, top, z0], [b, top, z1], [b, ridge, zm], wall, [1, 0, 0]);
  } else {
    s.tri([a, top, z0], [b, top, z0], [xm, ridge, z0], wall, [0, 0, -1]);
    s.tri([a, top, z1], [b, top, z1], [xm, ridge, z1], wall, [0, 0, 1]);
  }
  s.surface(SURFACE.plain);
  // The roof: courses of shingle with a small overhang (a hair of verge), kept inside the lot.
  const ov = 0.09;
  const verge = 0.05;
  const ox = alongX ? verge : ov;
  const oz = alongX ? ov : verge;
  roofPart(s, {
    shape: 'gable',
    material,
    x0: Math.max(0.04, a - ox),
    z0: Math.max(0.04, z0 - oz),
    x1: Math.min(lot.w - 0.04, b + ox),
    z1: Math.min(lot.d - 0.04, z1 + oz),
    y0: top - 0.04,
    y1: ridge,
    color: vary(opts.roof ?? 0x6b625c, rnd, 0.5),
    trim: palette.timber,
    ridgeAlongX: alongX,
    rnd,
  });
  const clad = claddingDepth('weatherboard');
  const cx = (a + b) / 2;
  doorPart(
    s,
    { dir: 'z+', plane: z1 },
    cx,
    0.2,
    Math.min(0.34, wallH * 0.8),
    0x6a4a34,
    palette.timber,
    'plank',
    clad,
  );
  s.detail(() => {
    const style = { ...windowsOf(L), box: false, shutter: null };
    // The window sits on the end wall that faces the yard, small and square.
    windowPart(
      s,
      { dir: 'x+', plane: b },
      (z0 + z1) / 2,
      wallH * 0.6,
      0.1,
      0.11,
      style,
      rnd,
      anchors.lights,
      clad,
    );
  });
}

/** The shared lot: house, yard, gate, front fence, and (from level 2) the sign and goods out front. */
function lotOf(opts: KitBuildOptions | undefined, salt: number, paint: number): Lot {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const L = homeLook(opts, salt);
  const { rnd, look } = L;
  const { s, anchors } = start(opts);
  const lvl = levelOf(opts);
  const doorU = ex + 0.5;
  const left = doorU <= w / 2 + 0.01;
  const m = (x: number): number => (left ? x : w - x);
  const xr = (x0: number, x1: number): [number, number] => (left ? [x0, x1] : [w - x1, w - x0]);
  const lot: Lot = {
    s,
    anchors,
    L,
    rnd,
    look,
    w,
    d,
    lvl,
    season: seasonOf(opts),
    left,
    doorU,
    make: opts?.params?.make === undefined ? makingOf(opts) : String(opts.params.make),
    yardZ: lvl === 3 ? d - 0.7 : d - 0.55,
    m,
    xr,
  };
  // The farmhouse: small at level 1, a little wider at 2 and 3, at the front corner by the road.
  const hw = lvl === 1 ? 0.95 : 1.15;
  const [hx0, hx1] = xr(0.16, 0.16 + hw);
  const hz1 = d - 0.42;
  const hz0 = hz1 - 0.85;
  const house = shell(s, {
    lot: [w, d],
    x0: hx0,
    z0: hz0,
    x1: hx1,
    z1: hz1,
    base: 0.08,
    wallH: 0.66,
    wall: L.wall,
    wallColor: L.wallColor,
    trim: L.trim,
    roof: {
      shape: L.roofShape,
      material: L.roofMaterial,
      color: L.roofColor,
      rise: 0.5,
      overhang: 0.14,
      ridgeAlongX: true,
    },
    rnd,
  });
  const clad = claddingDepth(L.wall);
  const hFront: Face = { dir: 'z+', plane: hz1 };
  const hdoor = clamp(m(0.7), hx0 + 0.28, hx1 - 0.28);
  doorPart(s, hFront, hdoor, 0.26, 0.54, L.accent, L.trim, 'dutch', clad);
  if (L.chimney)
    anchors.smoke!.push(
      chimneyPart(
        s,
        left ? hx0 + 0.24 : hx1 - 0.24,
        (hz0 + hz1) / 2,
        house.top - 0.1,
        house.ridge + 0.1,
        L.wall === 'stone' ? vary(L.wallColor, rnd) : palette.brick,
      ),
    );
  // The yard: packed earth along the front, bigger at level 3.
  const [yx0, yx1] = xr(0.1 + hw + 0.1, w - 0.1);
  // P2-E2: worn earth, not a rectangle: a soft, uneven patch by the door and a little more at the gate.
  const yl = Math.min(yx0, yx1);
  const yr = Math.max(yx0, yx1);
  earthPatch(
    lot,
    (yl + yr) / 2,
    (lot.yardZ + d - 0.1) / 2 + 0.02,
    (yr - yl) / 2,
    (d - 0.1 - lot.yardZ) / 2 + 0.04,
    YARD,
  );
  earthPatch(lot, doorU, d - 0.17, 0.22, 0.11, YARD, { nearOnly: true });
  s.detail(() => {
    windowRow(
      s,
      hFront,
      hx0,
      hx1,
      0.46,
      windowsOf(L),
      rnd,
      anchors.lights!,
      [hdoor],
      0.55,
      [0.18, 0.2],
      clad,
    );
    for (let i = 0; i < 2; i++) hen(s, m(1.5 + rnd() * 1.3), d - 0.35 - rnd() * 0.15, rnd() * 6.28, rnd);
    steppingStones(s, hdoor, hz1 + 0.1, d - 0.08, rnd);
    // P2-E2: a small window on the gable end that is free (the other stands near the lot's edge,
    // where a neighbor's wall hides it), as the grown cottage does.
    const gable: Face = left ? { dir: 'x+', plane: hx1 } : { dir: 'x-', plane: hx0 };
    windowPart(
      s,
      gable,
      (hz0 + hz1) / 2,
      0.46,
      0.18,
      0.2,
      { ...windowsOf(L), box: false },
      rnd,
      anchors.lights,
      clad,
    );
  });
  // The front fence along the lot, a gate at the yard and another at the house door; level 3 fences
  // in the district's own edge and runs it up the free side.
  const gates = [Math.min(hdoor, doorU), Math.max(hdoor, doorU)];
  let fx = 0.06;
  const edge = lvl === 3 ? L.garden : null;
  for (const g of gates) {
    postAndRail(s, [fx, d - 0.06], [g - 0.2, d - 0.06], rnd);
    fx = g + 0.2;
  }
  // The long run past the last gate is the district's own edge at level 3.
  if (edge) gardenEdge(s, edge, [fx, d - 0.06], [w - 0.06, d - 0.06], rnd);
  else postAndRail(s, [fx, d - 0.06], [w - 0.06, d - 0.06], rnd);
  if (lvl >= 2) {
    // The sign on two posts by the gate, facing the road, and the good out front.
    const u = doorU + (left ? 0.62 : -0.62);
    const f: Face = { dir: 'z+', plane: d - 0.14 };
    s.nearOnly(() => {
      for (const dx of [-0.2, 0.2])
        beam(s, [u + dx, 0, d - 0.12], [u + dx, 0.5, d - 0.12], 0.016, palette.timber);
    });
    paintedSign(s, f, u, 0.4, 0.34, 0, paint, anchors);
    goodsOutFront(s, lot.make, m(2.45), d - 0.32, rnd, lvl === 3 ? 3 : 2);
  }
  return lot;
}

/**
 * P2-E2: a patch of bare ground in the game's earth colors and dirt surface: a ring of nine to
 * eleven points round (`cx`, `cz`) with radii of a little under to a little over `rx` and `rz`, so
 * it is soft and a little irregular, never a rectangle. A farm lot has no floor of its own: its
 * grass is the valley's meadow, and only worked ground (a yard, a trodden spot, a ring of mulch,
 * the beds) is drawn. Kept inside the lot. Far off it stays (it colors the ground) unless `near`.
 */
function earthPatch(
  lot: Lot,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  hex: number,
  opts: { surface?: number; y?: number; nearOnly?: boolean; points?: number } = {},
): void {
  const { s, rnd } = lot;
  const y = opts.y ?? 0.006;
  const n = opts.points ?? 9 + Math.floor(rnd() * 3);
  const phase = rnd() * 6.28;
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const j = 0.82 + rnd() * 0.3;
    const x = clamp(cx + Math.sin(a) * rx * j, 0.06, lot.w - 0.06);
    const z = clamp(cz - Math.cos(a) * rz * j, 0.06, lot.d - 0.06);
    pts.push([x, y, z]);
  }
  const colors = pts.map(() => vary(hex, rnd, 0.4));
  const was = s.currentSurface;
  const draw = (): void => {
    s.surface(opts.surface ?? SURFACE.dirt);
    const c: V3 = [cx, y, cz];
    for (let i = 0; i < n; i++) s.tri(c, pts[i]!, pts[(i + 1) % n]!, colors[i]!, [0, 1, 0]);
  };
  if (opts.nearOnly) s.nearOnly(draw);
  else s.essential(draw);
  s.surface(was);
}

// --- Grain farm ----------------------------------------------------------------------------------

/** A round hayrick under a thatched cap. */
function hayrick(s: ShapeBuilder, x: number, z: number, k: number, rnd: () => number): void {
  const body = vary(0xd9b050, rnd, 0.5);
  const cap = vary(0xb8862e, rnd, 0.4);
  s.levels(
    () => {
      s.cylinder(x, z, 0.27 * k, 0.28 * k, 0.04, 0.38 * k, body, 6);
      s.cylinder(x, z, 0.36 * k, 0.0, 0.38 * k, 0.72 * k, cap, 6);
    },
    () => s.cylinder(x, z, 0.3 * k, 0.0, 0.04, 0.72 * k, body, 6),
  );
}

function grainFarm(opts: KitBuildOptions | undefined): Built {
  const lot = lotOf(opts, 61, 0x8f3a30);
  const { s, anchors, L, rnd, look, lvl, season, m } = lot;
  // The barn: weatherboard in barn red (or the district's stone), a gambrel roof; it widens by level.
  const stoneBarn = L.wall === 'stone' || L.wall === 'brick';
  const bw = lvl === 1 ? 1.1 : lvl === 2 ? 1.28 : 1.42;
  const [bx0, bx1] = lot.xr(2.88 - bw, 2.88);
  const barn = shell(s, {
    lot: [lot.w, lot.d],
    x0: bx0,
    z0: 0.14,
    x1: bx1,
    z1: 1.14,
    base: 0.06,
    wallH: 0.66,
    wall: stoneBarn ? L.wall : 'weatherboard',
    wallColor: stoneBarn ? L.wallColor : vary(look() < 0.7 ? 0xa8473b : 0x8a6f58, rnd, 0.4),
    trim: stoneBarn ? L.trim : palette.white,
    roof: {
      shape: 'gambrel',
      material: L.roofMaterial === 'thatch' ? 'thatch' : 'shingle',
      color: L.roofMaterial === 'thatch' ? L.roofColor : vary(0x6b625c, rnd, 0.5),
      rise: 0.78,
      overhang: 0.12,
      ridgeAlongX: false,
    },
    rnd,
  });
  doorPart(
    s,
    { dir: 'z+', plane: 1.14 },
    (bx0 + bx1) / 2,
    0.56,
    0.52,
    vary(0x8f3a30, rnd, 0.5),
    palette.white,
    'double',
    0.02,
  );
  s.detail(() => {
    s.box((bx0 + bx1) / 2 - 0.1, barn.top + 0.1, 1.14, (bx0 + bx1) / 2 + 0.1, barn.top + 0.3, 1.16, 0x4a3a2c);
  });
  // The standing grain, in rows by season: green shoots, gold ears, stubble, frozen earth.
  const gz0 = lvl === 1 ? 1.62 : lvl === 2 ? 1.42 : 1.26;
  const [gx0, gx1] = lot.xr(1.42, 2.86);
  const x0 = Math.min(gx0, gx1);
  const x1 = Math.max(gx0, gx1);
  const gz1 = lot.yardZ - 0.1;
  const soilHex = vary(season === 3 ? 0x8a7a66 : 0x6e5036, rnd, 0.4);
  // The field's soil: an uneven patch of tilled earth, the crop rows on it (no floor under the lot).
  earthPatch(lot, (x0 + x1) / 2, (gz0 + gz1) / 2, ((x1 - x0) / 2) * 1.25, ((gz1 - gz0) / 2) * 1.25, soilHex, {
    surface: SURFACE.field,
    y: 0.01,
    nearOnly: true,
  });
  const rows = Math.max(3, Math.round((gz1 - gz0) / 0.13));
  const hts = [0.07, 0.22, 0.035, 0.015];
  const cols = [0x8bbf4e, GOOD_COLORS.wheat, 0xc9ad62, 0xd8d2c0];
  s.levels(
    () => {
      for (let r = 0; r < rows; r++) {
        const z = gz0 + ((gz1 - gz0) * (r + 0.5)) / rows;
        s.box(
          x0 + 0.04,
          0.012,
          z - 0.035,
          x1 - 0.04,
          0.012 + hts[season]!,
          z + 0.035,
          vary(cols[season]!, rnd, 0.5),
        );
      }
    },
    () => s.box(x0 + 0.04, 0.012, gz0, x1 - 0.04, 0.012 + hts[season]!, gz1, cols[season]!),
  );
  // The rick (and at level 3 a second one) behind the house, stooks in the stubble in autumn.
  hayrick(s, m(0.62), 0.58, 1, rnd);
  if (lvl === 3) hayrick(s, m(1.18), 0.5, 0.82, rnd);
  if (lvl >= 2 && season === 2)
    for (let i = 0; i < 4; i++) {
      const sx = x0 + 0.2 + ((x1 - x0 - 0.4) * i) / 3;
      const sz = gz0 + 0.12 + (i % 2) * 0.22;
      s.cylinder(sx, sz, 0.09, 0, 0.012, 0.24, vary(0xd9b050, rnd, 0.5), 6);
    }
  if (lvl === 3) {
    // The granary on staddle stones.
    const [qx0, qx1] = lot.xr(0.2, 0.86);
    for (const sx of [qx0 + 0.06, qx1 - 0.06])
      for (const sz of [1.0, 1.36]) s.cylinder(sx, sz, 0.045, 0.03, 0, 0.14, palette.stone, 6);
    s.nearOnly(() => s.box(qx0, 0.14, 0.94, qx1, 0.18, 1.42, palette.wood));
    s.box(qx0 + 0.02, 0.14, 0.96, qx1 - 0.02, 0.5, 1.4, vary(0xb08a5e, rnd, 0.4));
    const roof = vary(0x6b625c, rnd, 0.4);
    s.levels(
      () => s.gable(qx0 - 0.04, 0.9, qx1 + 0.04, 1.46, 0.5, 0.7, roof, false),
      () => s.cylinder((qx0 + qx1) / 2, 1.18, 0.42, 0, 0.5, 0.72, roof, 4, Math.PI / 4),
    );
  }
  s.detail(() => {
    hayBale(s, m(1.32), 0, 1.3, true, rnd);
    if (lvl >= 2) hayBale(s, m(1.32), 0.14, 1.3, true, rnd);
    pileOf(s, 'wheat', Math.max(1, lvl), m(1.0), 0, 1.5, rnd);
  });
  return { s, anchors };
}

// --- Market garden -------------------------------------------------------------------------------

function marketGarden(opts: KitBuildOptions | undefined): Built {
  const lot = lotOf(opts, 62, 0x5f9a3e);
  const { s, anchors, rnd, lvl, season, m } = lot;
  const nRows = lvl === 1 ? 3 : lvl === 2 ? 5 : 7;
  const zs =
    lvl === 1
      ? [0.4, 0.85, 1.3]
      : lvl === 2
        ? [0.3, 0.7, 1.1, 1.5, 1.9]
        : [0.28, 0.6, 0.92, 1.24, 1.56, 1.88, 2.2];
  const hasGlass = lvl === 3;
  const crop = [0x8bbf4e, 0x6a9a3e, 0x9c3a4f, 0xb4d46a];
  const soil = season === 3 ? 0x7a6652 : 0x4a3222;
  const rowsNear = (): void => {
    for (let r = 0; r < nRows; r++) {
      const z = zs[r]!;
      // The back-left corner is the glasshouse at level 3, and the house sits front-left.
      const rowStart = hasGlass && z < 0.95 ? 1.2 : z > 1.62 ? 1.4 : 0.16;
      const [a, b] = lot.xr(rowStart, 2.38);
      const x0 = Math.min(a, b);
      const x1 = Math.max(a, b);
      s.surface(SURFACE.field);
      s.rbox(x0, 0, z - 0.12, x1, 0.05, z + 0.12, vary(soil, rnd, 0.4), 0.05);
      s.surface(SURFACE.plain);
      const half = season === 2 ? (r % 2 === 0 ? 0.5 : 1) : 1;
      const xe = x0 + (x1 - x0) * half;
      if (season === 0) {
        // Seedlings: pale dashes along the bed.
        s.box(x0 + 0.05, 0.05, z - 0.02, xe - 0.05, 0.075, z + 0.02, 0xb4d46a);
      } else if (season === 1 || season === 2) {
        s.box(
          x0 + 0.04,
          0.05,
          z - 0.07,
          xe - 0.04,
          0.05 + (season === 1 ? 0.1 : 0.07),
          z + 0.07,
          vary(crop[r % 4]!, rnd, 0.4),
        );
        if (season === 2) {
          // Pumpkins where the beds have been lifted.
          for (let i = 0; i < 2; i++)
            if (xe < x1) s.blob(xe + 0.2 + i * 0.28, 0.1, z, 0.1, 0.08, 0.09, vary(0xe08a2e, rnd, 0.5), 0);
        }
      } else {
        // Winter: straw mulch over bare beds.
        s.box(x0 + 0.1, 0.05, z - 0.05, x1 - 0.1, 0.062, z + 0.05, vary(0xd9c27a, rnd, 0.5));
      }
    }
  };
  const rowsFar = (): void => {
    const rowX = (z: number): [number, number] => {
      const [a, b] = lot.xr(hasGlass && z < 0.95 ? 1.2 : z > 1.62 ? 1.4 : 0.16, 2.38);
      return [Math.min(a, b), Math.max(a, b)];
    };
    const [sx0, sx1] = lot.xr(0.16, 2.38);
    s.surface(SURFACE.field);
    s.rbox(Math.min(sx0, sx1), 0, zs[0]! - 0.12, Math.max(sx0, sx1), 0.05, zs[nRows - 1]! + 0.12, soil, 0.08);
    s.surface(SURFACE.plain);
    for (let r = 0; r < nRows; r += 2) {
      const [x0, x1] = rowX(zs[r]!);
      const c = season === 3 ? 0xd9c27a : season === 0 ? 0xb4d46a : crop[r % 4]!;
      s.box(x0 + 0.04, 0.05, zs[r]! - 0.1, x1 - 0.04, season === 3 ? 0.062 : 0.14, zs[r]! + 0.1, c);
    }
  };
  s.levels(rowsNear, rowsFar);
  // Potting shed (a little one from level 1) at the back right.
  shed(lot, 2.45, 0.14, 2.88, 0.62, { wallH: 0.38, rise: 0.22 });
  if (lvl >= 2)
    // Cold frames: low boxes under a slanted pane.
    for (const z of [0.95, 1.4]) {
      const [a, b] = lot.xr(2.46, 2.86);
      s.box(a, 0, z, b, 0.1, z + 0.36, vary(0xa8794a, rnd, 0.4));
      s.quad(
        [a, 0.1, z + 0.36],
        [b, 0.1, z + 0.36],
        [b, 0.2, z + 0.04],
        [a, 0.2, z + 0.04],
        0xcfe6e4,
        [0, 0.7, 0.7],
      );
    }
  if (hasGlass) {
    // A little glasshouse: a pale frame, glass walls and a glass roof.
    const [a, b] = lot.xr(0.18, 1.04);
    s.box(a, 0, 0.14, b, 0.04, 0.84, palette.white);
    s.box(a, 0.04, 0.14, b, 0.36, 0.84, 0xcfe6e4);
    s.gable(a - 0.02, 0.12, b + 0.02, 0.86, 0.36, 0.56, 0xdcefee, false);
    for (const x of [a, b - 0.02]) s.box(x, 0.04, 0.14, x + 0.02, 0.38, 0.16, palette.white);
  }
  s.detail(() => {
    scarecrow(s, m(2.1), lvl >= 2 ? 1.72 : 1.5, vary(palette.navy, rnd, 0.5));
    wateringCan(s, m(1.5), 0, lot.yardZ - 0.1);
    for (const z of [0.4, 0.85, 1.3])
      s.box(m(0.1) - 0.01, 0.05, z - 0.03, m(0.1) + 0.01, 0.2, z + 0.03, palette.timber);
  });
  return { s, anchors };
}

// --- Orchard -------------------------------------------------------------------------------------

/**
 * One orchard tree for the lot: the valley's painted orchard tree (`orchardTree`), with a small ring
 * of bare mulch round its trunk, the only ground the orchard draws. Level 3 packs nine trees in, so
 * its back rows use a lighter crown (`light`).
 */
function fruitTree(lot: Lot, x: number, z: number, k: number, light: boolean, dabs?: number): void {
  const { s, rnd, season } = lot;
  earthPatch(lot, x, z, 0.17 * k, 0.17 * k, mixHex(palette.soil, 0x8a7a50, 0.5), {
    y: 0.005,
    nearOnly: true,
    points: 7,
  });
  orchardTree(s, x, z, k, season, rnd, light, dabs);
}

function orchard(opts: KitBuildOptions | undefined): Built {
  const lot = lotOf(opts, 63, 0xa8473b);
  const { s, anchors, rnd, lvl, m } = lot;
  const trees: [number, number][] =
    lvl === 1
      ? [
          [1.9, 0.65],
          [2.6, 0.65],
          [1.9, 1.5],
          [2.6, 1.5],
        ]
      : lvl === 2
        ? [
            [1.9, 0.65],
            [2.6, 0.65],
            [1.9, 1.5],
            [2.6, 1.5],
            [1.9, 2.2],
            [2.6, 2.2],
          ]
        : [
            [1.9, 0.65],
            [2.6, 0.65],
            [1.9, 1.5],
            [2.6, 1.5],
            [1.9, 2.2],
            [2.6, 2.2],
            [0.5, 1.22],
            [1.2, 1.22],
            [1.3, 0.55],
          ];
  const k = lvl === 3 ? 0.8 : 0.9;
  trees.forEach(([x, z], i) =>
    fruitTree(lot, m(x), z, k, lvl === 3 && i >= 2, lvl === 1 ? 110 : lvl === 2 ? 88 : undefined),
  );
  // The packing shed at the back left, the crates of the harvest, ladders in the trees.
  const sx1 = lvl === 3 ? 0.88 : lvl === 2 ? 1.05 : 1.0;
  shed(lot, 0.16, 0.14, sx1, lvl === 1 ? 0.7 : 0.78, { wallH: 0.45, wall: 0xa8473b, rise: 0.3 });
  s.detail(() => {
    for (let i = 0; i < lvl + 1; i++)
      crateOf(s, 'apples', m(0.3 + i * 0.22), 0, lvl === 1 ? 0.84 : 0.92, rnd);
    ladder(s, [m(1.95), 0.05, 0.65 - 0.05], [m(1.95), 0.7, 0.65 - 0.2], [0.03, 0, 0]);
    if (lvl >= 2) ladder(s, [m(2.65), 0.05, 1.45], [m(2.65), 0.7, 1.3], [0.03, 0, 0]);
  });
  return { s, anchors };
}

// --- Dairy ---------------------------------------------------------------------------------------

function dairy(opts: KitBuildOptions | undefined): Built {
  const lot = lotOf(opts, 64, 0x2f4a6a);
  const { s, anchors, L, rnd, lvl, m, d } = lot;
  // The long low byre along the back, longer by level.
  const stone = L.wall === 'stone' || L.wall === 'brick';
  const bx0w = lvl === 1 ? 1.1 : lvl === 2 ? 0.6 : 0.2;
  const [bx0, bx1] = lot.xr(bx0w, 2.84);
  const z1 = 1.0;
  const byre = shell(s, {
    lot: [lot.w, lot.d],
    x0: bx0,
    z0: 0.14,
    x1: bx1,
    z1,
    base: 0.06,
    wallH: 0.6,
    wall: 'plaster',
    wallColor: vary(stone ? mixHex(0xf3ecdc, L.wallColor, 0.35) : 0xf3ecdc, rnd, 0.4),
    trim: palette.timber,
    roof: {
      shape: 'gable',
      material: L.roofMaterial === 'thatch' ? 'thatch' : 'slate',
      color: L.roofMaterial === 'thatch' ? L.roofColor : vary(0x6b625c, rnd, 0.5),
      rise: 0.5,
      overhang: 0.14,
      ridgeAlongX: true,
    },
    rnd,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doors = Math.max(2, Math.floor(Math.abs(bx1 - bx0) / 0.7));
  for (let i = 0; i < doors; i++) {
    const u = Math.min(bx0, bx1) + (Math.abs(bx1 - bx0) * (i + 0.5)) / doors;
    doorPart(s, front, u, 0.24, 0.46, 0x2f4a6a, palette.white, 'dutch', 0.015);
    faceBox(s, front, u - 0.1, 0.28, 0.04, u + 0.1, 0.44, 0.046, 0x3b3229);
  }
  s.detail(() => {
    const vx = (bx0 + bx1) / 2;
    s.gable(
      vx - 0.16,
      0.45,
      vx + 0.16,
      0.7,
      byre.ridge + 0.0,
      byre.ridge + 0.2,
      vary(byre.roof.color, rnd, 0.3),
      true,
    );
  });
  // The paddock: cows between the byre and the yard; it widens by level.
  const p0 = lvl === 1 ? 1.95 : lvl === 2 ? 1.6 : 1.38;
  const [pa, pb] = lot.xr(p0, 2.86);
  const pz1 = lot.yardZ - 0.08;
  const gateU = m(p0 + (2.86 - p0) * 0.6);
  paddock(s, Math.min(pa, pb), 1.18, Math.max(pa, pb), pz1, gateU, rnd);
  // Trodden earth where the cows crowd: at the trough and inside the gate.
  earthPatch(lot, m(2.5), 1.5, 0.36, 0.22, 0x8a6e4a, { nearOnly: true });
  earthPatch(lot, gateU, pz1 - 0.1, 0.3, 0.14, 0x8a6e4a, { nearOnly: true });
  const [aa, ab] = lot.xr(p0 + 0.16, 2.7);
  anchors.animals = [
    { kind: 'cow', pen: [Math.min(aa, ab), 1.35, Math.max(aa, ab), pz1 - 0.25], count: lvl + 1 },
  ];
  if (lvl === 3) shed(lot, 0.16, 1.1, 0.9, 1.6, { wallH: 0.4, wall: 0xf3ecdc, roof: 0x8a5a44, rise: 0.28 });
  s.detail(() => {
    trough(s, m(2.5), 1.45, true, true);
    // The churn stand by the gate, cheese on the stand at level 2 and up.
    const cx = m(1.2);
    s.box(cx - 0.24, 0.24, d - 0.62 - 0.15, cx + 0.24, 0.27, d - 0.62 + 0.15, vary(palette.wood, rnd, 0.5));
    for (const dx of [-0.2, 0.2])
      for (const dz of [-0.11, 0.11])
        beam(s, [cx + dx, 0, d - 0.62 + dz], [cx + dx, 0.24, d - 0.62 + dz], 0.016, palette.timber);
    for (let i = 0; i < (lvl === 3 ? 3 : 2); i++) {
      const px = cx - 0.1 + i * 0.15;
      s.cylinder(px, d - 0.62, 0.045, 0.045, 0.27, 0.4, 0xb9bdc0, 8);
      s.cylinder(px, d - 0.62, 0.045, 0.024, 0.4, 0.43, 0xb9bdc0, 8);
    }
    if (lvl >= 2) {
      cheeseWheel(s, m(2.45) - 0.1, 0.19, d - 0.32, 0.075, rnd);
      if (lvl === 3) cheeseWheel(s, m(2.45) + 0.1, 0.19, d - 0.32, 0.075, rnd);
    }
    if (lvl < 3) hayBale(s, m(0.4), 0, 1.3, true, rnd);
  });
  return { s, anchors };
}

// --- Sheep run -----------------------------------------------------------------------------------

function sheepRun(opts: KitBuildOptions | undefined): Built {
  const lot = lotOf(opts, 65, 0x6e8a5a);
  const { s, anchors, L, rnd, lvl, m } = lot;
  const f0 = lvl === 1 ? 1.9 : lvl === 2 ? 1.65 : 1.4;
  const pz1 = lot.yardZ - 0.08;
  // The fold: dry stone in Hill Stone, post and rail elsewhere; a gate gap in the front.
  const [fa, fb] = lot.xr(f0, 2.88);
  const x0 = Math.min(fa, fb);
  const x1 = Math.max(fa, fb);
  const stone = L.wall === 'stone';
  // Dry stone is a few long blocks with coping stones on top (a full stone-by-stone wall would
  // eat the budget of a fold this long).
  const wall = (a: [number, number], b: [number, number]): void => {
    if (!stone) return postAndRail(s, a, b, rnd);
    const [xa, xb] = [Math.min(a[0], b[0]) - 0.04, Math.max(a[0], b[0]) + 0.04];
    const [za, zb] = [Math.min(a[1], b[1]) - 0.04, Math.max(a[1], b[1]) + 0.04];
    s.box(xa, 0, za, xb, 0.13, zb, vary(palette.stone, rnd, 0.6));
    s.nearOnly(() => {
      const along = xb - xa > zb - za;
      const n = Math.max(1, Math.round((along ? xb - xa : zb - za) / 0.3));
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n;
        const cx = along ? xa + (xb - xa) * k : (xa + xb) / 2;
        const cz = along ? (za + zb) / 2 : za + (zb - za) * k;
        s.box(cx - 0.1, 0.13, cz - 0.06, cx + 0.1, 0.17, cz + 0.06, vary(palette.stone, rnd, 1.1));
      }
    });
  };
  const gx = (x0 + x1) / 2;
  // Trodden earth in the fold: at the trough and inside the gate gap.
  earthPatch(lot, gx, 1.02, 0.36, 0.2, 0x8a6e4a, { nearOnly: true });
  earthPatch(lot, gx, pz1 - 0.1, 0.3, 0.14, 0x8a6e4a, { nearOnly: true });
  s.levels(
    () => {
      wall([x0, 0.12], [x1, 0.12]);
      wall([x0, 0.12], [x0, pz1]);
      wall([x1, 0.12], [x1, pz1]);
      wall([x0, pz1], [gx - 0.22, pz1]);
      wall([gx + 0.22, pz1], [x1, pz1]);
      // Hurdles inside: a lambing pen in the back corner.
      postAndRail(s, [x1 - 0.5, 0.12], [x1 - 0.5, 0.55], rnd);
      postAndRail(s, [x1 - 0.5, 0.55], [x1, 0.55], rnd);
    },
    () => {
      // Far off the fold is a low rim all round, with the gate gap.
      const rim = stone ? palette.stone : 0x9a7a52;
      s.box(x0, 0, 0.1, x1, 0.1, 0.16, rim);
      s.box(x0, 0, 0.1, x0 + 0.06, 0.1, pz1, rim);
      s.box(x1 - 0.06, 0, 0.1, x1, 0.1, pz1, rim);
      s.box(x0, 0, pz1 - 0.06, gx - 0.22, 0.1, pz1, rim);
      s.box(gx + 0.22, 0, pz1 - 0.06, x1, 0.1, pz1, rim);
    },
  );
  const [pa, pb] = [x0 + 0.15, x1 - 0.15];
  anchors.animals = [
    { kind: 'sheep', pen: [pa, 0.7, pb, pz1 - 0.2], count: lvl === 1 ? 3 : lvl === 2 ? 5 : 7 },
  ];
  // The shepherd's hut on wheels behind the house.
  s.nearOnly(() => shepherdsHut(s, m(0.66), 0.55, rnd, anchors));
  if (lvl === 3) {
    // The shearing shed: an open lean-to on posts with a boarded floor.
    const [a, b] = lot.xr(0.2, 1.1);
    const sx0 = Math.min(a, b);
    const sx1 = Math.max(a, b);
    s.box(sx0, 0, 0.98, sx1, 0.05, 1.58, vary(palette.wood, rnd, 0.5));
    for (const px of [sx0 + 0.04, sx1 - 0.04])
      for (const pz of [1.02, 1.54])
        s.box(px - 0.02, 0.05, pz - 0.02, px + 0.02, 0.5, pz + 0.02, palette.timber);
    roofPart(s, {
      shape: 'lean',
      material: 'shingle',
      x0: sx0 - 0.06,
      z0: 0.94,
      x1: sx1 + 0.06,
      z1: 1.62,
      y0: 0.48,
      y1: 0.62,
      color: vary(0x6b625c, rnd, 0.5),
      trim: palette.timber,
      ridgeAlongX: true,
      rnd,
    });
  }
  s.detail(() => {
    hayBale(s, m(1.25), 0, 0.5, false, rnd);
    trough(s, (x0 + x1) / 2, 1.0, true, false);
    pileOf(s, 'wool', Math.max(1, lvl), m(1.3), 0, 1.35, rnd);
  });
  return { s, anchors };
}

// --- Hives ---------------------------------------------------------------------------------------

function hiveBox(s: ShapeBuilder, x: number, z: number, hex: number, rnd: () => number): void {
  s.levels(
    () => {
      s.box(x - 0.1, 0, z - 0.1, x + 0.1, 0.1, z + 0.1, palette.darkWood);
      s.rbox(x - 0.12, 0.1, z - 0.12, x + 0.12, 0.3, z + 0.12, vary(hex, rnd, 0.2), 0.008);
      s.gable(x - 0.14, z - 0.14, x + 0.14, z + 0.14, 0.3, 0.37, 0x8a9aa0, true);
    },
    () => s.box(x - 0.12, 0, z - 0.12, x + 0.12, 0.36, z + 0.12, hex),
  );
}

function hives(opts: KitBuildOptions | undefined): Built {
  const lot = lotOf(opts, 66, 0xf3d35b);
  const { s, anchors, rnd, lvl, season, m } = lot;
  // Flower strips between the rows: blossom, lavender, asters, bare straw.
  const flower = [0xf4d4e2, 0x9a82c4, 0xe0a83a, 0xc9b88a][season]!;
  const strips: [number, number, number][] = [
    [1.3, 2.88, 1.15],
    [1.3, 2.88, 1.88],
  ];
  if (lvl >= 2) strips.push([1.3, 2.88, 0.45]);
  for (const [a, b, z] of strips) {
    const [x0, x1] = lot.xr(a, b);
    s.box(x0, 0.008, z - 0.07, x1, 0.008 + (season === 3 ? 0.02 : 0.07), z + 0.07, vary(flower, rnd, 0.4));
  }
  // Painted box hives on stands in rows, and straw skeps on a bench.
  const colors = [0xf4ecdd, 0x9cc3dd, 0xf3d35b, 0xb8d8a8, 0xf4ecdd];
  const boxes: [number, number][] =
    lvl === 1
      ? [
          [1.7, 0.8],
          [2.4, 0.8],
        ]
      : lvl === 2
        ? [
            [1.5, 0.8],
            [2.15, 0.8],
            [2.75, 0.8],
          ]
        : [
            [1.5, 0.8],
            [2.15, 0.8],
            [2.75, 0.8],
            [1.8, 1.5],
            [2.5, 1.5],
          ];
  boxes.forEach(([x, z], i) => hiveBox(s, m(x), z, colors[i % colors.length]!, rnd));
  const nSkeps = lvl === 1 ? 1 : lvl === 2 ? 2 : 3;
  const benchX = [0.3, 1.05];
  s.nearOnly(() => s.box(m(benchX[0]!), 0.12, 1.28, m(benchX[1]!), 0.15, 1.52, palette.wood));
  for (let i = 0; i < nSkeps; i++) {
    const x = m(0.5 + i * 0.25);
    s.levels(
      () => skep(s, x, 1.4, rnd),
      () => s.cylinder(x, 1.4, 0.09, 0, 0.0, 0.3, 0xd9b96a, 6),
    );
  }
  // The honey house at the back left: a little thatched or tiled shed that grows.
  const ex = lvl === 1 ? 0.8 : lvl === 2 ? 0.95 : 1.1;
  shed(lot, 0.16, 0.14, ex, lvl === 1 ? 0.62 : 0.74, {
    wallH: 0.42,
    wall: 0xb08a5e,
    roof: 0xb8862e,
    material: 'thatch',
    rise: 0.3,
  });
  s.detail(() => {
    // Lavender tufts in the grass, the keeper's veiled hat on a peg, extra stands.
    for (let i = 0; i < 6 + lvl * 2; i++)
      s.blob(
        m(0.2 + rnd() * 2.6),
        0.06,
        0.9 + rnd() * 1.4,
        0.05,
        0.05,
        0.05,
        vary(GOOD_COLORS.lavender, rnd, 0.5),
        0,
      );
    s.blob(m(0.55), 0.38, 0.77, 0.05, 0.02, 0.05, 0xf4ecdd, 0);
    if (lvl === 3) s.box(m(0.3) - 0.2, 0, 0.8, m(0.3) + 0.2, 0.1, 0.92, palette.wood);
  });
  return { s, anchors };
}

/** Farmstead draws by the look kit id a trade names (content `TradeDef.look`). */
export const FARM_LOOKS: Readonly<Record<string, BusinessDraw>> = {
  apiary: hives,
  dairy,
  farmhouse: grainFarm,
  orchard,
  'sheep-pasture': sheepRun,
  'vegetable-plot': marketGarden,
};
