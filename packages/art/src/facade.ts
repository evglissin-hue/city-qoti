// R3X: the master's sign. A bracket that hangs a board has to find wall: flat, window-free and off the
// door. The dressing's clearance grid cannot tell a wall from a porch post, so the layer measures the
// street face of the geometry the buildings layer draws, as a height field of front depth over x and
// y, and `facadeSignSpots` looks in it for the places the sign can touch. Pure; the caller caches.
import type { BufferGeometry } from 'three';

/** Cells a tile across a facade grid. */
export const FACADE_CELLS_X = 16;
/** Cells a tile up a facade grid. */
export const FACADE_CELLS_Y = 25;
/** How high the grid reaches, tiles (a one storey front, the eave and a little roof). */
export const FACADE_HEIGHT = 1.6;
const NY = Math.round(FACADE_HEIGHT * FACADE_CELLS_Y);

/** The street face of a building kit (kit-local, facing +z) as a grid of front depth. */
export interface Facade {
  /** The grid's width in cells; it covers x 0 to `nx / FACADE_CELLS_X`. */
  nx: number;
  /** Per cell (row by y, then x): the nearest and farthest depth of the +z faces over it, or NaN. */
  zMin: Float32Array;
  zMax: Float32Array;
  /** The depth buffer itself, `SUB` samples a cell each way (row by y, then x); -Infinity where bare. */
  buf: Float32Array;
}

/** Samples a cell side holds in the depth buffer, each way. */
export const FACADE_SUB = 3;
const SUB = FACADE_SUB;

/**
 * The facade grid of a kit's geometry over a plot `width` tiles wide: the +z faces drawn into a depth
 * buffer (the nearest face wins, so what hides behind a wall does not count), `SUB` by `SUB` samples
 * a cell, and for every cell the least and greatest depth its samples hold. A cell on one wall plane
 * has them equal; a window frame, a recessed door or a roof slope spreads them; a cell the faces do
 * not cover whole is NaN.
 */
export function facadeOf(geometry: BufferGeometry, width: number): Facade {
  const nx = Math.max(1, Math.round(width * FACADE_CELLS_X));
  const sx = nx * SUB;
  const sy = NY * SUB;
  const buf = new Float32Array(sx * sy).fill(-Infinity);
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : pos.count;
  const at = (i: number): number => (index ? index.getX(i) : i);
  const kx = FACADE_CELLS_X * SUB; // samples per tile across
  const ky = FACADE_CELLS_Y * SUB;
  for (let t = 0; t + 2 < count; t += 3) {
    const a = at(t);
    const b = at(t + 1);
    const c = at(t + 2);
    const ax = pos.getX(a);
    const ay = pos.getY(a);
    const az = pos.getZ(a);
    const bx = pos.getX(b);
    const by = pos.getY(b);
    const bz = pos.getZ(b);
    const cx = pos.getX(c);
    const cy = pos.getY(c);
    const cz = pos.getZ(c);
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nxx = uy * vz - uz * vy;
    const nyy = uz * vx - ux * vz;
    const nzz = ux * vy - uy * vx;
    const len = Math.sqrt(nxx * nxx + nyy * nyy + nzz * nzz);
    // Only faces that look at the street: sides, undersides and tops are not wall to hang on.
    if (len < 1e-12 || nzz / len < 0.2) continue;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) * kx));
    const i1 = Math.min(sx - 1, Math.ceil(Math.max(ax, bx, cx) * kx));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by, cy) * ky));
    const j1 = Math.min(sy - 1, Math.ceil(Math.max(ay, by, cy) * ky));
    // z on the plane through the triangle: az + (nxx * (ax - x) + nyy * (ay - y)) / nzz.
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) / ky;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) / kx;
        // Inside test in the xy plane, either winding.
        const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
        const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
        const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
        if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
        const z = az + (nxx * (ax - x) + nyy * (ay - y)) / nzz;
        const k = j * sx + i;
        if (z > buf[k]!) buf[k] = z;
      }
    }
  }
  const zMin = new Float32Array(nx * NY).fill(NaN);
  const zMax = new Float32Array(nx * NY).fill(NaN);
  for (let iy = 0; iy < NY; iy++)
    for (let ix = 0; ix < nx; ix++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = 0; j < SUB; j++)
        for (let i = 0; i < SUB; i++) {
          const z = buf[(iy * SUB + j) * sx + ix * SUB + i]!;
          lo = Math.min(lo, z);
          hi = Math.max(hi, z);
        }
      // A cell the faces do not cover whole is not wall.
      if (lo === -Infinity) continue;
      zMin[iy * nx + ix] = lo;
      zMax[iy * nx + ix] = hi;
    }
  return { nx, zMin, zMax, buf };
}

/** How near the bracket's plate must be to a flat wall to count as touching it, tiles. */
export const FACADE_TOUCH = 0.015;
/** How far anything may stand proud of the wall under the sign before it would meet the board, tiles. */
export const FACADE_PROUD = 0.06;
/**
 * The master's sign (the `master-sign` kit is drawn to these): a plate on the wall, a short arm out
 * from it and a rail across the arm's end, the board hanging from the rail parallel to the wall, its
 * face to the street. Tiles. `h` is its full height from the board's lower edge, `halfW` its half
 * width, `reach` how far it stands out from the wall, `armY` the height of the arm and rail above the
 * board's lower edge and `boardW` by `boardH` the board.
 */
export const SIGN_SIZE = {
  h: 0.4,
  halfW: 0.24,
  reach: 0.2,
  armY: 0.356,
  boardW: 0.325,
  boardH: 0.238,
} as const;
/** The kit is drawn at 0.8 of these (a board of 0.26 by 0.19) and scaled up by this. */
export const SIGN_SCALE = 1.25;
/** How far a sign keeps from a lit window's middle, across and up (tiles). */
export const WINDOW_CLEAR = { x: 0.3, y: 0.32 } as const;
/** How far behind the door anchor a sign's wall may stand, tiles. */
export const WALL_BEHIND_DOOR = 1.1;
/** The lowest its lower edge may hang (tiles above the plot's ground) and the highest its top. */
const HANG_LOW = 0.5;
const HANG_TOP = 1.4;
/** The door opening's height and the half width kept clear beside it. */
const DOOR_TOP = 1.05;
const DOOR_HALF = 0.34;

/** Where a facade sign goes: the x of its arm, the y of the board's lower edge and the wall's depth. */
export interface FacadeSpot {
  x: number;
  y: number;
  z: number;
}

/**
 * Every place on the facade where the master's sign can hang, best first (an empty list when the
 * facade has none). A place has its wall plate on flat wall (within `FACADE_TOUCH`: that is the wall
 * it touches) and nothing in the way of the board and rail in front of it (more than `FACADE_PROUD`
 * out from the wall), so it never hangs on a post or a rail, a roof or a sill. It keeps off the door's
 * opening (`doorX`, up to a door's height) and `WINDOW_CLEAR` off each lit window in `lights`
 * (kit-local x and y of the street face's panes) and, given `doorZ`, no further than `WALL_BEHIND_DOOR`
 * behind it. The best are nearest the door, at about the door's
 * head: where a trade hangs its sign. Deterministic: equal facades give equal lists, ties to the
 * lower x and then the lower y.
 */
export function facadeSignSpots(
  facade: Facade,
  doorX: number,
  lights: readonly (readonly [number, number])[] = [],
  doorZ: number = Infinity,
): FacadeSpot[] {
  const out: { cost: number; spot: FacadeSpot }[] = [];
  const half = Math.ceil(SIGN_SIZE.halfW * FACADE_CELLS_X);
  for (let ix = half; ix + half < facade.nx; ix++) {
    const x = (ix + 0.5) / FACADE_CELLS_X;
    for (let iy = 0; iy < NY; iy++) {
      const yLow = iy / FACADE_CELLS_Y;
      if (yLow < HANG_LOW || yLow + SIGN_SIZE.h > HANG_TOP) continue;
      if (yLow < DOOR_TOP && Math.abs(x - doorX) < DOOR_HALF + SIGN_SIZE.halfW) continue;
      const yMid = yLow + SIGN_SIZE.h / 2;
      if (
        lights.some(([lx, ly]) => Math.abs(lx - x) < WINDOW_CLEAR.x && Math.abs(ly - yMid) < WINDOW_CLEAR.y)
      )
        continue;
      const z = signWall(facade, ix, iy, half);
      // A wall far behind the door (a farmhouse at the back of its yard) is not the door's sign wall.
      if (z === null || doorZ - z > WALL_BEHIND_DOOR) continue;
      const cost = Math.abs(x - doorX) + Math.abs(yLow - 0.75) * 0.6;
      out.push({ cost, spot: { x, y: yLow, z } });
    }
  }
  out.sort((a, b) => a.cost - b.cost || a.spot.x - b.spot.x || a.spot.y - b.spot.y);
  return out.map((o) => o.spot);
}

/** The depth of the wall a sign with its arm in column `ix`, row `iy` touches, or null when it cannot. */
export function signWall(f: Facade, ix: number, iy: number, half: number): number | null {
  // The plate: a patch of flat wall (the 3 by 3 samples round the arm's foot), the wall the sign touches.
  const sx = f.nx * FACADE_SUB;
  const cj = (iy + Math.floor(SIGN_SIZE.armY * FACADE_CELLS_Y)) * FACADE_SUB + 1;
  const ci = ix * FACADE_SUB + 1;
  const wall = f.buf[cj * sx + ci]!;
  if (wall === -Infinity) return null;
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++)
      if (Math.abs(f.buf[(cj + dj) * sx + ci + di]! - wall) > FACADE_TOUCH) return null;
  // In front of the wall, under the board and rail: nothing proud.
  const rows = Math.ceil(SIGN_SIZE.h * FACADE_CELLS_Y);
  for (let jy = iy; jy < iy + rows; jy++)
    for (let jx = ix - half; jx <= ix + half; jx++) {
      const hi = f.zMax[jy * f.nx + jx]!;
      if (!Number.isNaN(hi) && hi > wall + FACADE_PROUD) return null;
    }
  return wall;
}
