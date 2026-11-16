// V3B: the synthetic streets scene is laid out right and reads as R2's lots through lotsFor.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { footprintSize, MAP_SIZE, Road } from '@qoti/sim';
import { Mirror } from '../state/mirror';
import { lotsFor } from './lots';
import { STEPPED_STOREYS, streetsShowcase } from './streetsShowcase';

const N = MAP_SIZE;

function scene() {
  const mirror = new Mirror();
  const result = streetsShowcase(mirror);
  const { lots, rows, fromSim } = lotsFor(mirror);
  return { mirror, result, lots, rows, fromSim };
}

const inside = (
  a: { x: number; z: number; w: number; d: number },
  b: { x: number; z: number; w: number; d: number },
) => a.x >= b.x && a.z >= b.z && a.x + a.w <= b.x + b.w && a.z + a.d <= b.z + b.d;
const overlap = (
  a: { x: number; z: number; w: number; d: number },
  b: { x: number; z: number; w: number; d: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

describe('streetsShowcase', () => {
  it('makes the lots, buildings and gardens it reports, and reads as sim lots', () => {
    const { mirror, result, lots, rows, fromSim } = scene();
    expect(fromSim).toBe(true);
    expect(result.buildings).toBe(mirror.buildings.size);
    expect(result.lots).toBe(mirror.lots.size);
    expect(lots.filter((l) => l.kind === 'garden')).toHaveLength(result.gardens);
    expect(result.gardens).toBe(8);
    expect(lots.every((l) => l.rowSource === 'sim' && l.row > 0)).toBe(true);
    expect(rows.get(5)).toHaveLength(24);
    expect(result.center[0]).toBeGreaterThan(0);
  });

  it('puts every plot building inside its lot, entrance at the lot front', () => {
    const { mirror, lots } = scene();
    for (const l of lots.filter((x) => x.kind === 'plot')) {
      const b = mirror.buildings.get(l.buildingId)!;
      expect(b.lot).toBe(l.id);
      const [w, d] = footprintSize(content.buildingById.get(b.def)!, b.rot);
      expect(inside({ x: b.x, z: b.z, w, d }, l)).toBe(true);
      const front = { 0: l.z + l.d - 1, 2: l.z, 1: l.x, 3: l.x + l.w - 1 }[b.rot];
      const tiles = b.rot % 2 === 0 ? [b.z, b.z + d - 1] : [b.x, b.x + w - 1];
      expect(tiles).toContain(front);
      for (let z = b.z; z < b.z + d; z++)
        for (let x = b.x; x < b.x + w; x++) expect(mirror.occupant(x, z)).toBe(b.id);
    }
  });

  it('keeps gardens small, empty, off every plot and inside the block hollow', () => {
    const { lots } = scene();
    const gardens = lots.filter((l) => l.kind === 'garden');
    const plots = lots.filter((l) => l.kind === 'plot');
    for (const g of gardens) {
      expect(g.w).toBeLessThanOrEqual(4);
      expect(g.d).toBeLessThanOrEqual(4);
      expect(g.zone).toBe('');
      expect(g.buildingId).toBe(0);
      for (const p of plots) expect(overlap(g, p)).toBe(false);
      // It backs onto a lot of its own row and rot.
      const backs = plots.some((p) => p.row === g.row && p.rot === g.rot);
      expect(backs).toBe(true);
    }
    for (const a of gardens) for (const b of gardens) if (a !== b) expect(overlap(a, b)).toBe(false);
    // The hollow is the box the rows leave: every garden sits between the plots on all four sides.
    const xs = gardens.flatMap((g) => [g.x, g.x + g.w]);
    const zs = gardens.flatMap((g) => [g.z, g.z + g.d]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    expect(x1 - x0).toBe(8);
    expect(z1 - z0).toBe(4);
  });

  it('never steps storeys by more than one between neighbors, nor above four', () => {
    const { lots, rows } = scene();
    for (const row of rows.values()) {
      const ps = row.filter((l) => l.kind === 'plot');
      for (let i = 1; i < ps.length; i++)
        expect(Math.abs(ps[i]!.storeys - ps[i - 1]!.storeys)).toBeLessThanOrEqual(1);
    }
    for (const l of lots) expect(l.storeys).toBeLessThanOrEqual(4);
    expect(rows.get(5)!.map((l) => l.storeys)).toEqual([...STEPPED_STOREYS]);
  });

  it('gives each corner lot a frontage2 that is a street tile beside it', () => {
    const { mirror, lots } = scene();
    const corners = lots.filter((l) => l.corner);
    expect(corners).toHaveLength(4);
    expect(corners.map((l) => mirror.buildings.get(l.buildingId)!.def).sort()).toEqual([
      'corner-shop',
      'corner-shop',
      'townhouse',
      'townhouse',
    ]);
    for (const l of corners) {
      const f = l.frontage2!;
      const [fx, fz] = [f % N, Math.floor(f / N)];
      expect(mirror.road(fx, fz)).toBe(Road.street);
      const beside =
        (fz >= l.z && fz < l.z + l.d && (fx === l.x - 1 || fx === l.x + l.w)) ||
        (fx >= l.x && fx < l.x + l.w && (fz === l.z - 1 || fz === l.z + l.d));
      expect(beside).toBe(true);
    }
  });

  it('faces every row lot onto a street, and leaves the short row open behind', () => {
    const { mirror, lots, rows } = scene();
    for (const l of lots.filter((x) => x.kind === 'plot')) {
      const mx = l.rot === 3 ? l.x + l.w : l.rot === 1 ? l.x - 1 : l.x;
      const mz = l.rot === 0 ? l.z + l.d : l.rot === 2 ? l.z - 1 : l.z;
      expect(mirror.road(mx, mz)).toBe(Road.street);
    }
    const short = rows.get(6)!;
    expect(short.length).toBeGreaterThan(1);
    for (const l of short) for (let x = l.x; x < l.x + l.w; x++) expect(mirror.road(x, l.z - 1)).toBe(0);
    expect(lots.some((l) => l.kind === 'garden' && l.row === 6)).toBe(false);
  });
});
