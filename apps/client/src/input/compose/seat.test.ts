import { content } from '@qoti/content';
import { DECOR_ROTATIONS, TILE_FP } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { DIR_COS, DIR_SIN } from '../../../../../packages/sim/src/map/directions';
import type { WorldState } from '../../../../../packages/sim/src/contracts';
import { reader } from '../../../../../packages/sim/test/helpers';
import { road, standardWorld } from '../../../../../packages/sim/test/hearth/helpers';
import { isFacingSeat, SEAT_FRONT_OFFSET, seatRotation } from './seat';

const c = (t: number) => t * TILE_FP + TILE_FP / 2;

/**
 * The world direction a seat's front looks along at a rotation. The art builds every bench with
 * its back to local +z; rotation k turns local +x to (cos k, sin k), so the back is a quarter turn
 * on from that and the front a quarter turn behind it.
 */
function frontOf(rot: number): [number, number] {
  const k = (rot - SEAT_FRONT_OFFSET + DECOR_ROTATIONS) % DECOR_ROTATIONS;
  return [DIR_COS[k]! / 16384, DIR_SIN[k]! / 16384];
}

/** Fills a box of tiles with occupants, except the listed tiles. */
function closeIn(w: WorldState, x0: number, z0: number, x1: number, z1: number, except: [number, number][]) {
  const size = reader(w).size;
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      if (except.some(([ex, ez]) => ex === x && ez === z)) continue;
      w.map.occupant[z * size + x] = 1;
    }
}

describe('a seat faces what is worth looking at', () => {
  it('knows which pieces are seats that face something', () => {
    const ids = content.decor.filter(isFacingSeat).map((d) => d.id);
    expect(ids).toContain('bench');
    expect(ids).toContain('curved-bench');
    expect(ids).not.toContain('ring-bench');
    expect(ids).not.toContain('planter-wall');
  });

  it('a bench beside the river faces the river', () => {
    const w = standardWorld();
    // The river runs along x = 100 and 101; the bench is on the east-facing bank at tile 98.
    const east = seatRotation(reader(w), c(98), c(50));
    expect(east).toBe(16);
    const [ex, ez] = frontOf(east!);
    expect(ex).toBeGreaterThan(0.99);
    expect(Math.abs(ez)).toBeLessThan(0.01);
    // On the far bank the front looks west.
    const west = seatRotation(reader(w), c(103), c(50));
    expect(frontOf(west!)[0]).toBeLessThan(-0.99);
  });

  it('water out of range is not worth facing, and an even field has no open side', () => {
    const w = standardWorld();
    expect(seatRotation(reader(w), c(94), c(50))).toBeNull();
  });

  it('faces the open side when the other sides are closed in', () => {
    const w = standardWorld();
    closeIn(w, 46, 46, 54, 54, [
      [50, 50],
      [51, 50],
      [52, 50],
      [53, 50],
    ]);
    const rot = seatRotation(reader(w), c(50), c(50));
    expect(rot).toBe(16);
    expect(frontOf(rot!)[0]).toBeGreaterThan(0.99);
  });

  it('else faces the nearest path', () => {
    const w = standardWorld();
    closeIn(w, 46, 46, 54, 54, [
      [50, 50],
      [50, 52],
    ]);
    road(w, 'path', 50, 52, 50, 52);
    // The path is two tiles south: the front looks south (+z).
    const rot = seatRotation(reader(w), c(50), c(50));
    expect(rot).toBe(32);
    expect(frontOf(rot!)[1]).toBeGreaterThan(0.99);
  });
});
