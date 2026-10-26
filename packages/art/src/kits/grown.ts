// C4E: grown buildings (docs/spec/13-ledger.md, Zoning and growth; 12-hearth.md, District styles).
// Lots grow cottages, Craftsfolk townhouses, shops with flats above, small workshops and
// farmsteads, each in its district's style and fitted to its lot (2x2 to 3x3, entrance toward the
// road). A home keeps its seed when it upgrades in place, so the townhouse wears the cottage's
// walls, roof and paint, just taller and finer. Runtime detail arrives in params like the I1 kits
// ('make' names the good a grown craft or farm is making, 'out:<good>' its output pile).
import { mixHex, seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam, cylX } from '../shapes';
import { cottageChoices, cottageOf, houseKit, shell, signBoard, windowRow, type Built } from './buildings';
import {
  bayWindow,
  flowerBorder,
  gardenEdge,
  hen,
  ivyPart,
  leanToPart,
  postAndRail,
  pump,
  shopfront,
  trough,
  vegRows,
  washingLine,
} from './details';
import { districtLook, VILLAGE_MIX, type DistrictLook } from './district';
import { crateOf, GOOD_COLORS, pileOf } from './goods';
import {
  awningPart,
  chimneyPart,
  claddingDepth,
  doorPart,
  dormerPart,
  faceBox,
  facePoint,
  hangingSign,
  porchPart,
  windowPart,
  type DoorKind,
  type Face,
  type WallMaterial,
  type WindowStyle,
} from './parts';
import { barrel, bench, flowerPot, hayBale, sawhorse, wallLantern, weathervane } from './props';
import { roofColor, FLOWERS } from './style';
import type { Kit, KitBuildOptions } from './types';

// --- Looks --------------------------------------------------------------------------------------

/**
 * The look of a home: its district's when it grew in one, otherwise the cottage's own seeded
 * choices (so a hand-placed cottage still keeps its walls and colors when it becomes a townhouse).
 */
export function homeLook(opts: KitBuildOptions | undefined, salt: number): DistrictLook {
  const d = districtLook(opts, salt);
  if (d) return d;
  const ch = cottageChoices(opts);
  const tone = seeded((opts?.seed ?? 1) * 53 + 7);
  const upper: WallMaterial = ch.wallMat === 'plaster' ? 'plaster' : 'timber';
  return {
    style: VILLAGE_MIX,
    wall: ch.wallMat,
    upper,
    wallColor: ch.wallColor,
    upperColor: ch.c.wall ?? (ch.wallMat === 'stone' ? vary(ch.plaster, tone, 0.5) : ch.wallColor),
    plaster: ch.plaster,
    roofShape: ch.shape,
    roofMaterial: ch.material,
    roofColor: vary(roofColor(ch.c, ch.material), tone, 0.6),
    accent: ch.accent,
    trim: vary(palette.timber, tone, 0.4),
    frame: palette.white,
    windowBoxes: ch.c.windowBoxes ?? true,
    shutters: ch.c.shutters ?? true,
    chimney: ch.c.chimney ?? true,
    ivy: false,
    porch: ch.porch,
    leanTo: false,
    dormer: ch.look() < 0.4,
    bench: true,
    garden: null,
    rnd: seeded((opts?.seed ?? 1) * 7 + salt * 131 + 11),
    look: seeded((opts?.seed ?? 1) * 389 + salt * 17 + 29),
    custom: ch.c,
  };
}

function windowsOf(L: DistrictLook, box = L.windowBoxes): WindowStyle {
  return { frame: L.frame, shutter: L.shutters ? L.accent : null, box, flowers: FLOWERS };
}

function start(): Built {
  return { s: new ShapeBuilder(), anchors: { smoke: [], lights: [] } };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function doorKind(L: DistrictLook, look: () => number): DoorKind {
  const r = look();
  if (L.wall === 'brick') return r < 0.6 ? 'plank' : 'arched';
  if (L.wall === 'stone') return r < 0.5 ? 'arched' : 'dutch';
  return r < 0.5 ? 'arched' : r < 0.8 ? 'dutch' : 'plank';
}

/** Stepping stones from a door out to the lot's front edge. */
function steppingStones(s: ShapeBuilder, u: number, z0: number, z1: number, rnd: () => number): void {
  const n = Math.max(1, Math.floor((z1 - z0) / 0.16));
  for (let i = 0; i < n; i++) {
    const z = z0 + 0.04 + i * 0.16;
    const dx = (rnd() - 0.5) * 0.04;
    s.rbox(u - 0.09 + dx, 0, z, u + 0.09 + dx, 0.018, z + 0.11, vary(palette.stone, rnd, 1.2), 0.01);
  }
}

/** A front garden: an edge along the lot front with a gate at the path, flowers behind it. */
function frontGarden(
  s: ShapeBuilder,
  L: DistrictLook,
  w: number,
  d: number,
  houseZ: number,
  doorU: number,
  x0: number,
  x1: number,
  rnd: () => number,
): void {
  const edge = L.garden;
  const fz = d - 0.07;
  if (edge && fz - houseZ > 0.16) {
    const paint =
      edge === 'picket'
        ? L.style.id === 'plaster'
          ? palette.white
          : vary(L.accent, rnd, 0.3)
        : palette.white;
    gardenEdge(s, edge, [0.07, fz], [w - 0.07, fz], rnd, [doorU, fz], paint);
    // Short returns down the sides when there is room beside the house.
    if (x0 > 0.2) gardenEdge(s, edge, [0.07, fz], [0.07, houseZ - 0.2], rnd, undefined, paint);
    if (w - x1 > 0.2) gardenEdge(s, edge, [w - 0.07, fz], [w - 0.07, houseZ - 0.2], rnd, undefined, paint);
  }
  if (fz - houseZ > 0.22) {
    const bz = fz - 0.1;
    if (doorU - 0.3 > 0.2) flowerBorder(s, [0.18, bz], [doorU - 0.24, bz], rnd);
    if (w - 0.2 > doorU + 0.3) flowerBorder(s, [doorU + 0.24, bz], [w - 0.18, bz], rnd);
  }
}

/** Something in a spare corner of the plot: vegetables, washing, a fruit tree or hens. */
function sideGarden(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  pick: number,
  rnd: () => number,
): void {
  if (x1 - x0 < 0.4 || z1 - z0 < 0.4) return;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  if (pick < 0.3) vegRows(s, x0 + 0.06, z0 + 0.06, x1 - 0.06, z1 - 0.06, rnd, x1 - x0 > z1 - z0);
  else if (pick < 0.55) {
    washingLine(s, [x0 + 0.1, cz], [x1 - 0.1, cz + 0.05], rnd);
    flowerBorder(s, [x0 + 0.08, z1 - 0.1], [x1 - 0.08, z1 - 0.1], rnd);
  } else if (pick < 0.8) {
    // A little apple tree with a bench in its shade.
    s.cylinder(cx, cz, 0.05, 0.035, 0, 0.4, palette.bark, 5);
    const leaf = vary(palette.leaf, rnd, 0.8);
    s.blob(cx, 0.55, cz, 0.3, 0.24, 0.3, leaf, 1, rnd, 0.1, mixHex(leaf, 0xc8e070, 0.15));
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      s.blob(
        cx + Math.cos(a) * 0.24,
        0.48 + rnd() * 0.15,
        cz + Math.sin(a) * 0.24,
        0.025,
        0.025,
        0.025,
        palette.apple,
        0,
      );
    }
    if (z1 - z0 > 0.6) bench(s, cx, z1 - 0.12, true, rnd);
  } else {
    // A hen coop and hens pecking about.
    const hx = x0 + 0.18;
    s.rbox(hx - 0.13, 0.05, z0 + 0.08, hx + 0.13, 0.24, z0 + 0.3, vary(0x9a6b43, rnd, 0.5), 0.01);
    s.gable(hx - 0.16, z0 + 0.05, hx + 0.16, z0 + 0.33, 0.24, 0.36, vary(palette.roofTerracotta, rnd), true);
    for (const dx of [-0.1, 0.1])
      beam(s, [hx + dx, 0, z0 + 0.1], [hx + dx, 0.05, z0 + 0.1], 0.01, palette.timber);
    for (let i = 0; i < 3; i++)
      hen(s, x0 + 0.2 + rnd() * (x1 - x0 - 0.4), z0 + 0.35 + rnd() * (z1 - z0 - 0.45), rnd() * 6.28, rnd);
  }
}

// --- Cottage ------------------------------------------------------------------------------------

/** A cottage grown in a district: the district's walls and roof, its details, a garden on the lot. */
function grownCottage(opts: KitBuildOptions | undefined, L: DistrictLook): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [Math.floor(w / 2), d - 1];
  const plain = opts?.lod === 'low';
  const { rnd, look } = L;
  const { s, anchors } = start();
  const doorU = ex + 0.5;
  const lean = L.leanTo && !plain;
  const bw = clamp(w - 0.44 - (lean && w < 3 ? 0.32 : 0), 1.2, w >= 3 ? 1.85 : 1.56);
  const x0 = clamp(doorU - bw / 2, lean && w < 3 && doorU > w / 2 ? 0.52 : 0.22, w - 0.22 - bw);
  const x1 = x0 + bw;
  const z1 = d >= 3 ? d - 0.95 : d - 0.28;
  const z0 = Math.max(0.28, z1 - (d >= 3 ? 1.6 : 1.42));
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.1,
    wallH: 0.78,
    wall: L.wall,
    wallColor: L.wallColor,
    trim: L.trim,
    roof: {
      shape: L.roofShape,
      material: L.roofMaterial,
      color: L.roofColor,
      rise: L.roofMaterial === 'thatch' ? 0.66 : 0.6,
      overhang: 0.18,
      ridgeAlongX: bw >= z1 - z0,
    },
    rnd,
    plain,
  });
  const clad = claddingDepth(L.wall);
  const front: Face = { dir: 'z+', plane: z1 };
  doorPart(s, front, doorU, 0.28, 0.62, L.accent, L.trim, doorKind(L, look), clad);
  if (!plain) {
    const style = windowsOf(L);
    windowRow(s, front, x0, x1, 0.52, style, rnd, anchors.lights!, [doorU], 0.6, [0.2, 0.22], clad);
    const side = { ...style, box: false };
    windowPart(s, { dir: 'x+', plane: x1 }, (z0 + z1) / 2, 0.52, 0.18, 0.2, side, rnd, anchors.lights, clad);
    windowPart(s, { dir: 'x-', plane: x0 }, (z0 + z1) / 2, 0.52, 0.18, 0.2, side, rnd, anchors.lights, clad);
    windowPart(s, { dir: 'z-', plane: z0 }, (x0 + x1) / 2, 0.52, 0.2, 0.22, side, rnd, anchors.lights, clad);
    if (L.porch)
      porchPart(
        s,
        front,
        doorU,
        0.34,
        0.78,
        0.28,
        vary(L.roofMaterial === 'thatch' ? palette.roofTerracotta : L.roofColor, rnd, 0.5),
        L.trim,
        look() < 0.5,
      );
    if (L.dormer && L.roofShape !== 'hip' && sh.roof.ridgeAlongX && bw > 1.4) {
      const du = doorU < (x0 + x1) / 2 ? x1 - 0.42 : x0 + 0.42;
      dormerPart(
        s,
        { dir: 'z+', plane: z1 - 0.1 },
        du,
        sh.top + 0.02,
        0.28,
        L.wallColor,
        L.roofColor,
        L.trim,
        rnd,
        anchors.lights,
      );
    }
    if (L.ivy) {
      const left = look() < 0.5;
      const u = left ? x0 : x1;
      ivyPart(s, front, left ? u - 0.02 : u - 0.3, left ? u + 0.3 : u + 0.02, 0.85, rnd);
    }
    if (lean) {
      const right = x0 < 0.4;
      if (right && w - x1 > 0.3)
        leanToPart(
          s,
          { dir: 'x+', plane: x1 },
          z0 + 0.15,
          z1 - 0.2,
          Math.min(0.32, w - x1 - 0.04),
          0.62,
          0.38,
          vary(0x9a6b43, rnd, 0.4),
          vary(L.roofColor, rnd, 0.4),
          L.roofMaterial === 'thatch' ? 'shingle' : L.roofMaterial,
          L.trim,
          rnd,
        );
      else if (!right && x0 > 0.3)
        leanToPart(
          s,
          { dir: 'x-', plane: x0 },
          z0 + 0.15,
          z1 - 0.2,
          Math.min(0.32, x0 - 0.04),
          0.62,
          0.38,
          vary(0x9a6b43, rnd, 0.4),
          vary(L.roofColor, rnd, 0.4),
          L.roofMaterial === 'thatch' ? 'shingle' : L.roofMaterial,
          L.trim,
          rnd,
        );
    }
    // Doorstep life and the garden.
    flowerPot(s, doorU + 0.26, 0, z1 + 0.1, rnd);
    if (L.bench) bench(s, doorU - 0.42 > x0 + 0.1 ? doorU - 0.45 : doorU + 0.45, z1 + 0.13, true, rnd);
    else barrel(s, x1 + 0.08 < w - 0.05 ? x1 + 0.08 : x1 - 0.12, 0, z1 + 0.12, rnd, 0.9);
    steppingStones(s, doorU, z1 + 0.16, d - 0.1, rnd);
    frontGarden(s, L, w, d, z1, doorU, x0, x1, rnd);
    if (w - x1 > 0.6) sideGarden(s, x1 + 0.08, z0, w - 0.08, d - 0.25, look(), rnd);
    else if (x0 > 0.6) sideGarden(s, 0.08, z0, x0 - 0.08, d - 0.25, look(), rnd);
    if (look() < 0.25)
      anchors.lights!.push(wallLantern(s, facePoint(front, doorU - 0.24, 0.62, clad), [0, 0, 1]));
  }
  if (L.chimney) {
    const cx = look() < 0.5 ? x1 - 0.3 : x0 + 0.3;
    anchors.smoke!.push(
      chimneyPart(
        s,
        cx,
        (z0 + z1) / 2 - 0.18,
        sh.top - 0.1,
        sh.ridge + 0.12,
        L.wall === 'stone' ? vary(L.wallColor, rnd) : palette.brick,
      ),
    );
  }
  if (L.custom.sign) signBoard(s, front, doorU, 0.86, 0.46, clad, anchors);
  return { s, anchors };
}

/** The cottage kit: a district cottage when it grew in one, the hamlet cottage otherwise. */
export const cottage: Kit = houseKit('cottage', (opts) => {
  const L = districtLook(opts, 1);
  return L ? grownCottage(opts, L) : cottageOf(opts);
});

// --- Townhouse (Craftsfolk) ---------------------------------------------------------------------

function townhouseOf(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [Math.floor(w / 2), d - 1];
  const plain = opts?.lod === 'low';
  const L = homeLook(opts, 31);
  const { rnd, look } = L;
  const { s, anchors } = start();
  const doorU = ex + 0.5;
  const bw = clamp(w - 0.36, 1.4, 2.3);
  const x0 = clamp(doorU - bw / 2, 0.18, w - 0.18 - bw);
  const x1 = x0 + bw;
  const z1 = d >= 3 ? d - 0.72 : d - 0.26;
  const z0 = Math.max(0.2, z1 - (d >= 3 ? 1.95 : 1.5));
  const deep = z1 - z0;
  // Narrow houses turn a gable to the street; wider ones run their ridge along it with dormers.
  const gableFront = bw <= deep + 0.1 ? look() < 0.75 : look() < 0.25;
  const timberUpper = L.upper === 'timber';
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.12,
    wallH: 1.46,
    wall: L.wall,
    wallColor: L.wallColor,
    trim: L.trim,
    upper: { at: 0.72, wall: L.upper, color: L.upperColor, jetty: timberUpper ? 0.08 : 0.025 },
    roof: {
      shape: L.roofShape === 'hip' && gableFront ? 'halfHip' : L.roofShape,
      material: L.roofMaterial,
      color: L.roofColor,
      rise: gableFront ? 0.9 : 0.72,
      overhang: 0.16,
      ridgeAlongX: !gableFront,
    },
    rnd,
    plain,
  });
  const [ox0, oz0, ox1, oz1] = sh.outer;
  const clad = claddingDepth(L.wall);
  const front: Face = { dir: 'z+', plane: z1 };
  const upFront: Face = { dir: 'z+', plane: oz1 };
  // A front door with a fanlight under a bracketed hood, up two steps.
  doorPart(s, front, doorU, 0.26, 0.56, L.accent, L.trim, L.wall === 'brick' ? 'plank' : 'dutch', clad);
  s.rbox(doorU - 0.2, 0, z1 + clad, doorU + 0.2, 0.06, z1 + clad + 0.22, vary(palette.stone, rnd, 0.6), 0.01);
  if (!plain) {
    windowPart(
      s,
      front,
      doorU,
      0.64,
      0.2,
      0.06,
      { frame: L.frame, shutter: null, box: false, flowers: [], arch: true },
      rnd,
      anchors.lights,
      clad,
    );
    porchPart(s, front, doorU, 0.3, 0.8, 0.22, vary(L.roofColor, rnd, 0.4), L.trim, false);
    const style = windowsOf(L);
    // Ground floor: a bay window on the wider side of the door, sash windows elsewhere.
    const leftRoom = doorU - x0;
    const rightRoom = x1 - doorU;
    const bayU = leftRoom > rightRoom ? (x0 + doorU - 0.18) / 2 : (doorU + 0.18 + x1) / 2;
    const bayW = Math.min(0.62, Math.max(leftRoom, rightRoom) - 0.34);
    if (bayW > 0.36 && look() < 0.75) {
      bayWindow(
        s,
        front,
        bayU,
        0.18,
        bayW,
        0.42,
        0.14,
        L.frame,
        vary(L.roofColor, rnd, 0.3),
        rnd,
        anchors.lights!,
        clad,
        L.windowBoxes,
      );
      const other = leftRoom > rightRoom ? (doorU + 0.18 + x1) / 2 : (x0 + doorU - 0.18) / 2;
      if (Math.min(leftRoom, rightRoom) > 0.4)
        windowPart(s, front, other, 0.42, 0.18, 0.28, style, rnd, anchors.lights, clad);
    } else windowRow(s, front, x0, x1, 0.42, style, rnd, anchors.lights!, [doorU], 0.55, [0.2, 0.28], clad);
    // Upper floor: taller windows with boxes; an oriel sometimes on timber fronts.
    windowRow(
      s,
      upFront,
      ox0,
      ox1,
      1.12,
      { ...style, box: true },
      rnd,
      anchors.lights!,
      [],
      0.52,
      [0.2, 0.3],
      0.012,
    );
    const side = { ...style, box: false };
    for (const f of [
      { dir: 'x+', plane: ox1 },
      { dir: 'x-', plane: ox0 },
    ] as Face[]) {
      windowRow(s, f, oz0, oz1, 1.12, side, rnd, anchors.lights!, [], 0.85, [0.18, 0.26], 0.012);
      windowRow(
        s,
        { dir: f.dir, plane: f.dir === 'x+' ? x1 : x0 },
        z0,
        z1,
        0.42,
        side,
        rnd,
        anchors.lights!,
        [],
        1.0,
        [0.18, 0.24],
        clad,
      );
    }
    windowRow(
      s,
      { dir: 'z-', plane: oz0 },
      ox0,
      ox1,
      1.12,
      side,
      rnd,
      anchors.lights!,
      [],
      0.7,
      [0.2, 0.26],
      0.012,
    );
    if (gableFront) {
      // An attic window high in the gable, and decorative bargeboards on timber fronts.
      windowPart(
        s,
        upFront,
        (ox0 + ox1) / 2,
        sh.top + 0.34,
        0.16,
        0.18,
        { frame: L.frame, shutter: null, box: false, flowers: [], arch: look() < 0.5 },
        rnd,
        anchors.lights,
        0.01,
      );
      if (look() < 0.5) {
        // A hoist beam over the attic window: a craftsman's house stores its stock upstairs.
        beam(
          s,
          facePoint(upFront, (ox0 + ox1) / 2, sh.top + 0.6, -0.1),
          facePoint(upFront, (ox0 + ox1) / 2, sh.top + 0.6, 0.3),
          0.022,
          L.trim,
        );
      }
    } else {
      const n = bw > 1.9 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? (ox0 + ox1) / 2 : ox0 + ((ox1 - ox0) * (i + 0.5)) / n;
        dormerPart(
          s,
          { dir: 'z+', plane: oz1 - 0.1 },
          u,
          sh.top + 0.02,
          0.3,
          L.upperColor,
          L.roofColor,
          L.trim,
          rnd,
          anchors.lights,
        );
      }
    }
    anchors.lights!.push(wallLantern(s, facePoint(front, doorU + 0.26, 0.68, clad), [0, 0, 1]));
    if (L.ivy) ivyPart(s, front, x0 - 0.02, x0 + 0.32, 1.3, rnd);
    // A house plaque, a boot scraper and pots on the step.
    faceBox(s, front, doorU - 0.32, 0.55, clad, doorU - 0.22, 0.62, clad + 0.012, palette.white);
    flowerPot(s, doorU - 0.24, 0, z1 + 0.12, rnd);
    flowerPot(s, doorU + 0.24, 0, z1 + 0.12, rnd);
    if (d >= 3) {
      steppingStones(s, doorU, z1 + 0.25, d - 0.1, rnd);
      frontGarden(s, { ...L, garden: L.garden ?? 'railing' }, w, d, z1, doorU, x0, x1, rnd);
      if (look() < 0.5) bench(s, x0 + 0.35, d - 0.32, true, rnd);
    } else if (L.garden === 'railing') {
      // Railings tight to the front, either side of the steps.
      const rz = d - 0.06;
      gardenEdge(s, 'railing', [x0, rz], [doorU - 0.22, rz], rnd);
      gardenEdge(s, 'railing', [doorU + 0.22, rz], [x1, rz], rnd);
    }
  }
  // Chimney stacks at both ends: a home that can afford to keep two fires.
  if (L.chimney) {
    const brick = L.wall === 'stone' ? vary(L.wallColor, rnd) : palette.brick;
    if (gableFront) {
      anchors.smoke!.push(chimneyPart(s, x1 - 0.18, z0 + 0.35, sh.top - 0.1, sh.ridge + 0.05, brick, true));
    } else {
      anchors.smoke!.push(
        chimneyPart(s, x0 + 0.22, (z0 + z1) / 2, sh.top - 0.1, sh.ridge + 0.14, brick, true),
      );
      anchors.smoke!.push(chimneyPart(s, x1 - 0.22, (z0 + z1) / 2, sh.top - 0.1, sh.ridge + 0.14, brick));
    }
  }
  if (L.custom.sign) signBoard(s, front, doorU, 0.92, 0.44, clad, anchors);
  return { s, anchors };
}

export const townhouse: Kit = {
  ...houseKit('townhouse', townhouseOf),
  footprint: { size: [2, 2], entrance: [1, 1] },
};

// --- Shop (flats above) -------------------------------------------------------------------------

type Emblem = (s: ShapeBuilder, c: V3, f: Face) => void;

/** Sign emblems, drawn on both faces of a hanging board (the board faces along u). */
function both(draw: (s: ShapeBuilder, c: V3, side: number, f: Face) => void): Emblem {
  return (s, c, f) => {
    for (const side of [-1, 1]) draw(s, c, side, f);
  };
}

function off(c: V3, f: Face, side: number, dy = 0, du = 0): V3 {
  // Boards face along u: x for z faces, z for x faces.
  const k = 0.022 * side;
  return f.dir[0] === 'z' ? [c[0] + k, c[1] + dy, c[2] + du] : [c[0] + du, c[1] + dy, c[2] + k];
}

const EMBLEMS: Record<string, Emblem> = {
  bread: both((s, c, side, f) => {
    const p = off(c, f, side);
    s.blob(p[0], p[1], p[2], 0.02, 0.04, 0.07, GOOD_COLORS.bread, 1);
  }),
  apples: both((s, c, side, f) => {
    const p = off(c, f, side);
    s.blob(p[0], p[1], p[2], 0.02, 0.055, 0.055, GOOD_COLORS.apple, 1);
    const q = off(c, f, side, 0.06, 0.01);
    s.blob(q[0], q[1], q[2], 0.012, 0.012, 0.025, palette.leaf, 0);
  }),
  cheese: both((s, c, side, f) => {
    const p = off(c, f, side);
    s.blob(p[0], p[1] - 0.01, p[2], 0.015, 0.035, 0.07, GOOD_COLORS.cheese, 0);
  }),
  yarn: both((s, c, side, f) => {
    const p = off(c, f, side);
    s.blob(p[0], p[1], p[2], 0.02, 0.05, 0.05, GOOD_COLORS.yarnA, 1);
  }),
  cloth: both((s, c, side, f) => {
    const p = off(c, f, side, 0.02);
    s.blob(p[0], p[1], p[2], 0.012, 0.03, 0.07, GOOD_COLORS.cloth, 0);
    const q = off(c, f, side, -0.04);
    s.blob(q[0], q[1], q[2], 0.012, 0.025, 0.06, GOOD_COLORS.clothB, 0);
  }),
  tools: both((s, c, side, f) => {
    const p = off(c, f, side, 0.02);
    s.blob(p[0], p[1], p[2], 0.012, 0.03, 0.06, palette.metal, 0);
    const q = off(c, f, side, -0.04);
    s.blob(q[0], q[1], q[2], 0.01, 0.05, 0.012, palette.wood, 0);
  }),
  herbs: both((s, c, side, f) => {
    const p = off(c, f, side);
    s.blob(p[0], p[1], p[2], 0.015, 0.06, 0.035, GOOD_COLORS.herb, 0);
    const q = off(c, f, side, 0.04);
    s.blob(q[0], q[1], q[2], 0.015, 0.03, 0.03, GOOD_COLORS.lavender, 0);
  }),
  boot: both((s, c, side, f) => {
    const p = off(c, f, side, 0.02, -0.01);
    s.blob(p[0], p[1], p[2], 0.012, 0.055, 0.03, 0x5a3e2a, 0);
    const q = off(c, f, side, -0.04, 0.02);
    s.blob(q[0], q[1], q[2], 0.012, 0.022, 0.06, 0x5a3e2a, 0);
  }),
  key: both((s, c, side, f) => {
    const p = off(c, f, side, 0, -0.04);
    s.blob(p[0], p[1], p[2], 0.012, 0.035, 0.035, palette.mustard, 0);
    const q = off(c, f, side, 0, 0.03);
    s.blob(q[0], q[1], q[2], 0.01, 0.012, 0.06, palette.mustard, 0);
  }),
  teapot: both((s, c, side, f) => {
    const p = off(c, f, side);
    s.blob(p[0], p[1], p[2], 0.015, 0.045, 0.05, palette.white, 0);
    const q = off(c, f, side, 0.01, 0.06);
    s.blob(q[0], q[1], q[2], 0.01, 0.015, 0.025, palette.white, 0);
  }),
  hat: both((s, c, side, f) => {
    const p = off(c, f, side, 0.015);
    s.blob(p[0], p[1], p[2], 0.012, 0.045, 0.04, palette.navy, 0);
    const q = off(c, f, side, -0.03);
    s.blob(q[0], q[1], q[2], 0.012, 0.01, 0.07, palette.navy, 0);
  }),
};
const SHOP_TRADES = ['boot', 'key', 'teapot', 'hat', 'bread', 'cloth', 'apples', 'cheese'];

/** What a building is making: its 'make' param, else its first output pile. */
function makingOf(opts: KitBuildOptions | undefined): string | null {
  const m = opts?.params?.make;
  if (typeof m === 'string' && m.length > 0) return m;
  for (const [k, v] of Object.entries(opts?.params ?? {}))
    if (k.startsWith('out:') && typeof v === 'number' && v > 0) return k.slice(4);
  return null;
}

function shopOf(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 3];
  const [ex] = opts?.entrance ?? [Math.floor(w / 2), d - 1];
  const plain = opts?.lod === 'low';
  const L = homeLook(opts, 41);
  const { rnd, look } = L;
  const { s, anchors } = start();
  const doorU = ex + 0.5;
  const x0 = 0.16;
  const x1 = w - 0.16;
  const z1 = d - 0.24;
  const z0 = Math.max(0.22, z1 - (d >= 3 ? 2.2 : 1.55));
  const wide = w >= 3;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.08,
    wallH: 1.56,
    wall: L.wall,
    wallColor: L.wallColor,
    trim: L.trim,
    upper: { at: 0.86, wall: L.upper, color: L.upperColor, jetty: L.upper === 'timber' ? 0.07 : 0.02 },
    roof: {
      shape: wide ? L.roofShape : L.roofShape === 'hip' ? 'gable' : L.roofShape,
      material: L.roofMaterial === 'thatch' ? 'tile' : L.roofMaterial,
      color: L.roofMaterial === 'thatch' ? vary(palette.roofTerracotta, rnd, 0.5) : L.roofColor,
      rise: wide ? 0.78 : 0.88,
      overhang: 0.14,
      ridgeAlongX: wide,
    },
    rnd,
    plain,
  });
  const [ox0, oz0, ox1, oz1] = sh.outer;
  const front: Face = { dir: 'z+', plane: z1 };
  const upFront: Face = { dir: 'z+', plane: oz1 };
  const trade = makingOf(opts) ?? SHOP_TRADES[Math.floor(look() * SHOP_TRADES.length)]!;
  const paint = vary(L.accent === palette.white ? palette.navy : L.accent, rnd, 0.3);
  // The flat's own door to one side on wide fronts; the shop door in the middle of the front.
  const flatU = wide ? (doorU < w / 2 ? x1 - 0.28 : x0 + 0.28) : null;
  const sf0 = wide && flatU! < doorU ? flatU! + 0.22 : x0 + 0.06;
  const sf1 = wide && flatU! > doorU ? flatU! - 0.22 : x1 - 0.06;
  const { fascia, fasciaW } = shopfront(s, front, sf0, sf1, doorU, 0.66, paint, rnd, anchors.lights!, 0.012);
  if (flatU !== null)
    doorPart(s, front, flatU, 0.22, 0.56, vary(L.accent, rnd, 0.6), L.trim, 'plank', claddingDepth(L.wall));
  // Painted lettering on the fascia unless the player wrote their own.
  if (L.custom.sign) {
    anchors.sign = { center: fascia, normal: [0, 0, 1], width: fasciaW, height: 0.12 };
  } else if (!plain) {
    // Gilt lettering: a word or two of letters with ascenders, centered on the fascia.
    const words =
      fasciaW > 0.9 ? [4 + Math.floor(look() * 3), 3 + Math.floor(look() * 4)] : [4 + Math.floor(look() * 3)];
    const lw = 0.026;
    const gap = 0.012;
    const total = words.reduce((t, n) => t + n * (lw + gap), 0) + (words.length - 1) * 0.05;
    let u = (sf0 + sf1) / 2 - total / 2;
    const gilt = L.accent === palette.mustard ? palette.white : 0xe8c35a;
    for (const n of words) {
      for (let i = 0; i < n; i++) {
        const tall = i === 0 || rnd() < 0.25;
        const y0 = 0.715;
        const y1 = y0 + (tall ? 0.062 : 0.044);
        faceBox(s, front, u, y0, 0.074, u + lw, y1, 0.08, gilt);
        u += lw + gap;
      }
      u += 0.05;
    }
  }
  if (!plain) {
    if (look() < 0.65)
      awningPart(
        s,
        front,
        sf0 - 0.02,
        sf1 + 0.02,
        0.64,
        0.34,
        vary(L.accent === palette.white ? palette.accentRed : L.accent, rnd, 0.3),
        palette.white,
        Math.max(4, Math.round((sf1 - sf0) / 0.13)),
      );
    hangingSign(
      s,
      upFront,
      x0 + 0.08 < doorU - 0.5 ? x0 + 0.1 : x1 - 0.1,
      1.1,
      vary(palette.paper, rnd, 0.3),
      EMBLEMS[trade] ?? EMBLEMS.key!,
    );
    const style = windowsOf(L, true);
    windowRow(s, upFront, ox0, ox1, 1.2, style, rnd, anchors.lights!, [], 0.5, [0.2, 0.28], 0.012);
    const side = { ...style, box: false };
    windowRow(
      s,
      { dir: 'x+', plane: ox1 },
      oz0,
      oz1,
      1.2,
      side,
      rnd,
      anchors.lights!,
      [],
      0.9,
      [0.18, 0.24],
      0.012,
    );
    windowRow(
      s,
      { dir: 'x-', plane: ox0 },
      oz0,
      oz1,
      1.2,
      side,
      rnd,
      anchors.lights!,
      [],
      0.9,
      [0.18, 0.24],
      0.012,
    );
    windowRow(
      s,
      { dir: 'z-', plane: oz0 },
      ox0,
      ox1,
      1.2,
      side,
      rnd,
      anchors.lights!,
      [],
      0.7,
      [0.2, 0.24],
      0.012,
    );
    if (wide) {
      for (const u of [ox0 + 0.55, ox1 - 0.55])
        dormerPart(
          s,
          { dir: 'z+', plane: oz1 - 0.1 },
          u,
          sh.top + 0.02,
          0.28,
          L.upperColor,
          sh.roof.color,
          L.trim,
          rnd,
          anchors.lights,
        );
    } else {
      windowPart(
        s,
        upFront,
        (ox0 + ox1) / 2,
        sh.top + 0.36,
        0.16,
        0.16,
        { frame: L.frame, shutter: null, box: false, flowers: [] },
        rnd,
        anchors.lights,
        0.01,
      );
    }
    // Wares out front: a display bench with the shop's goods, pots by the door.
    const goodsAt = doorU > (sf0 + sf1) / 2 ? sf0 + 0.28 : sf1 - 0.28;
    s.box(goodsAt - 0.22, 0.12, z1 + 0.06, goodsAt + 0.22, 0.15, z1 + 0.24, vary(palette.wood, rnd, 0.5));
    for (const dx of [-0.19, 0.19])
      s.box(goodsAt + dx - 0.015, 0, z1 + 0.08, goodsAt + dx + 0.015, 0.12, z1 + 0.22, palette.timber);
    const ware = ['apples', 'bread', 'cheese', 'herbs', 'yarn', 'tools'].includes(trade) ? trade : '';
    for (const dx of [-0.11, 0.11]) crateOf(s, ware, goodsAt + dx, 0.15, z1 + 0.15, rnd);
    flowerPot(s, doorU - 0.24, 0, z1 + 0.12, rnd);
    if (look() < 0.5) barrel(s, doorU + 0.26, 0, z1 + 0.12, rnd, 0.8);
    anchors.lights!.push(wallLantern(s, facePoint(front, sf0 - 0.02, 0.8, 0.02), [0, 0, 1]));
    if (L.ivy && !wide) ivyPart(s, { dir: 'x+', plane: x1 }, z0 + 0.1, z0 + 0.5, 1.2, rnd);
  }
  if (L.chimney) {
    const brick = L.wall === 'stone' ? vary(L.wallColor, rnd) : palette.brick;
    anchors.smoke!.push(
      wide
        ? chimneyPart(s, x1 - 0.3, (z0 + z1) / 2, sh.top - 0.1, sh.ridge + 0.12, brick, true)
        : chimneyPart(s, x0 + 0.3, z0 + 0.3, sh.top - 0.1, sh.ridge - 0.05, brick, true),
    );
  }
  return { s, anchors };
}

export const shop: Kit = { ...houseKit('shop', shopOf), footprint: { size: [2, 3], entrance: [1, 2] } };

// --- Workshop (crafts zone) ---------------------------------------------------------------------

function workbench(s: ShapeBuilder, x: number, z: number, alongX: boolean, rnd: () => number): void {
  const L = 0.24;
  const P = (a: number, y: number, c: number): V3 => (alongX ? [x + a, y, z + c] : [x + c, y, z + a]);
  const top = vary(palette.wood, rnd, 0.5);
  const a = P(-L, 0.2, -0.09);
  const b = P(L, 0.23, 0.09);
  s.box(
    Math.min(a[0], b[0]),
    0.2,
    Math.min(a[2], b[2]),
    Math.max(a[0], b[0]),
    0.23,
    Math.max(a[2], b[2]),
    top,
  );
  for (const [la, lc] of [
    [-L + 0.03, -0.07],
    [L - 0.03, -0.07],
    [-L + 0.03, 0.07],
    [L - 0.03, 0.07],
  ] as const)
    beam(s, P(la, 0, lc), P(la, 0.2, lc), 0.012, palette.timber);
  // A vice, a mallet and shavings.
  const v = P(L - 0.05, 0.23, 0.09);
  s.box(v[0] - 0.03, 0.2, v[2] - 0.02, v[0] + 0.03, 0.27, v[2] + 0.02, palette.metal);
  const m = P(-0.05, 0.235, 0);
  s.box(m[0] - 0.04, 0.23, m[2] - 0.02, m[0] + 0.04, 0.26, m[2] + 0.02, vary(palette.wood, rnd, 1.2));
  const sh = P(0.08, 0.232, -0.03);
  s.blob(sh[0], sh[1], sh[2], 0.04, 0.008, 0.03, 0xe6cfa0, 0);
}

function workshopOf(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const plain = opts?.lod === 'low';
  const L = homeLook(opts, 51);
  const { rnd, look } = L;
  const { s, anchors } = start();
  const doorU = ex + 0.5;
  const yardRight = doorU < w / 2;
  const bw = w >= 3 ? 1.75 : w - 0.36;
  const x0 = w >= 3 ? (yardRight ? 0.2 : w - 0.2 - bw) : 0.18;
  const x1 = x0 + bw;
  const z1 = d >= 3 ? d - 0.85 : d - 0.3;
  const z0 = 0.2;
  const wall: WallMaterial = L.wall === 'plaster' && look() < 0.5 ? 'weatherboard' : L.wall;
  const wallColor = wall === L.wall ? L.wallColor : vary(0x8a6f58, rnd, 0.5);
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.08,
    wallH: 0.86,
    wall,
    wallColor,
    trim: L.trim,
    roof: {
      shape: L.roofShape === 'hip' ? 'halfHip' : L.roofShape,
      material: L.roofMaterial === 'thatch' ? 'shingle' : L.roofMaterial,
      color: L.roofMaterial === 'thatch' ? vary(0x8a6f58, rnd, 0.5) : L.roofColor,
      rise: 0.62,
      overhang: 0.16,
      ridgeAlongX: false,
    },
    rnd,
    plain,
  });
  const clad = claddingDepth(wall);
  const front: Face = { dir: 'z+', plane: z1 };
  const du = clamp(doorU, x0 + 0.4, x1 - 0.4);
  doorPart(
    s,
    front,
    du,
    0.56,
    0.62,
    vary(L.accent === palette.white ? 0x6e8a5a : L.accent, rnd, 0.5),
    L.trim,
    'double',
    clad,
  );
  const trade = makingOf(opts);
  if (!plain) {
    // Wide multi-pane workshop windows down the long sides, a loft door with a hoist at the front.
    const style: WindowStyle = { frame: L.frame, shutter: null, box: false, flowers: [] };
    for (const f of [
      { dir: 'x+', plane: x1 },
      { dir: 'x-', plane: x0 },
    ] as Face[])
      windowRow(s, f, z0, z1, 0.5, style, rnd, anchors.lights!, [], 0.48, [0.3, 0.26], clad);
    faceBox(s, front, du - 0.14, sh.top + 0.06, clad, du + 0.14, sh.top + 0.34, clad + 0.02, L.trim);
    faceBox(
      s,
      front,
      du - 0.11,
      sh.top + 0.08,
      clad + 0.02,
      du + 0.11,
      sh.top + 0.31,
      clad + 0.03,
      vary(palette.wood, rnd, 0.5),
    );
    beam(
      s,
      facePoint(front, du, sh.top + 0.46, -0.1),
      facePoint(front, du, sh.top + 0.46, 0.34),
      0.022,
      L.trim,
    );
    beam(
      s,
      facePoint(front, du, sh.top + 0.44, 0.31),
      facePoint(front, du, sh.top - 0.12, 0.31),
      0.004,
      0xbfa27a,
    );
    hangingSign(
      s,
      front,
      du + 0.42 < x1 ? du + 0.42 : du - 0.42,
      0.82,
      vary(palette.paper, rnd, 0.3),
      (trade && EMBLEMS[trade]) || EMBLEMS.tools!,
    );
    anchors.lights!.push(wallLantern(s, facePoint(front, du - 0.38, 0.7, clad), [0, 0, 1]));
    // The yard: packed earth, a workbench, a sawhorse, what it is making and what it needs.
    const yx0 = yardRight ? x1 + 0.08 : 0.08;
    const yx1 = yardRight ? w - 0.08 : x0 - 0.08;
    const yardZ1 = d - 0.08;
    if (yx1 - yx0 > 0.4) {
      s.rbox(yx0, 0, z0 + 0.1, yx1, 0.008, yardZ1, vary(0xb59a6e, rnd, 0.4), 0.05);
      workbench(s, (yx0 + yx1) / 2, z0 + 0.45, true, rnd);
      sawhorse(s, (yx0 + yx1) / 2, z0 + 0.95, false, rnd);
      if (trade)
        pileOf(
          s,
          trade,
          Math.max(2, Math.round((opts?.params?.[`out:${trade}`] as number | undefined) ?? 2)),
          (yx0 + yx1) / 2,
          0,
          yardZ1 - 0.42,
          rnd,
        );
      else for (let i = 0; i < 3; i++) crateOf(s, '', yx0 + 0.18 + i * 0.22, 0, yardZ1 - 0.3, rnd);
      barrel(s, yx1 - 0.1, 0, z0 + 0.2, rnd);
      barrel(s, yx1 - 0.1, 0, z0 + 0.38, rnd, 0.85);
      // A spare cart wheel against the wall and offcuts in a crate.
      const wx = yardRight ? x1 + 0.05 : x0 - 0.05;
      cylX(s, wx - 0.02, wx + 0.02, 0.17, z1 - 0.3, 0.16, palette.darkWood, 10);
      cylX(s, wx - 0.03, wx + 0.03, 0.17, z1 - 0.3, 0.04, palette.metal, 6);
      crateOf(s, 'planks', (yx0 + yx1) / 2 + 0.22, 0, z0 + 0.95, rnd);
      gardenEdge(s, 'picket', [yx0, yardZ1], [yx1, yardZ1], rnd, undefined, vary(0x9a7a52, rnd, 0.4));
    } else if (d >= 3) {
      s.rbox(x0, 0, z1 + 0.1, x1, 0.008, d - 0.08, vary(0xb59a6e, rnd, 0.4), 0.05);
      workbench(s, x0 + 0.4, d - 0.4, true, rnd);
      if (trade) pileOf(s, trade, 2, x1 - 0.4, 0, d - 0.42, rnd);
    }
    if (L.leanTo && yardRight === false && x0 > 0.5)
      leanToPart(
        s,
        { dir: 'x-', plane: x0 },
        z0 + 0.1,
        z0 + 0.9,
        0.34,
        0.66,
        0.42,
        vary(0x9a6b43, rnd, 0.4),
        vary(sh.roof.color, rnd, 0.3),
        sh.roof.material,
        L.trim,
        rnd,
      );
    else if (L.leanTo && yardRight && w - x1 > 0.5)
      leanToPart(
        s,
        { dir: 'x+', plane: x1 },
        z0 + 0.1,
        z0 + 0.9,
        0.34,
        0.66,
        0.42,
        vary(0x9a6b43, rnd, 0.4),
        vary(sh.roof.color, rnd, 0.3),
        sh.roof.material,
        L.trim,
        rnd,
      );
  }
  // A brick flue or a stovepipe, smoking while the bench is busy.
  const fx = (x0 + x1) / 2 + (look() < 0.5 ? 0.3 : -0.3);
  const fz = z0 + 0.4;
  if (look() < 0.5) anchors.smoke!.push(chimneyPart(s, fx, fz, sh.top - 0.1, sh.ridge + 0.1, palette.brick));
  else {
    s.cylinder(fx, fz, 0.045, 0.045, sh.top, sh.ridge + 0.22, palette.metal, 6);
    s.cylinder(fx, fz, 0.08, 0, sh.ridge + 0.22, sh.ridge + 0.3, palette.metal, 6);
    anchors.smoke!.push([fx, sh.ridge + 0.32, fz]);
  }
  if (L.custom.sign) signBoard(s, front, du, sh.top - 0.06, 0.5, clad, anchors);
  return { s, anchors };
}

export const workshop: Kit = {
  ...houseKit('workshop', workshopOf),
  footprint: { size: [3, 3], entrance: [1, 2] },
};

// --- Farmstead (farms zone) ---------------------------------------------------------------------

function farmsteadOf(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const plain = opts?.lod === 'low';
  const L = homeLook(opts, 61);
  const { rnd, look } = L;
  const { s, anchors } = start();
  const doorU = ex + 0.5;
  const left = doorU <= w / 2 + 0.01;
  // The farmhouse faces the road on one side, the barn stands at the back on the other with the
  // yard in front of its doors, and the produce corner (pen, trees, rows) hides behind the house.
  const hx0 = left ? 0.18 : w - 1.4;
  const hx1 = hx0 + 1.22;
  const hz1 = d - 0.4;
  const hz0 = hz1 - 1.0;
  const house = shell(s, {
    x0: hx0,
    z0: hz0,
    x1: hx1,
    z1: hz1,
    base: 0.08,
    wallH: 0.74,
    wall: L.wall,
    wallColor: L.wallColor,
    trim: L.trim,
    roof: {
      shape: L.roofShape,
      material: L.roofMaterial,
      color: L.roofColor,
      rise: 0.56,
      overhang: 0.16,
      ridgeAlongX: true,
    },
    rnd,
    plain,
  });
  const clad = claddingDepth(L.wall);
  const hFront: Face = { dir: 'z+', plane: hz1 };
  const hdoor = clamp(doorU, hx0 + 0.3, hx1 - 0.3);
  doorPart(s, hFront, hdoor, 0.26, 0.58, L.accent, L.trim, 'dutch', clad);
  if (L.chimney)
    anchors.smoke!.push(
      chimneyPart(
        s,
        left ? hx0 + 0.26 : hx1 - 0.26,
        (hz0 + hz1) / 2,
        house.top - 0.1,
        house.ridge + 0.1,
        L.wall === 'stone' ? vary(L.wallColor, rnd) : palette.brick,
      ),
    );
  // The barn: weatherboard in barn red (or the district's stone), a gambrel or long gable roof.
  const bx0 = left ? w - 1.48 : 0.16;
  const bx1 = bx0 + 1.32;
  const bz0 = 0.16;
  const bz1 = Math.max(0.9, Math.min(d - 1.3, 1.45));
  const stoneBarn = L.wall === 'stone' || L.wall === 'brick';
  const barn = shell(s, {
    x0: bx0,
    z0: bz0,
    x1: bx1,
    z1: bz1,
    base: 0.06,
    wallH: 0.68,
    wall: stoneBarn ? L.wall : 'weatherboard',
    wallColor: stoneBarn ? L.wallColor : vary(look() < 0.6 ? 0xa8473b : 0x8a6f58, rnd, 0.4),
    trim: stoneBarn ? L.trim : palette.white,
    roof: {
      shape: look() < 0.5 ? 'gambrel' : 'gable',
      material: L.roofMaterial === 'thatch' ? 'thatch' : look() < 0.5 ? 'shingle' : 'slate',
      color: L.roofMaterial === 'thatch' ? L.roofColor : vary(0x6b625c, rnd, 0.5),
      rise: 0.78,
      overhang: 0.12,
      ridgeAlongX: false,
    },
    rnd,
    plain,
  });
  const bFront: Face = { dir: 'z+', plane: bz1 };
  doorPart(s, bFront, (bx0 + bx1) / 2, 0.56, 0.56, vary(0x8f3a30, rnd, 0.5), palette.white, 'double', 0.02);
  if (!plain) {
    weathervane(s, (bx0 + bx1) / 2, barn.ridge + 0.02, (bz0 + bz1) / 2);
    const style = windowsOf(L);
    windowRow(s, hFront, hx0, hx1, 0.5, style, rnd, anchors.lights!, [hdoor], 0.55, [0.18, 0.2], clad);
    windowPart(
      s,
      { dir: 'x+', plane: hx1 },
      (hz0 + hz1) / 2,
      0.5,
      0.16,
      0.18,
      { ...style, box: false },
      rnd,
      anchors.lights,
      clad,
    );
    windowPart(
      s,
      { dir: 'x-', plane: hx0 },
      (hz0 + hz1) / 2,
      0.5,
      0.16,
      0.18,
      { ...style, box: false },
      rnd,
      anchors.lights,
      clad,
    );
    if (L.porch)
      porchPart(
        s,
        hFront,
        hdoor,
        0.3,
        0.74,
        0.24,
        vary(L.roofMaterial === 'thatch' ? palette.roofTerracotta : L.roofColor, rnd, 0.4),
        L.trim,
        true,
      );
    // The yard: packed earth in front of the barn doors, a pump and trough, hens and hay.
    const yx0 = left ? hx1 + 0.06 : 0.1;
    const yx1 = left ? w - 0.1 : hx0 - 0.06;
    s.rbox(yx0, 0, bz1 + 0.04, yx1, 0.007, d - 0.12, vary(0xb59a6e, rnd, 0.4), 0.06);
    pump(s, left ? yx1 - 0.14 : yx0 + 0.14, bz1 + 0.3, palette.navy);
    trough(s, left ? yx1 - 0.14 : yx0 + 0.14, bz1 + 0.62, false, true);
    hayBale(s, left ? bx0 + 0.24 : bx1 - 0.24, 0, bz1 + 0.2, true, rnd);
    hayBale(s, left ? bx0 + 0.24 : bx1 - 0.24, 0.14, bz1 + 0.2, true, rnd);
    for (let i = 0; i < 4; i++)
      hen(s, yx0 + 0.2 + rnd() * (yx1 - yx0 - 0.4), bz1 + 0.5 + rnd() * (d - bz1 - 0.9), rnd() * 6.28, rnd);
    // The produce corner behind the house: what this farm grows.
    const make = makingOf(opts) ?? ['vegetables', 'wheat', 'apples', 'wool', 'milk'][Math.floor(look() * 5)]!;
    const px0 = left ? 0.1 : bx1 + 0.12;
    const px1 = left ? bx0 - 0.12 : w - 0.1;
    const pz0 = 0.12;
    const pz1 = hz0 - 0.2;
    if (px1 - px0 > 0.45 && pz1 - pz0 > 0.45) {
      if (make === 'wool' || make === 'milk') {
        for (const [a, b] of [
          [
            [px0, pz0],
            [px1, pz0],
          ],
          [
            [px1, pz0],
            [px1, pz1],
          ],
          [
            [px1, pz1],
            [px0, pz1],
          ],
          [
            [px0, pz1],
            [px0, pz0],
          ],
        ] as [[number, number], [number, number]][])
          postAndRail(s, a, b, rnd);
        trough(s, (px0 + px1) / 2, pz0 + 0.14, true, false);
        anchors.animals = [
          {
            kind: make === 'wool' ? 'sheep' : 'cow',
            pen: [px0 + 0.12, pz0 + 0.3, px1 - 0.12, pz1 - 0.1],
            count: make === 'wool' ? 3 : 1,
          },
        ];
      } else if (make === 'apples') {
        for (let i = 0; i < 2; i++) {
          const tx = px0 + (px1 - px0) * (0.3 + i * 0.4);
          const tz = pz0 + (pz1 - pz0) * (i === 0 ? 0.35 : 0.65);
          s.cylinder(tx, tz, 0.045, 0.03, 0, 0.36, palette.bark, 5);
          const leaf = vary(palette.leaf, rnd, 0.8);
          s.blob(tx, 0.5, tz, 0.26, 0.21, 0.26, leaf, 1, rnd, 0.1, mixHex(leaf, 0xc8e070, 0.15));
          for (let k = 0; k < 5; k++) {
            const a = rnd() * Math.PI * 2;
            s.blob(
              tx + Math.cos(a) * 0.21,
              0.44 + rnd() * 0.14,
              tz + Math.sin(a) * 0.21,
              0.024,
              0.024,
              0.024,
              palette.apple,
              0,
            );
          }
        }
      } else if (make === 'wheat') {
        s.rbox(px0, 0, pz0, px1, 0.012, pz1, 0x9a7a48, 0.03);
        const n = Math.max(2, Math.round((px1 - px0) / 0.2));
        for (let i = 0; i < n; i++)
          for (let j = 0; j < 2; j++) {
            const sx = px0 + (px1 - px0) * ((i + 0.5) / n);
            const sz = pz0 + (pz1 - pz0) * (j === 0 ? 0.3 : 0.7);
            s.cylinder(sx, sz, 0.06, 0.02, 0, 0.2, vary(GOOD_COLORS.wheatDark, rnd, 0.5), 6);
            s.cylinder(sx, sz, 0.05, 0, 0.16, 0.27, vary(GOOD_COLORS.wheat, rnd, 0.5), 6);
          }
      } else vegRows(s, px0, pz0, px1, pz1, rnd, px1 - px0 > pz1 - pz0);
    }
    pileOf(
      s,
      make,
      Math.round((opts?.params?.[`out:${make}`] as number | undefined) ?? 0),
      (yx0 + yx1) / 2,
      0,
      d - 0.42,
      rnd,
    );
    // The front fence, with a gate to the yard and another to the house door.
    const gates = Math.abs(hdoor - doorU) > 0.45 ? [Math.min(hdoor, doorU), Math.max(hdoor, doorU)] : [doorU];
    let fx = 0.06;
    for (const g of gates) {
      postAndRail(s, [fx, d - 0.06], [g - 0.2, d - 0.06], rnd);
      fx = g + 0.2;
    }
    postAndRail(s, [fx, d - 0.06], [w - 0.06, d - 0.06], rnd);
    steppingStones(s, hdoor, hz1 + 0.15, d - 0.08, rnd);
  }
  return { s, anchors };
}

export const farmstead: Kit = {
  id: 'farmstead',
  kind: 'building',
  footprint: { size: [3, 3], entrance: [1, 2] },
  build: (opts) => farmsteadOf(opts).s.build(),
  anchors: (opts) => farmsteadOf(opts).anchors,
};
