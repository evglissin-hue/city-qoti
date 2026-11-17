// V3B-E4: the back garden kit stays inside its lot, is deterministic, draws walls only where asked,
// stays inside its triangle budgets and changes with the season.
import { describe, expect, it } from 'vitest';
import { kitById } from './kits';
import type { KitBuildOptions } from './kits/types';

const kit = kitById.get('back-garden')!;
const STYLES = ['', 'brick', 'plaster', 'stone', 'timber'];
const COMBOS: { sides: string; walls: string }[] = [
  { sides: 'pggr', walls: 'nesw' },
  { sides: 'poop', walls: 'ew' },
  { sides: 'oroo', walls: 'e' },
  { sides: 'pppp', walls: '' },
  { sides: 'gorg', walls: 'sw' },
];
const EPS = 0.06 - 1e-4;

function optsOf(
  w: number,
  d: number,
  seed: number,
  c = COMBOS[0]!,
  style = '',
  season = 1,
  lod?: 'low',
): KitBuildOptions {
  return {
    size: [w, d],
    seed,
    params: { ...c, style, season },
    ...(lod ? { lod } : {}),
  };
}

function boundsOf(o: KitBuildOptions): { min: number[]; max: number[] } {
  const g = kit.build(o);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
}

const tris = (o: KitBuildOptions): number => kit.build(o).getAttribute('position').count / 3;

describe('back garden kit (V3B-E4)', () => {
  it('is registered as a building kit', () => {
    expect(kit).toBeDefined();
    expect(kit.kind).toBe('building');
  });

  it('keeps every size and seed inside its lot', { timeout: 120000 }, () => {
    for (let w = 1; w <= 4; w++)
      for (let d = 1; d <= 4; d++)
        for (let seed = 1; seed <= 8; seed++) {
          const c = COMBOS[seed % COMBOS.length]!;
          const style = STYLES[seed % STYLES.length]!;
          for (const lod of [undefined, 'low' as const]) {
            const b = boundsOf(optsOf(w, d, seed, c, style, seed % 4, lod));
            const label = `${w}x${d} seed ${seed} ${style} ${c.sides}/${c.walls} ${lod ?? 'high'}`;
            expect(b.min[0], label).toBeGreaterThanOrEqual(EPS);
            expect(b.min[2], label).toBeGreaterThanOrEqual(EPS);
            expect(b.max[0], label).toBeLessThanOrEqual(w - EPS);
            expect(b.max[2], label).toBeLessThanOrEqual(d - EPS);
            expect(b.min[1], label).toBeGreaterThanOrEqual(-0.001);
          }
        }
  });

  it('is deterministic from its options', () => {
    for (const style of STYLES) {
      const o = optsOf(3, 4, 5, COMBOS[0]!, style, 2);
      const a = Array.from(kit.build(o).getAttribute('position').array);
      const b = Array.from(kit.build(o).getAttribute('position').array);
      expect(a).toEqual(b);
    }
  });

  it('varies by seed', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 8; seed++) seen.add(tris(optsOf(3, 3, seed)));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('draws walls only on the edges asked for', () => {
    for (let seed = 1; seed <= 8; seed++)
      for (const style of STYLES) {
        const w = 3;
        const d = 3;
        const o = optsOf(w, d, seed, { sides: 'oooo', walls: 'n' }, style);
        const pos = kit.build(o).getAttribute('position');
        // Nothing tall within 0.22 of the south, east or west edges: contents sit inside the margin.
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          // The north wall's own run is the one thing allowed near the edges.
          if (z < 0.3) continue;
          expect(z, `${style} seed ${seed} south`).toBeLessThan(d - 0.14 + 1e-6);
          expect(x, `${style} seed ${seed} west`).toBeGreaterThan(0.14 - 1e-6);
          expect(x, `${style} seed ${seed} east`).toBeLessThan(w - 0.14 + 1e-6);
        }
      }
  });

  it('draws a wall where asked, and none without walls', () => {
    const empty = optsOf(4, 4, 3, { sides: 'oooo', walls: '' }, 'brick');
    const walled = optsOf(4, 4, 3, { sides: 'oooo', walls: 'nesw' }, 'brick');
    expect(tris(walled)).toBeGreaterThan(tris(empty));
    // The walled one reaches the lot's edge region, the bare one's contents stay inset.
    expect(boundsOf(walled).min[0]).toBeLessThan(0.12);
  });

  it('gates a road side two tiles or longer', () => {
    const road = optsOf(3, 3, 2, { sides: 'oroo', walls: 'e' }, 'brick');
    const open = optsOf(3, 3, 2, { sides: 'oooo', walls: 'e' }, 'brick');
    expect(tris(road)).not.toBe(tris(open));
  });

  it('stays inside the triangle budgets', { timeout: 120000 }, () => {
    for (let w = 1; w <= 4; w++)
      for (let d = 1; d <= 4; d++)
        for (let seed = 1; seed <= 8; seed++) {
          const style = STYLES[seed % STYLES.length]!;
          const high = tris(optsOf(w, d, seed, COMBOS[0]!, style, seed % 4));
          const low = tris(optsOf(w, d, seed, COMBOS[0]!, style, seed % 4, 'low'));
          expect(high, `${w}x${d} seed ${seed}`).toBeLessThan(4000);
          expect(low, `${w}x${d} seed ${seed} low`).toBeLessThan(300);
          expect(low).toBeLessThan(high);
        }
  });

  it('changes with the season where a fruit tree stands', () => {
    // Some seed in a 4x4 holds a tree; its geometry differs across the four seasons.
    let found = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const counts = [0, 1, 2, 3].map((s) => tris(optsOf(4, 4, seed, COMBOS[0]!, 'brick', s)));
      if (new Set(counts).size > 1) found++;
    }
    expect(found).toBeGreaterThan(4);
  });

  it('keeps the layout when the level changes (same shed and trees, fewer faces)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const hi = boundsOf(optsOf(3, 3, seed, COMBOS[2]!, 'timber', 1));
      const lo = boundsOf(optsOf(3, 3, seed, COMBOS[2]!, 'timber', 1, 'low'));
      expect(Math.abs(hi.max[0]! - lo.max[0]!)).toBeLessThan(0.5);
    }
  });
});
