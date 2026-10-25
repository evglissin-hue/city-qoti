// Placeholder buildings: a box plus a gable roof per footprint, with a door on the entrance.
// C2B replaces these with the real style kit; the ids stay.
import { ShapeBuilder } from '../geometry';
import { palette } from '../palette';
import type { Kit, KitBuildOptions } from './types';

interface HouseStyle {
  wall: number;
  roof: number;
  wallHeight: number;
  roofHeight: number;
  inset: number;
}

function house(opts: KitBuildOptions | undefined, style: HouseStyle): ShapeBuilder {
  const [w, d] = opts?.size ?? [1, 1];
  const [ex] = opts?.entrance ?? [Math.floor(w / 2), d - 1];
  const s = new ShapeBuilder();
  const i = style.inset;
  s.box(i, 0, i, w - i, style.wallHeight, d - i, style.wall);
  s.gable(
    i - 0.08,
    i - 0.08,
    w - i + 0.08,
    d - i + 0.08,
    style.wallHeight,
    style.wallHeight + style.roofHeight,
    style.roof,
    w >= d,
  );
  // Door on the south face, in front of the entrance tile.
  const dx = ex + 0.5;
  s.box(
    dx - 0.14,
    0,
    d - i - 0.02,
    dx + 0.14,
    Math.min(0.55, style.wallHeight * 0.7),
    d - i + 0.02,
    palette.door,
  );
  return s;
}

export const cottage: Kit = {
  id: 'cottage',
  kind: 'building',
  build: (opts) =>
    house(opts, {
      wall: palette.wallCream,
      roof: palette.roofTerracotta,
      wallHeight: 0.85,
      roofHeight: 0.6,
      inset: 0.15,
    }).build(),
};

export const house2: Kit = {
  id: 'house',
  kind: 'building',
  build: (opts) =>
    house(opts, {
      wall: palette.wallSand,
      roof: palette.roofSlate,
      wallHeight: 1.25,
      roofHeight: 0.7,
      inset: 0.12,
    }).build(),
};

export const shed: Kit = {
  id: 'shed',
  kind: 'building',
  build: (opts) =>
    house(opts, {
      wall: palette.wood,
      roof: palette.darkWood,
      wallHeight: 0.65,
      roofHeight: 0.35,
      inset: 0.12,
    }).build(),
};

export const townHall: Kit = {
  id: 'town-hall',
  kind: 'building',
  build: (opts) => {
    const s = house(opts, {
      wall: palette.wallStone,
      roof: palette.roofRed,
      wallHeight: 1.7,
      roofHeight: 0.9,
      inset: 0.2,
    });
    const [w, d] = opts?.size ?? [4, 4];
    // A small clock tower at the back.
    s.box(w / 2 - 0.35, 1.7, d / 2 - 0.9, w / 2 + 0.35, 3.1, d / 2 - 0.2, palette.wallStone);
    s.cylinder(w / 2, d / 2 - 0.55, 0.5, 0, 3.1, 3.7, palette.roofRed, 4);
    return s.build();
  },
};

export const well: Kit = {
  id: 'well',
  kind: 'building',
  build: () => {
    const s = new ShapeBuilder();
    s.cylinder(0.5, 0.5, 0.3, 0.3, 0, 0.35, palette.stone, 10);
    s.cylinder(0.5, 0.5, 0.22, 0.22, 0.34, 0.36, palette.riverbed, 10);
    s.box(0.2, 0.3, 0.46, 0.26, 0.85, 0.54, palette.wood);
    s.box(0.74, 0.3, 0.46, 0.8, 0.85, 0.54, palette.wood);
    s.gable(0.12, 0.3, 0.88, 0.7, 0.85, 1.05, palette.roofTerracotta, true);
    return s.build();
  },
};

export const windmill: Kit = {
  id: 'windmill',
  kind: 'building',
  build: (opts) => {
    const [w, d] = opts?.size ?? [2, 2];
    const cx = w / 2;
    const cz = d / 2;
    const s = new ShapeBuilder();
    s.cylinder(cx, cz, 0.75, 0.5, 0, 2.2, palette.wallCream, 8);
    s.cylinder(cx, cz, 0.6, 0, 2.2, 2.75, palette.roofSlate, 8);
    // Sails on the south face (static until C2B adds wind).
    const hub = cz + 0.62;
    s.box(cx - 0.05, 0.9, hub, cx + 0.05, 3.1, hub + 0.05, palette.wood);
    s.box(cx - 1.05, 1.95, hub, cx + 1.05, 2.05, hub + 0.05, palette.wood);
    s.box(cx - 0.12, 0, cz + 0.68, cx + 0.12, 0.5, cz + 0.74, palette.door);
    return s.build();
  },
};
