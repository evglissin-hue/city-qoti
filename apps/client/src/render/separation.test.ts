import { describe, expect, it } from 'vitest';
import { SEP_CAP, SeparationField, pushEase } from './separation';

interface Fig {
  id: number;
  x: number;
  z: number;
  h?: number;
  moving?: boolean;
  fixed?: boolean;
}

/** Pushes for every figure of a snapshot, by id. */
function solve(figs: Fig[], carts: [number, number, number][] = []): Map<number, [number, number]> {
  const f = new SeparationField();
  f.begin();
  for (const g of figs) f.add(g.id, g.x, g.z, g.fixed ?? false);
  for (const c of carts) f.addCart(c[0], c[1], c[2]);
  f.build();
  const out = new Map<number, [number, number]>();
  for (const g of figs) {
    f.pushFor(g.id, g.x, g.z, g.h ?? 0, g.moving ?? false, g.fixed ?? false);
    out.set(g.id, [f.px, f.pz]);
  }
  return out;
}

describe('separation', () => {
  it('pushes two overlapping figures at least 0.3 apart', () => {
    for (const dx of [0, 0.05, 0.15, 0.25]) {
      const figs: Fig[] = [
        { id: 4, x: 10, z: 10 },
        { id: 9, x: 10 + dx, z: 10.02 },
      ];
      const p = solve(figs);
      const a = p.get(4)!;
      const b = p.get(9)!;
      const sep = Math.hypot(
        figs[0]!.x + a[0] - (figs[1]!.x + b[0]),
        figs[0]!.z + a[1] - (figs[1]!.z + b[1]),
      );
      expect(sep).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('never moves a sitter, but a stander steps clear of one', () => {
    const p = solve([
      { id: 1, x: 5, z: 5, fixed: true },
      { id: 2, x: 5.1, z: 5 },
    ]);
    expect(p.get(1)).toEqual([0, 0]);
    const s = p.get(2)!;
    expect(Math.hypot(0.1 + s[0], s[1])).toBeGreaterThanOrEqual(0.3);
  });

  it('pushes a walker out of a cart footprint, to the side it is on', () => {
    // A cart rolling toward +z (heading 0) has its right side at +x.
    const right = solve([{ id: 3, x: 20.1, z: 20.2, h: 0, moving: true }], [[20, 20, 0]]).get(3)!;
    const left = solve([{ id: 3, x: 19.9, z: 20.2, h: 0, moving: true }], [[20, 20, 0]]).get(3)!;
    expect(right[0]).toBeGreaterThan(0.1);
    expect(left[0]).toBeLessThan(-0.1);
    const far = solve([{ id: 3, x: 20.1, z: 24, h: 0, moving: true }], [[20, 20, 0]]).get(3)!;
    expect(far).toEqual([0, 0]);
  });

  it('does not depend on input order', () => {
    const figs: Fig[] = [];
    for (let i = 0; i < 40; i++) {
      figs.push({
        id: i + 1,
        x: 30 + ((i * 7) % 11) * 0.09,
        z: 30 + ((i * 5) % 13) * 0.08,
        h: i,
        moving: i % 3 === 0,
      });
    }
    const forward = solve(figs);
    const reversed = solve([...figs].reverse());
    for (const g of figs) {
      const a = forward.get(g.id)!;
      const b = reversed.get(g.id)!;
      expect(a[0]).toBeCloseTo(b[0], 9);
      expect(a[1]).toBeCloseTo(b[1], 9);
    }
  });

  it('caps every push', () => {
    const figs: Fig[] = [];
    for (let i = 0; i < 30; i++) figs.push({ id: i + 1, x: 8 + (i % 3) * 0.01, z: 8 + (i % 2) * 0.01 });
    figs.push({ id: 99, x: 8, z: 8, fixed: true });
    const p = solve(figs, [[8, 8, 0.5]]);
    for (const v of p.values()) expect(Math.hypot(v[0], v[1])).toBeLessThanOrEqual(SEP_CAP + 1e-9);
    expect(Math.max(...[...p.values()].map((v) => Math.hypot(v[0], v[1])))).toBeGreaterThan(0.2);
  });

  it('never pushes a walker ahead of itself', () => {
    const p = solve([
      { id: 1, x: 3, z: 3, h: 0, moving: true },
      { id: 2, x: 3, z: 3.2, h: 0, moving: true },
    ]);
    expect(p.get(2)![1]).toBeGreaterThanOrEqual(0);
    expect(p.get(1)![1]).toBeLessThanOrEqual(0);
  });

  it('eases smoothly', () => {
    expect(pushEase(0)).toBe(0);
    expect(pushEase(0.15)).toBeGreaterThan(0.6);
    expect(pushEase(1)).toBeLessThan(1.0001);
  });
});
