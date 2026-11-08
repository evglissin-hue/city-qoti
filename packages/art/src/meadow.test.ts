// P1: the meadow tuft kit (fluffy, curved, gradient blades with seed-head stalks), the lawn tuft and
// the grass surface tag the foliage shader reads for sway and the seasons.
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { ShapeBuilder } from './geometry';
import { kitById } from './kits';
import { SURFACE } from './surface';

const SEEDS = [101, 114, 127, 3, 99];
const tris = (g: BufferGeometry): number => g.getAttribute('position').count / 3;
const build = (id: string, seed: number, lod?: 'low') =>
  kitById.get(id)!.build({ seed, ...(lod ? { lod } : {}) });

/** Distinct colors along the height: the lowest vertices against the highest ones. */
function footAndTip(g: BufferGeometry): { foot: number; tip: number } {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  let maxY = 0;
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
  const lum = (i: number) => col.getX(i) * 0.2126 + col.getY(i) * 0.7152 + col.getZ(i) * 0.0722;
  let foot = 0;
  let nf = 0;
  let tip = 0;
  let nt = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < maxY * 0.08) {
      foot += lum(i);
      nf++;
    } else if (y > maxY * 0.7) {
      tip += lum(i);
      nt++;
    }
  }
  return { foot: foot / Math.max(1, nf), tip: tip / Math.max(1, nt) };
}

describe('meadow tuft kit (P1)', () => {
  it('is registered, 0.16 to 0.32 tall in its blades, with seed stalks standing a little above', () => {
    expect(kitById.get('meadow-tuft')).toBeDefined();
    for (const seed of SEEDS) {
      const g = build('meadow-tuft', seed);
      const top = g.boundingBox!.max.y;
      expect(top, `seed ${seed}`).toBeGreaterThan(0.15);
      expect(top, `seed ${seed}`).toBeLessThan(0.4);
    }
    const tallest = Math.max(...SEEDS.map((s) => build('meadow-tuft', s).boundingBox!.max.y));
    expect(tallest).toBeGreaterThan(0.3);
  });

  it('keeps its triangles inside a per-kit limit at both levels', () => {
    for (const seed of SEEDS) {
      const high = tris(build('meadow-tuft', seed));
      const low = tris(build('meadow-tuft', seed, 'low'));
      // 10 to 14 blades of up to 10 triangles, and up to three 8-triangle stalks.
      expect(high, `high ${seed}`).toBeLessThanOrEqual(140);
      expect(high, `high ${seed}`).toBeGreaterThanOrEqual(60);
      // Five single-segment blades, two sides each.
      expect(low, `low ${seed}`).toBe(10);
    }
  });

  it('draws a blade as 2, 6 or 10 triangles for 1, 2 or 3 segments, tapering to a point', () => {
    for (const [segments, expected] of [
      [1, 2],
      [2, 6],
      [3, 10],
    ] as const) {
      const g = new ShapeBuilder()
        .grassBlade(0, 0, 0.3, 0.04, 0.1, 0, 0x335522, 0xccdd88, segments)
        .build(false);
      expect(tris(g)).toBe(expected);
      expect(g.boundingBox!.max.y).toBeCloseTo(0.3, 3);
      // One vertex at the tip: nothing else reaches the top.
      const pos = g.getAttribute('position');
      let atTop = 0;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.299) atTop++;
      expect(atTop).toBe(2);
    }
  });

  it('runs from a deeper foot to a lighter tip (a gradient in the vertex colors)', () => {
    for (const seed of SEEDS) {
      for (const id of ['meadow-tuft', 'grass-tuft']) {
        const { foot, tip } = footAndTip(build(id, seed));
        expect(tip, `${id} ${seed}`).toBeGreaterThan(foot * 1.25);
      }
    }
    // The far level keeps the gradient.
    const { foot, tip } = footAndTip(build('meadow-tuft', 101, 'low'));
    expect(tip).toBeGreaterThan(foot * 1.25);
  });

  it('tags every vertex of the tufts with the grass surface, for sway and the seasons', () => {
    for (const id of ['meadow-tuft', 'grass-tuft', 'fern']) {
      const s = build(id, 5).getAttribute('surface');
      expect(s.count).toBeGreaterThan(0);
      let grass = 0;
      for (let i = 0; i < s.count; i++) if (s.getX(i) === SURFACE.grass) grass++;
      expect(grass, id).toBeGreaterThan(s.count * 0.7);
    }
    const s = build('meadow-tuft', 101).getAttribute('surface');
    for (let i = 0; i < s.count; i++) expect(s.getX(i)).toBe(SURFACE.grass);
  });

  it('bends blades outward and shades them from above', () => {
    const g = build('meadow-tuft', 101);
    const pos = g.getAttribute('position');
    let reach = 0;
    for (let i = 0; i < pos.count; i++) reach = Math.max(reach, Math.hypot(pos.getX(i), pos.getZ(i)));
    expect(reach).toBeGreaterThan(0.06);
    const nor = g.getAttribute('normal');
    for (let i = 0; i < nor.count; i++) expect(nor.getY(i)).toBeGreaterThan(0.3);
  });

  it('builds the same tuft for the same seed', () => {
    const a = build('meadow-tuft', 114).getAttribute('position').array;
    const b = build('meadow-tuft', 114).getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
