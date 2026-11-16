// V3C: the river's data: the dawn haze map, the course for the endpaper map, the per-vertex flow
// direction (downstream) and the foam weight around a bridge.
import { MAP_SIZE } from '@qoti/sim';
import { Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { RIVER_HAZE_SIZE } from '../lighting';
import { SurfaceTiles, type SurfaceReader } from '../surface';
import { flowAt, riverCourse, riverNearness, waterGeometry } from './water';

type WaterFn = (x: number, z: number) => number;

/** A flat valley with the given water and roads. */
function valley(water: WaterFn, roads: Set<number> = new Set(), flow: 'ns' | 'we' = 'ns') {
  const r: SurfaceReader & { road(x: number, z: number): number; meta: { flow: string } } = {
    height: () => 0,
    water,
    occupant: () => 0,
    road: (x, z) => (roads.has(z * MAP_SIZE + x) ? 1 : 0),
    meta: { flow },
  };
  return r;
}

const straight: WaterFn = (x) => (x >= 90 && x < 96 ? 1 : 0);
/** Slants east as it runs south: the center sits at 40 + 0.4 z, six tiles wide across x. */
const slanted: WaterFn = (x, z) => (Math.abs(x + 0.5 - (40 + 0.4 * z)) <= 3 ? 1 : 0);

describe('river nearness for the haze', () => {
  const n = riverNearness({ water: straight });
  const at = (tileX: number) => n[10 * RIVER_HAZE_SIZE + Math.floor(tileX / 3)]!;

  it('is one byte per texel, 255 over water and 0 far from it', () => {
    expect(n.length).toBe(RIVER_HAZE_SIZE * RIVER_HAZE_SIZE);
    expect(at(92)).toBe(255);
    expect(at(10)).toBe(0);
    expect(at(180)).toBe(0);
  });

  it('falls off smoothly and monotonically with distance, gone by about ten tiles', () => {
    let prev = 256;
    for (let x = 96; x < 130; x += 3) {
      expect(at(x)).toBeLessThanOrEqual(prev);
      prev = at(x);
    }
    expect(at(96 + 12)).toBe(0);
    expect(at(96 + 4)).toBeGreaterThan(0);
    expect(at(96 + 4)).toBeLessThan(255);
  });

  it('is all zero with no water', () => {
    expect(riverNearness({ water: () => 0 }).every((v) => v === 0)).toBe(true);
  });
});

describe('river course for the map', () => {
  it('runs a straight river from edge to edge in flow order with its width', () => {
    const c = riverCourse({ water: straight });
    const n = c.widths.length;
    expect(n).toBeGreaterThan(MAP_SIZE / 4);
    expect(c.points.length).toBe(n * 2);
    expect(c.points[1]).toBeLessThan(2);
    expect(c.points[n * 2 - 1]).toBeGreaterThan(MAP_SIZE - 2);
    for (let k = 0; k < n; k++) {
      expect(c.points[k * 2]).toBeCloseTo(93, 5);
      expect(c.widths[k]).toBeCloseTo(6, 5);
      if (k > 0) {
        expect(c.points[k * 2 + 1]! - c.points[k * 2 - 1]!).toBeGreaterThan(1.9);
        expect(c.points[k * 2 + 1]! - c.points[k * 2 - 1]!).toBeLessThanOrEqual(4);
      }
    }
  });

  it('follows a bent river and shortens the width to the true cross section', () => {
    const c = riverCourse({ water: slanted });
    const n = c.widths.length;
    expect(n).toBeGreaterThan(20);
    const first = n > 0 ? c.points[0]! : 0;
    const last = c.points[(n - 1) * 2]!;
    expect(last).toBeGreaterThan(first + 20);
    for (let k = 1; k < n; k++) {
      expect(c.points[k * 2 + 1]!).toBeGreaterThan(c.points[k * 2 - 1]!);
      expect(c.points[k * 2]!).toBeGreaterThanOrEqual(c.points[k * 2 - 2]!);
    }
    const mid = c.widths[Math.floor(n / 2)]!;
    // About 6 * cos(atan(0.4)) = 5.57, within the tile grid's rounding.
    expect(mid).toBeGreaterThan(4.8);
    expect(mid).toBeLessThan(6);
  });

  it('finds a west to east river by its extent', () => {
    const c = riverCourse({ water: (_x, z) => (z >= 50 && z < 54 ? 1 : 0) });
    expect(c.points[0]).toBeLessThan(2);
    expect(c.points[c.points.length - 2]).toBeGreaterThan(MAP_SIZE - 2);
    expect(c.points[1]).toBeCloseTo(52, 5);
    expect(c.widths[0]).toBeCloseTo(4, 5);
  });

  it('is empty with no water', () => {
    expect(riverCourse({ water: () => 0 }).points.length).toBe(0);
  });
});

describe('river chunks', () => {
  const bridgeTile = 42 * MAP_SIZE + 92;
  const roads = new Set([bridgeTile]);

  it('flow runs downstream along a straight river', () => {
    const v = new Vector2();
    flowAt({ water: straight }, 93, 40, new Vector2(0, 1), v);
    expect(v.y).toBeGreaterThan(0.9);
    // On the bank, where the gradient is strong, it still runs along it, downstream.
    flowAt({ water: straight }, 90, 40, new Vector2(0, 1), v);
    expect(v.y).toBeGreaterThan(0.9);
    expect(Math.abs(v.x)).toBeLessThan(0.2);
    flowAt({ water: straight }, 96, 40, new Vector2(0, 1), v);
    expect(v.y).toBeGreaterThan(0.9);
  });

  it('gives every vertex a downstream flow, with the flow axis the other way round', () => {
    const tiles = new SurfaceTiles(valley(straight));
    const g = waterGeometry(tiles, 5, 2)!;
    const f = g.getAttribute('wflow');
    expect(f.count).toBeGreaterThan(100);
    for (let i = 0; i < f.count; i++) {
      expect(f.getY(i)).toBeGreaterThan(0.8);
      expect(Math.abs(f.getX(i))).toBeLessThan(0.3);
    }
    const sideways = new SurfaceTiles(valley((_x, z) => (z >= 90 && z < 96 ? 1 : 0), new Set(), 'we'));
    const h = waterGeometry(sideways, 2, 5)!;
    const hf = h.getAttribute('wflow');
    for (let i = 0; i < hf.count; i++) expect(hf.getX(i)).toBeGreaterThan(0.8);
  });

  it('puts foam at a bridge, trailing downstream, and none far away or upstream', () => {
    const tiles = new SurfaceTiles(valley(straight, roads));
    const g = waterGeometry(tiles, 5, 2)!;
    const p = g.getAttribute('position');
    const foam = g.getAttribute('wfoam');
    let under = 0;
    let down = 0;
    let up = 0;
    let far = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      if (x >= 92 && x <= 93 && z >= 42 && z <= 43) under = Math.max(under, foam.getX(i));
      if (x >= 92 && x <= 93 && z >= 43.5 && z <= 44) down = Math.max(down, foam.getX(i));
      if (x >= 92 && x <= 93 && z >= 41 && z <= 41.5) up = Math.max(up, foam.getX(i));
      if (z < 38) far = Math.max(far, foam.getX(i));
    }
    expect(under).toBeGreaterThan(0.95);
    expect(down).toBeGreaterThan(0.3);
    expect(up).toBeLessThan(0.05);
    expect(far).toBe(0);
  });

  it('has no foam without a bridge', () => {
    const g = waterGeometry(new SurfaceTiles(valley(straight)), 5, 2)!;
    const foam = g.getAttribute('wfoam');
    for (let i = 0; i < foam.count; i++) expect(foam.getX(i)).toBe(0);
  });
});
