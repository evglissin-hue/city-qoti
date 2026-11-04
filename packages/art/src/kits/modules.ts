// C5E: customization phase 2 modules (docs/spec/10-world-and-building.md, Customization): a porch,
// an arcade, a bay window, a balcony, a dormer, an extra floor, a corner tower, flower boxes and
// ivy, fitted to any building kit after it is built. The kit's own geometry says where: its wall
// faces (plaster, brick, stone and timber surfaces that stand upright) give the walls' outline, its
// roof faces the eave and the ridge, its glass the windows that take flower boxes, and its colors
// the paint, so a module matches the district style it lands on. Both levels: the builder draws
// the far versions at 'low'.
import { Color, type BufferGeometry } from 'three';
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { SURFACE } from '../surface';
import { bayWindow, ivyPart } from './details';
import { dormerPart, faceBox, porchPart, windowPart, type Face } from './parts';
import { FLOWERS } from './style';
import { mergeFlat } from './vehicles';
import type { KitAnchors, KitBuildOptions } from './types';

const WALLS = new Set<number>([SURFACE.plaster, SURFACE.brick, SURFACE.stone, SURFACE.timber]);
const ROOFS = new Set<number>([SURFACE.tile, SURFACE.slate, SURFACE.thatch, SURFACE.zinc]);
/** How much an extra floor raises everything from the eave up. */
export const EXTRA_FLOOR = 0.42;

export interface Fit {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  eave: number;
  ridge: number;
  /** The ridge runs along x (the front is a slope) or along z (the front is a gable). */
  ridgeAlongX: boolean;
  wall: number;
  roof: number;
}

const tmp = new Color();

function quantile(a: number[], q: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]!;
}

/** Reads a built kit's walls, eave, ridge and paint from its surface ids. */
export function fitOf(g: BufferGeometry): Fit | null {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const col = g.getAttribute('color');
  const sur = g.getAttribute('surface');
  if (!pos || !nrm || !sur) return null;
  // Each wall plane is where the most upright wall area faces that way (signs, porches and fences
  // are small next to a wall), bucketed every 0.02 tiles.
  const planes = [
    new Map<number, number>(),
    new Map<number, number>(),
    new Map<number, number>(),
    new Map<number, number>(),
  ];
  const ry: number[] = [];
  const wallC = [0, 0, 0, 0];
  const roofC = [0, 0, 0, 0];
  let ridge = -Infinity;
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const id = sur.getX(t);
    const nx = nrm.getX(t);
    const ny = nrm.getY(t);
    const nz = nrm.getZ(t);
    if (WALLS.has(id) && Math.abs(ny) < 0.3) {
      const e1 = [
        pos.getX(t + 1) - pos.getX(t),
        pos.getY(t + 1) - pos.getY(t),
        pos.getZ(t + 1) - pos.getZ(t),
      ];
      const e2 = [
        pos.getX(t + 2) - pos.getX(t),
        pos.getY(t + 2) - pos.getY(t),
        pos.getZ(t + 2) - pos.getZ(t),
      ];
      const cx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
      const cy = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
      const cz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
      const area = Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
      const mx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      const mz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      const side = nx > 0.7 ? 1 : nx < -0.7 ? 0 : nz > 0.7 ? 3 : nz < -0.7 ? 2 : -1;
      if (side >= 0) {
        const v = side < 2 ? mx : mz;
        const key = Math.round(v * 50);
        planes[side]!.set(key, (planes[side]!.get(key) ?? 0) + area);
      }
      if (col && pos.getY(t) > 0.25) {
        wallC[0]! += col.getX(t);
        wallC[1]! += col.getY(t);
        wallC[2]! += col.getZ(t);
        wallC[3]!++;
      }
    } else if (ROOFS.has(id) && ny > 0.2) {
      for (let k = 0; k < 3; k++) {
        ry.push(pos.getY(t + k));
        ridge = Math.max(ridge, pos.getY(t + k));
      }
      if (col) {
        roofC[0]! += col.getX(t);
        roofC[1]! += col.getY(t);
        roofC[2]! += col.getZ(t);
        roofC[3]!++;
      }
    }
  }
  const best = (m: Map<number, number>): number | null => {
    let k: number | null = null;
    let a = 0;
    for (const [key, v] of m)
      if (v > a) {
        a = v;
        k = key;
      }
    return k === null ? null : k / 50;
  };
  const [x0, x1, z0, z1] = [best(planes[0]!), best(planes[1]!), best(planes[2]!), best(planes[3]!)];
  if (
    x0 === null ||
    x1 === null ||
    z0 === null ||
    z1 === null ||
    ry.length < 6 ||
    x1 - x0 < 0.3 ||
    z1 - z0 < 0.3
  )
    return null;
  // Which way the ridge runs: the spread of the roof's top along each axis.
  let ax0 = Infinity;
  let ax1 = -Infinity;
  let az0 = Infinity;
  let az1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (!ROOFS.has(sur.getX(i)) || pos.getY(i) < ridge - 0.03) continue;
    ax0 = Math.min(ax0, pos.getX(i));
    ax1 = Math.max(ax1, pos.getX(i));
    az0 = Math.min(az0, pos.getZ(i));
    az1 = Math.max(az1, pos.getZ(i));
  }
  const hex = (c: number[], fallback: number): number =>
    c[3]! > 0 ? tmp.setRGB(c[0]! / c[3]!, c[1]! / c[3]!, c[2]! / c[3]!).getHex() : fallback;
  return {
    x0,
    x1,
    z0,
    z1,
    eave: quantile(ry, 0.05),
    ridge,
    ridgeAlongX: ax1 - ax0 >= az1 - az0,
    wall: hex(wallC, palette.plasterCream),
    roof: hex(roofC, palette.roofTerracotta),
  };
}

/** Front-facing window panes (glass facing +z, or a side), as boxes [u0, u1, y0, y1]. */
function panesOf(
  g: BufferGeometry,
  dir: 'z+' | 'x+' | 'x-',
  plane: number,
): [number, number, number, number][] {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const sur = g.getAttribute('surface');
  const out: [number, number, number, number][] = [];
  for (let t = 0; t + 2 < pos.count; t += 3) {
    if (sur.getX(t) !== SURFACE.glass) continue;
    const n = dir === 'z+' ? nrm.getZ(t) : dir === 'x+' ? nrm.getX(t) : -nrm.getX(t);
    if (n < 0.7) continue;
    let u0 = Infinity;
    let u1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let o = 0;
    for (let k = 0; k < 3; k++) {
      const u = dir === 'z+' ? pos.getX(t + k) : pos.getZ(t + k);
      o += dir === 'z+' ? pos.getZ(t + k) : pos.getX(t + k);
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      y0 = Math.min(y0, pos.getY(t + k));
      y1 = Math.max(y1, pos.getY(t + k));
    }
    if (Math.abs(o / 3 - plane) > 0.12) continue;
    const hit = out.find((p) => u0 < p[1] + 0.06 && u1 > p[0] - 0.06 && y0 < p[3] + 0.06 && y1 > p[2] - 0.06);
    if (hit) {
      hit[0] = Math.min(hit[0], u0);
      hit[1] = Math.max(hit[1], u1);
      hit[2] = Math.min(hit[2], y0);
      hit[3] = Math.max(hit[3], y1);
    } else out.push([u0, u1, y0, y1]);
  }
  return out.slice(0, 10);
}

/** Lifts everything from the eave up by `h` (the roof, chimneys and the walls' top edges). */
function liftAbove(g: BufferGeometry, y: number, h: number): void {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) >= y - 0.005) pos.setY(i, pos.getY(i) + h);
  pos.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

/** Modules from a kit's params (`mod:<slot>`), as [slot, module id]. */
export function modulesOf(opts: KitBuildOptions | undefined): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(opts?.params ?? {}))
    if (k.startsWith('mod:') && typeof v === 'string') out.push([k.slice(4), v]);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * Fits a building's modules to its built geometry and returns the merged geometry (the input is
 * left alone and the caller disposes it). Unknown modules, and kits with no walls or roof to read,
 * come back unchanged (a copy).
 */
export function fitModules(base: BufferGeometry, opts: KitBuildOptions | undefined): BufferGeometry {
  const mods = modulesOf(opts);
  const fit = mods.length ? fitOf(base) : null;
  if (!fit) return base.clone();
  const g = base.clone();
  const lod = opts?.lod ?? 'high';
  const s = new ShapeBuilder(lod, 'kit');
  const rnd = seeded((opts?.seed ?? 1) * 31 + 7);
  const has = (id: string): boolean => mods.some(([, m]) => m === id);
  const [ex] = opts?.entrance ?? [0, 0];
  const doorU = Math.min(fit.x1 - 0.2, Math.max(fit.x0 + 0.2, ex + 0.5));
  const front: Face = { dir: 'z+', plane: fit.z1 };
  const p = opts?.params ?? {};
  // A joined side (a row's party wall) takes no side module.
  const sideDir: 'x+' | 'x-' | null = !p.joinR ? 'x+' : !p.joinL ? 'x-' : null;
  const side: Face | null = sideDir ? { dir: sideDir, plane: sideDir === 'x+' ? fit.x1 : fit.x0 } : null;
  const trim = palette.timber;
  const lights: V3[] = [];
  let eave = fit.eave;
  let ridge = fit.ridge;

  if (has('extra-floor')) {
    // Everything from the eave up rises a storey; the walls' top edges stretch with it. A timber
    // string course marks the old eave, and a row of windows lights the new floor front and back.
    liftAbove(g, fit.eave, EXTRA_FLOOR);
    s.surface(SURFACE.timber);
    s.box(fit.x0 - 0.02, eave - 0.03, fit.z0 - 0.02, fit.x1 + 0.02, eave + 0.02, fit.z1 + 0.02, trim, 'b');
    const style = { frame: palette.white, shutter: null, box: false, flowers: [] };
    const n = Math.max(1, Math.round((fit.x1 - fit.x0) / 0.55));
    for (let i = 0; i < n; i++) {
      const u = fit.x0 + ((fit.x1 - fit.x0) * (i + 0.5)) / n;
      windowPart(s, front, u, eave + EXTRA_FLOOR * 0.5, 0.17, 0.2, style, rnd, lights, 0.005);
      windowPart(
        s,
        { dir: 'z-', plane: fit.z0 },
        u,
        eave + EXTRA_FLOOR * 0.5,
        0.17,
        0.2,
        style,
        rnd,
        lights,
        0.005,
      );
    }
    eave += EXTRA_FLOOR;
    ridge += EXTRA_FLOOR;
  }
  if (has('porch')) {
    porchPart(s, front, doorU, 0.34, Math.min(0.66, eave - 0.08), 0.3, fit.roof, trim, true);
    s.nearOnly(() => {
      s.surface(SURFACE.stone);
      s.box(doorU - 0.24, 0, fit.z1, doorU + 0.24, 0.04, fit.z1 + 0.32, palette.foundation);
      s.surface(SURFACE.plain);
    });
  }
  if (has('arcade')) {
    // Stone piers and round-headed openings along the front under a lead-flat roof.
    const y = Math.min(0.62, eave - 0.06);
    const d = 0.3;
    const n = Math.max(2, Math.round((fit.x1 - fit.x0) / 0.36));
    const stone = vary(palette.stone, rnd, 0.4);
    s.surface(SURFACE.stone);
    for (let i = 0; i <= n; i++) {
      const u = fit.x0 + ((fit.x1 - fit.x0) * i) / n;
      s.box(u - 0.035, 0, fit.z1 + d - 0.07, u + 0.035, y, fit.z1 + d, stone);
    }
    s.box(fit.x0 - 0.04, y - 0.09, fit.z1 + d - 0.07, fit.x1 + 0.04, y + 0.03, fit.z1 + d + 0.01, stone);
    s.nearOnly(() => {
      // Spandrels: a little triangle each side of every arch's crown.
      for (let i = 0; i < n; i++) {
        const a = fit.x0 + ((fit.x1 - fit.x0) * i) / n + 0.035;
        const b = fit.x0 + ((fit.x1 - fit.x0) * (i + 1)) / n - 0.035;
        const zz = fit.z1 + d + 0.005;
        s.tri([a, y - 0.09, zz], [a, y - 0.2, zz], [a + 0.08, y - 0.09, zz], stone, [0, 0, 1]);
        s.tri([b, y - 0.09, zz], [b - 0.08, y - 0.09, zz], [b, y - 0.2, zz], stone, [0, 0, 1]);
      }
    });
    s.surface(SURFACE.zinc);
    s.box(fit.x0 - 0.05, y + 0.03, fit.z1, fit.x1 + 0.05, y + 0.06, fit.z1 + d + 0.02, 0x8a9aa0);
    s.surface(SURFACE.cobble);
    s.box(fit.x0, 0, fit.z1, fit.x1, 0.02, fit.z1 + d, vary(0xb9b1a3, rnd, 0.3));
    s.occlude(fit.x0, 0, fit.z1, fit.x1, y, fit.z1 + d, 0.15, 0.1);
  }
  if (side && has('bay-window')) {
    const mid = (fit.z0 + fit.z1) / 2;
    bayWindow(
      s,
      side,
      mid,
      0.16,
      Math.min(0.56, fit.z1 - fit.z0 - 0.2),
      Math.min(0.42, eave - 0.32),
      0.18,
      palette.white,
      fit.roof,
      rnd,
      lights,
      0,
      true,
    );
  }
  if (side && has('balcony')) {
    // A timber balcony on brackets at the upper floor, a glazed door onto it, pots on the rail.
    const y = Math.max(0.5, Math.min(eave - 0.42, 0.62));
    const mid = (fit.z0 + fit.z1) / 2;
    const half = Math.min(0.3, (fit.z1 - fit.z0) / 2 - 0.08);
    const d = 0.22;
    s.surface(SURFACE.timber);
    faceBox(s, side, mid - half, y - 0.035, 0, mid + half, y, d, vary(palette.wood, rnd, 0.4));
    s.nearOnly(() => {
      for (const k of [-1, 1]) {
        const a = sideDir === 'x+' ? fit.x1 : fit.x0;
        const sgn = sideDir === 'x+' ? 1 : -1;
        beam(
          s,
          [a, y - 0.2, mid + k * (half - 0.05)],
          [a + sgn * (d - 0.03), y - 0.035, mid + k * (half - 0.05)],
          0.014,
          trim,
        );
      }
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const u = mid - half + (2 * half * i) / n;
        faceBox(s, side, u - 0.008, y, d - 0.02, u + 0.008, y + 0.17, d - 0.005, trim);
      }
      for (const u of [mid - half, mid + half]) faceBox(s, side, u - 0.01, y, 0, u + 0.01, y + 0.17, d, trim);
      s.surface(SURFACE.flowers);
      for (let i = 0; i < 3; i++) {
        const u = mid - half + 0.1 + i * ((2 * half - 0.2) / 2);
        const q = side.dir === 'x+' ? [fit.x1 + d - 0.012, y + 0.2, u] : [fit.x0 - d + 0.012, y + 0.2, u];
        s.blob(q[0]!, q[1]!, q[2]!, 0.035, 0.03, 0.035, FLOWERS[Math.floor(rnd() * FLOWERS.length)]!, 0);
      }
    });
    s.surface(SURFACE.timber);
    faceBox(s, side, mid - half, y + 0.155, d - 0.025, mid + half, y + 0.18, d, trim);
    windowPart(
      s,
      side,
      mid,
      y + 0.17,
      0.18,
      0.3,
      { frame: palette.white, shutter: null, box: false, flowers: [] },
      rnd,
      lights,
      0.005,
    );
  }
  if (has('dormer')) {
    const roofFace: Face = fit.ridgeAlongX ? front : (side ?? { dir: 'x+', plane: fit.x1 });
    const u = fit.ridgeAlongX ? (fit.x0 + fit.x1) / 2 : (fit.z0 + fit.z1) / 2;
    const run = fit.ridgeAlongX ? (fit.z1 - fit.z0) / 2 : (fit.x1 - fit.x0) / 2;
    dormerPart(s, roofFace, u, eave + 0.02, run * 0.7, fit.wall, fit.roof, trim, rnd, lights);
    // The far level keeps the dormer's block, so the roofline does not pop.
    s.levels(
      () => {},
      () => {
        const q0 =
          roofFace.dir === 'z+' ? [u - 0.16, fit.z1 - run * 0.7] : [roofFace.plane - run * 0.7, u - 0.16];
        const q1 = roofFace.dir === 'z+' ? [u + 0.16, fit.z1] : [roofFace.plane, u + 0.16];
        s.surface(SURFACE.plaster);
        s.box(
          Math.min(q0[0]!, q1[0]!),
          eave + 0.02,
          Math.min(q0[1]!, q1[1]!),
          Math.max(q0[0]!, q1[0]!),
          eave + 0.28,
          Math.max(q0[1]!, q1[1]!),
          fit.wall,
        );
      },
    );
  }
  if (has('tower')) {
    // A round corner turret, a storey above the ridge, with slit windows and a candle-snuffer roof.
    const cx = fit.x1 - 0.05;
    const cz = fit.z1 - 0.05;
    const r = 0.22;
    const top = ridge + 0.15;
    s.surface(SURFACE.stone);
    s.jitter(0.03);
    s.cylinder(cx, cz, r, r, 0, top, vary(fit.wall, rnd, 0.3), 10);
    s.jitter(0);
    s.surface(SURFACE.timber);
    s.cylinder(cx, cz, r + 0.03, r + 0.03, top - 0.04, top, trim, 10);
    s.surface(SURFACE.slate);
    s.cylinder(cx, cz, r + 0.06, 0, top, top + 0.55, vary(fit.roof, rnd, 0.3), 10);
    s.surface(SURFACE.glass);
    for (const [y, a] of [
      [top - 0.25, Math.PI * 0.25],
      [eave * 0.55, Math.PI * 0.4],
    ] as const) {
      const wx = cx + Math.cos(a) * (r + 0.004);
      const wz = cz + Math.sin(a) * (r + 0.004);
      s.glow(1);
      s.quad(
        [wx - Math.sin(a) * 0.04, y - 0.08, wz + Math.cos(a) * 0.04],
        [wx + Math.sin(a) * 0.04, y - 0.08, wz - Math.cos(a) * 0.04],
        [wx + Math.sin(a) * 0.04, y + 0.08, wz - Math.cos(a) * 0.04],
        [wx - Math.sin(a) * 0.04, y + 0.08, wz + Math.cos(a) * 0.04],
        palette.window,
        [Math.cos(a), 0, Math.sin(a)],
      );
      s.glow(0);
    }
    s.surface(SURFACE.plain);
    s.nearOnly(() => {
      beam(s, [cx, top + 0.52, cz], [cx, top + 0.7, cz], 0.008, palette.metal);
      s.tri(
        [cx, top + 0.7, cz],
        [cx, top + 0.62, cz],
        [cx + 0.14, top + 0.66, cz],
        palette.mustard,
        [0, 0, 1],
      );
      s.tri(
        [cx, top + 0.7, cz],
        [cx, top + 0.62, cz],
        [cx + 0.14, top + 0.66, cz],
        palette.mustard,
        [0, 0, -1],
      );
    });
  }
  if (has('flower-boxes')) {
    s.nearOnly(() => {
      const faces: [Face, 'z+' | 'x+' | 'x-'][] = [[front, 'z+']];
      if (side) faces.push([side, side.dir as 'x+' | 'x-']);
      for (const [f, dir] of faces) {
        for (const [u0, u1, y0] of panesOf(g, dir, f.plane)) {
          if (y0 < 0.18 || u1 - u0 > 0.6) continue;
          s.surface(SURFACE.timber);
          faceBox(s, f, u0 - 0.03, y0 - 0.07, 0, u1 + 0.03, y0 - 0.015, 0.07, vary(palette.wood, rnd, 0.4));
          s.surface(SURFACE.leaf);
          const n = Math.max(2, Math.round((u1 - u0) / 0.07));
          for (let i = 0; i < n; i++) {
            const u = u0 + ((u1 - u0) * (i + 0.5)) / n;
            const q =
              f.dir === 'z+'
                ? [u, y0 - 0.01, f.plane + 0.04]
                : [f.plane + (f.dir === 'x+' ? 0.04 : -0.04), y0 - 0.01, u];
            s.blob(q[0]!, q[1]!, q[2]!, 0.03, 0.025, 0.03, vary(palette.leaf, rnd, 0.6), 0);
            s.surface(SURFACE.flowers);
            s.blob(
              q[0]!,
              q[1]! + 0.02,
              q[2]!,
              0.02,
              0.018,
              0.02,
              FLOWERS[Math.floor(rnd() * FLOWERS.length)]!,
              0,
            );
            s.surface(SURFACE.leaf);
          }
        }
      }
      s.surface(SURFACE.plain);
    });
  }
  if (has('ivy')) {
    ivyPart(s, front, fit.x0 - 0.02, fit.x0 + 0.4, eave - 0.05, rnd);
    if (side) ivyPart(s, side, fit.z1 - 0.45, fit.z1 + 0.02, eave - 0.05, rnd);
  }
  s.surface(SURFACE.plain);
  if (s.triangles === 0) return g;
  const add = s.build();
  const merged = mergeFlat([g, add]);
  g.dispose();
  add.dispose();
  return merged;
}

/** Anchors moved for modules (an extra floor lifts the chimneys' smoke with the roof). */
export function moduleAnchors(a: KitAnchors, opts: KitBuildOptions | undefined): KitAnchors {
  if (!modulesOf(opts).some(([, m]) => m === 'extra-floor')) return a;
  return { ...a, ...(a.smoke ? { smoke: a.smoke.map(([x, y, z]) => [x, y + EXTRA_FLOOR, z] as V3) } : {}) };
}
