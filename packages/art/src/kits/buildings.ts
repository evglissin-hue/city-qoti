// Storybook buildings from the modular part library: stone foundation, plaster walls with timber
// framing, chunky roofs with generous eaves, shuttered windows with flower boxes, round-topped
// doors and chimneys. Custom fields come from `opts.params` (wall, roof, accent as swatch indexes)
// with sensible defaults; `opts.seed` adds a gentle color variation.
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { ACCENTS, palette, PLASTERS, ROOFS } from '../palette';
import { chimneyPart, doorPart, foundationPart, wallsPart, windowPart, type Face } from './parts';
import type { Kit, KitAnchors, KitBuildOptions, KitPart } from './types';

interface Style {
  wall: number;
  roof: number;
  accent: number;
  wallHeight: number;
  roofHeight: number;
  inset: number;
  floors: number;
  chimney: boolean;
}

function pick(list: readonly number[], v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? (list[Math.abs(Math.floor(v)) % list.length] ?? fallback)
    : fallback;
}

const FLOWERS = [palette.flowerA, palette.flowerB, palette.flowerC, palette.flowerD];

interface Built {
  s: ShapeBuilder;
  anchors: KitAnchors;
}

function house(opts: KitBuildOptions | undefined, base: Style): Built {
  const [w, d] = opts?.size ?? [1, 1];
  const [ex] = opts?.entrance ?? [Math.floor(w / 2), d - 1];
  const rnd = seeded(opts?.seed ?? 1);
  const p = opts?.params ?? {};
  const wall = vary(pick(PLASTERS, p.wall, base.wall), rnd, 0.6);
  const roof = vary(pick(ROOFS, p.roof, base.roof), rnd, 0.8);
  const accent = pick(ACCENTS, p.accent, base.accent);
  const low = opts?.lod === 'low';
  const s = new ShapeBuilder();
  const i = base.inset;
  const fh = 0.1;
  const x0 = i;
  const z0 = i;
  const x1 = w - i;
  const z1 = d - i;
  const top = fh + base.wallHeight;
  foundationPart(s, x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, fh);
  wallsPart(
    s,
    x0,
    z0,
    x1,
    z1,
    fh,
    top,
    wall,
    palette.timber,
    base.floors > 1 ? fh + base.wallHeight / 2 : null,
  );
  const ridgeAlongX = w >= d;
  const eave = 0.2;
  s.slabRoof(
    x0 - eave,
    z0 - eave,
    x1 + eave,
    z1 + eave,
    top - 0.04,
    top + base.roofHeight,
    roof,
    vary(palette.timber, rnd, 0.5),
    ridgeAlongX,
  );
  const anchors: KitAnchors = { smoke: [], lights: [] };
  // Door on the south face, in front of the entrance tile.
  const south: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  const doorH = Math.min(0.62, base.wallHeight * 0.72);
  doorPart(s, south, doorU, 0.28, doorH + fh, accent, palette.timber);
  if (!low) {
    const style = { frame: palette.white, shutter: accent, box: true, flowers: FLOWERS };
    const rows =
      base.floors > 1
        ? [fh + base.wallHeight * 0.28, fh + base.wallHeight * 0.75]
        : [fh + base.wallHeight * 0.55];
    // South windows, avoiding the door.
    for (let tx = 0; tx < w; tx++) {
      for (const [ri, y] of rows.entries()) {
        const u = tx + 0.5;
        if (ri === 0 && Math.abs(u - doorU) < 0.45) continue;
        if (base.floors === 1 && Math.abs(u - doorU) < 0.45) continue;
        windowPart(s, south, u, y, 0.2, 0.22, { ...style, box: ri === 0 || w <= 3 }, rnd, anchors.lights);
      }
    }
    // Side windows.
    for (const f of [
      { dir: 'x+', plane: x1 },
      { dir: 'x-', plane: x0 },
    ] as Face[]) {
      // One side window per two tiles on big footprints keeps the hall within budget.
      for (let tz = 0; tz < d; tz += d > 3 ? 2 : 1) {
        const y = rows[rows.length - 1]!;
        windowPart(s, f, tz + 0.5, y, 0.18, 0.2, { ...style, box: false }, rnd, anchors.lights);
      }
    }
    // A back window so the house reads from every side (the hall's tower covers its back).
    if (w <= 3)
      windowPart(
        s,
        { dir: 'z-', plane: z0 },
        w / 2,
        rows[rows.length - 1]!,
        0.2,
        0.22,
        { ...style, box: false },
        rnd,
        anchors.lights,
      );
  }
  if (base.chimney) {
    const cx = ridgeAlongX ? x1 - 0.3 : (x0 + x1) / 2 + 0.22;
    const cz = ridgeAlongX ? (z0 + z1) / 2 - 0.2 : z0 + 0.3;
    anchors.smoke!.push(chimneyPart(s, cx, cz, top, top + base.roofHeight + 0.18, palette.brick));
  }
  return { s, anchors };
}

const COTTAGE: Style = {
  wall: palette.plasterCream,
  roof: palette.roofTerracotta,
  accent: palette.teal,
  wallHeight: 0.8,
  roofHeight: 0.62,
  inset: 0.2,
  floors: 1,
  chimney: true,
};
const HOUSE: Style = {
  wall: palette.plasterButter,
  roof: palette.roofSlate,
  accent: palette.accentRed,
  wallHeight: 1.3,
  roofHeight: 0.72,
  inset: 0.16,
  floors: 2,
  chimney: true,
};
const SHED: Style = {
  wall: palette.wood,
  roof: palette.roofMoss,
  accent: palette.mustard,
  wallHeight: 0.6,
  roofHeight: 0.36,
  inset: 0.16,
  floors: 1,
  chimney: false,
};
const HALL: Style = {
  wall: palette.plasterSage,
  roof: palette.roofPlum,
  accent: palette.navy,
  wallHeight: 1.5,
  roofHeight: 0.95,
  inset: 0.25,
  floors: 2,
  chimney: true,
};

function houseKit(id: string, style: Style): Kit {
  return {
    id,
    kind: 'building',
    build: (opts) => house(opts, style).s.build(),
    anchors: (opts) => house(opts, style).anchors,
  };
}

export const cottage = houseKit('cottage', COTTAGE);
export const house2 = houseKit('house', HOUSE);
export const shed = houseKit('shed', SHED);

function hall(opts: KitBuildOptions | undefined): Built {
  const b = house(opts, HALL);
  const [w, d] = opts?.size ?? [4, 4];
  const s = b.s;
  const ty = 0.1 + HALL.wallHeight;
  // A little clock tower on the ridge with a glowing clock face.
  s.rbox(w / 2 - 0.3, ty, d / 2 - 0.3, w / 2 + 0.3, ty + 1.45, d / 2 + 0.3, palette.plasterCream, 0.03);
  s.box(w / 2 - 0.34, ty + 1.4, d / 2 - 0.34, w / 2 + 0.34, ty + 1.47, d / 2 + 0.34, palette.timber);
  s.glow(1);
  s.cylinder(w / 2, d / 2 + 0.31, 0.15, 0.15, ty + 1.0, ty + 1.0, palette.white, 8);
  s.box(w / 2 - 0.15, ty + 0.85, d / 2 + 0.3, w / 2 + 0.15, ty + 1.15, d / 2 + 0.32, palette.window);
  s.glow(0);
  s.box(w / 2 - 0.01, ty + 0.92, d / 2 + 0.32, w / 2 + 0.01, ty + 1.1, d / 2 + 0.335, palette.ink);
  s.cylinder(w / 2, d / 2, 0.5, 0, ty + 1.47, ty + 2.1, palette.roofPlum, 4, Math.PI / 4);
  s.box(w / 2 - 0.015, ty + 2.05, d / 2 - 0.015, w / 2 + 0.015, ty + 2.3, d / 2 + 0.015, palette.mustard);
  b.anchors.lights!.push([w / 2, ty + 1.0, d / 2 + 0.35]);
  return b;
}

export const townHall: Kit = {
  id: 'town-hall',
  kind: 'building',
  build: (opts) => hall(opts).s.build(),
  anchors: (opts) => hall(opts).anchors,
};

export const well: Kit = {
  id: 'well',
  kind: 'building',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 1);
    const s = new ShapeBuilder();
    s.cylinder(0.5, 0.5, 0.32, 0.3, 0, 0.36, vary(palette.stone, rnd), 10);
    s.cylinder(0.5, 0.5, 0.34, 0.34, 0.3, 0.38, palette.foundation, 10);
    s.cylinder(0.5, 0.5, 0.24, 0.24, 0.37, 0.385, palette.waterDeep, 10);
    s.rbox(0.17, 0.3, 0.46, 0.24, 0.9, 0.54, palette.timber, 0.01);
    s.rbox(0.76, 0.3, 0.46, 0.83, 0.9, 0.54, palette.timber, 0.01);
    s.box(0.2, 0.74, 0.48, 0.8, 0.77, 0.52, palette.wood);
    s.box(0.46, 0.55, 0.46, 0.54, 0.66, 0.54, palette.wood);
    s.slabRoof(
      0.06,
      0.24,
      0.94,
      0.76,
      0.86,
      1.12,
      vary(palette.roofTerracotta, rnd),
      palette.timber,
      true,
      0.05,
    );
    return s.build();
  },
};

const MILL_SPIN = 0.6;

function millSize(opts: KitBuildOptions | undefined): [number, number] {
  return opts?.size ?? [2, 2];
}

function hubOf(opts: KitBuildOptions | undefined): V3 {
  const [w, d] = millSize(opts);
  return [w / 2, 2.05, d / 2 + 0.62];
}

export const windmill: Kit = {
  id: 'windmill',
  kind: 'building',
  build: (opts) => {
    const [w, d] = millSize(opts);
    const rnd = seeded(opts?.seed ?? 1);
    const cx = w / 2;
    const cz = d / 2;
    const s = new ShapeBuilder();
    foundationPart(s, cx - 0.82, cz - 0.82, cx + 0.82, cz + 0.82, 0.1);
    s.cylinder(cx, cz, 0.72, 0.5, 0.1, 2.2, vary(palette.plasterCream, rnd, 0.5), 8, Math.PI / 8);
    s.cylinder(cx, cz, 0.76, 0.74, 0.7, 0.78, palette.timber, 8, Math.PI / 8);
    s.cylinder(cx, cz, 0.6, 0.6, 2.15, 2.25, palette.timber, 8, Math.PI / 8);
    s.cylinder(cx, cz, 0.62, 0, 2.25, 2.95, vary(palette.roofSlate, rnd), 8, Math.PI / 8);
    // Hub housing (the sails are a separate spinning part).
    const [hx, hy, hz] = hubOf(opts);
    s.box(hx - 0.1, hy - 0.1, hz - 0.2, hx + 0.1, hy + 0.1, hz, palette.timber);
    const face: Face = { dir: 'z+', plane: cz + 0.7 };
    doorPart(s, face, cx, 0.26, 0.62, palette.mustard, palette.timber);
    const lights: V3[] = [];
    windowPart(
      s,
      { dir: 'z+', plane: cz + 0.6 },
      cx,
      1.35,
      0.16,
      0.2,
      { frame: palette.white, shutter: palette.teal, box: true, flowers: FLOWERS },
      rnd,
      lights,
    );
    return s.build();
  },
  anchors: (opts) => {
    const [w, d] = millSize(opts);
    return { smoke: [], lights: [[w / 2, 1.35, d / 2 + 0.66]] };
  },
  parts: (opts): KitPart[] => {
    const [hx, hy, hz] = hubOf(opts);
    const s = new ShapeBuilder();
    // Four lattice sails around the hub, built in kit-local space so the pivot is the hub center.
    s.cylinder(hx, hz + 0.04, 0.08, 0.08, hy - 0.04, hy + 0.04, palette.timber, 6);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const pt = (r: number, t: number, z: number): V3 => [hx + c * r - sn * t, hy + sn * r + c * t, hz + z];
      // Spar.
      s.quad(
        pt(0.05, -0.025, 0.06),
        pt(1.25, -0.025, 0.06),
        pt(1.25, 0.025, 0.06),
        pt(0.05, 0.025, 0.06),
        palette.timber,
        [0, 0, 1],
      );
      s.quad(
        pt(0.05, -0.025, 0.02),
        pt(1.25, -0.025, 0.02),
        pt(1.25, 0.025, 0.02),
        pt(0.05, 0.025, 0.02),
        palette.timber,
        [0, 0, -1],
      );
      // Cloth.
      s.quad(
        pt(0.3, 0.03, 0.04),
        pt(1.2, 0.03, 0.04),
        pt(1.2, 0.26, 0.04),
        pt(0.3, 0.22, 0.04),
        palette.white,
        [0, 0, 1],
      );
      s.quad(
        pt(0.3, 0.03, 0.035),
        pt(1.2, 0.03, 0.035),
        pt(1.2, 0.26, 0.035),
        pt(0.3, 0.22, 0.035),
        palette.paperShade,
        [0, 0, -1],
      );
    }
    return [{ geometry: s.build(false), pivot: [hx, hy, hz], spinAxis: [0, 0, 1], spinSpeed: MILL_SPIN }];
  },
};
