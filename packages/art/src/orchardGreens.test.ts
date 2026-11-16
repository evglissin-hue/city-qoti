// P2-E2: the farms belong to the valley. A farm lot draws no floor of its own (its grass is the
// meadow the terrain paints), only the ground that is really worked, in soft patches; the orchard's
// trees are painted with dabs like the valley's; the shed has painted surfaces; the farmhouse has a
// window on its free gable.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BufferGeometry } from 'three';
import { ShapeBuilder, seeded } from './geometry';
import { kitById } from './kits';
import { businessParams } from './kits/business';
import { orchardTree } from './kits/village';
import { SURFACE } from './surface';

const LOOKS = [
  ['farmhouse', 'wheat'],
  ['vegetable-plot', 'vegetables'],
  ['orchard', 'apples'],
  ['dairy', 'milk'],
  ['sheep-pasture', 'wool'],
  ['apiary', 'honey'],
] as const;
const farmstead = kitById.get('farmstead')!;

function opts(look: string, make: string, level: number, over: Record<string, unknown> = {}, lod?: 'low') {
  const { seed = 3, season = 1, style = 'timber', entrance = [1, 2], ...rest } = over;
  return {
    seed: seed as number,
    size: [3, 3] as [number, number],
    entrance: entrance as [number, number],
    params: { style, season, ...businessParams(look, make, level), ...rest } as Record<
      string,
      string | number | boolean
    >,
    ...(lod ? { lod } : {}),
  };
}

type Tri = { v: [number, number, number][]; surface: number; ny: number };

function trianglesOf(g: BufferGeometry): Tri[] {
  const p = g.getAttribute('position');
  const sf = g.getAttribute('surface');
  const nm = g.getAttribute('normal');
  const idx = g.index;
  const n = (idx ? idx.count : p.count) / 3;
  const out: Tri[] = [];
  for (let t = 0; t < n; t++) {
    const v: [number, number, number][] = [];
    for (let c = 0; c < 3; c++) {
      const i = idx ? idx.getX(t * 3 + c) : t * 3 + c;
      v.push([p.getX(i), p.getY(i), p.getZ(i)]);
    }
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    out.push({ v, surface: sf ? sf.getX(i0) : 0, ny: nm.getY(i0) });
  }
  return out;
}

/** Flat, ground-hugging triangles (every corner under 0.03, facing up): the lot's own ground. */
function groundPatches(g: BufferGeometry): { area: number; dx: number; dz: number }[] {
  const flat = trianglesOf(g).filter((t) => t.ny > 0.9 && t.v.every((c) => c[1] <= 0.03));
  // Connected components by shared corners (to a thousandth of a tile).
  const key = (c: number[]): string => `${Math.round(c[0]! * 1000)},${Math.round(c[2]! * 1000)}`;
  const parent = flat.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const owner = new Map<string, number>();
  flat.forEach((t, i) =>
    t.v.forEach((c) => {
      const k = key(c);
      const o = owner.get(k);
      if (o === undefined) owner.set(k, i);
      else parent[find(i)] = find(o);
    }),
  );
  const groups = new Map<number, Tri[]>();
  flat.forEach((t, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), t]));
  return [...groups.values()].map((ts) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let area = 0;
    for (const t of ts) {
      for (const c of t.v) {
        x0 = Math.min(x0, c[0]);
        x1 = Math.max(x1, c[0]);
        z0 = Math.min(z0, c[2]);
        z1 = Math.max(z1, c[2]);
      }
      const a = t.v[0]!;
      const b = t.v[1]!;
      const c = t.v[2]!;
      area += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2;
    }
    return { area, dx: x1 - x0, dz: z1 - z0 };
  });
}

describe('P2-E2: no lot floor', () => {
  describe.each(LOOKS)('%s', (look, make) => {
    it('draws no ground that spans the lot, near or far, at any level or season', () => {
      for (const level of [1, 2, 3])
        for (const season of [0, 1, 2, 3])
          for (const lod of [undefined, 'low'] as const) {
            const g = farmstead.build(opts(look, make, level, { season }, lod));
            const patches = groundPatches(g);
            const tag = `${look} L${level} s${season} ${lod ?? 'near'}`;
            // No single patch reaches across the lot (3 by 3 tiles), however it is cut.
            for (const p of patches) {
              expect(p.dx < 2.3 || p.dz < 2.3, `${tag} patch ${p.dx.toFixed(2)} x ${p.dz.toFixed(2)}`).toBe(
                true,
              );
              expect(p.area, tag).toBeLessThan(3);
            }
            expect(
              patches.reduce((a, p) => a + p.area, 0),
              tag,
            ).toBeLessThan(3.6);
          }
    });
  });

  it('the orchard draws only a small ring of earth round each trunk (near) and nothing far', () => {
    for (const level of [1, 2, 3]) {
      const near = groundPatches(farmstead.build(opts('orchard', 'apples', level)));
      const trees = [4, 6, 9][level - 1]!;
      const rings = near.filter((p) => p.dx < 0.6 && p.dz < 0.6);
      expect(rings.length, `L${level} rings`).toBeGreaterThanOrEqual(trees);
      for (const p of near) expect(Math.max(p.dx, p.dz), `L${level} patch`).toBeLessThan(1.7);
      // The yard by the door is the one bigger patch, and it is not a rectangle's worth of lot.
      const far = groundPatches(farmstead.build(opts('orchard', 'apples', level, {}, 'low')));
      expect(far.filter((p) => p.dx < 0.6 && p.dz < 0.6).length, `L${level} far rings`).toBe(0);
    }
  });
});

describe('P2-E2: the orchard tree is painted', () => {
  afterEach(() => vi.restoreAllMocks());

  const near = (season: number, light = false): { g: BufferGeometry; blobs: number[][] } => {
    const blobs: number[][] = [];
    const real = ShapeBuilder.prototype.blob;
    const spy = vi.spyOn(ShapeBuilder.prototype, 'blob').mockImplementation(function (
      this: ShapeBuilder,
      ...a: Parameters<typeof real>
    ) {
      blobs.push([a[3], a[7] ?? 1]);
      return real.apply(this, a);
    });
    const s = new ShapeBuilder('high');
    orchardTree(s, 0, 0, 1, season, seeded(5), light);
    const g = s.build();
    spy.mockRestore();
    return { g, blobs };
  };

  it.each([0, 1, 2])('carries the dab surface and no detail-1 blob crown in season %i', (season) => {
    for (const light of [false, true]) {
      const { g, blobs } = near(season, light);
      const leaf = trianglesOf(g).filter((t) => t.surface === SURFACE.leaf).length;
      expect(leaf, `leaf triangles (light ${light})`).toBeGreaterThan(light ? 20 : 50);
      // Any blob as big as a crown is the low-poly core under the dabs (detail 0), never a faceted crown.
      for (const [rx, detail] of blobs) if (rx! >= 0.1) expect(detail).toBe(0);
    }
  });

  it('blossoms in spring as dabs (pink among the greens), not as diamonds', () => {
    const { g } = near(0);
    const col = g.getAttribute('color');
    let pink = 0;
    let green = 0;
    for (const t of trianglesOf(g).keys()) {
      const r = col.getX(t * 3);
      const gr = col.getY(t * 3);
      const b = col.getZ(t * 3);
      if (r > gr && b > gr * 0.6 && r > 0.5) pink++;
      if (gr > r && gr > b) green++;
    }
    expect(pink).toBeGreaterThan(8);
    expect(green).toBeGreaterThan(pink);
    // The crown is dabs: a few hundred small leaf triangles.
    const leafTris = trianglesOf(g).filter((t) => t.surface === SURFACE.leaf).length;
    expect(leafTris).toBeGreaterThan(80);
  });

  it('is a bare tree in winter: boughs and twigs, no leaf surface, no crown', () => {
    const { g, blobs } = near(3);
    expect(trianglesOf(g).filter((t) => t.surface === SURFACE.leaf).length).toBe(0);
    expect(blobs.length).toBe(0);
    const top = trianglesOf(g).reduce((m, t) => Math.max(m, ...t.v.map((c) => c[1])), 0);
    expect(top).toBeGreaterThan(0.55);
  });

  it('keeps the far level small and painted, in every season', () => {
    for (const season of [0, 1, 2, 3]) {
      const s = new ShapeBuilder('low');
      orchardTree(s, 0, 0, 1, season, seeded(5));
      const g = s.build();
      expect(g.getAttribute('position').count / 3, `season ${season}`).toBeLessThanOrEqual(20);
      if (season !== 3) expect(trianglesOf(g).some((t) => t.surface === SURFACE.leaf)).toBe(true);
    }
  });

  it('the farmstead orchard draws no crown-sized detail-1 blob at any level or season', () => {
    const sizes: [number, number][] = [];
    const real = ShapeBuilder.prototype.blob;
    vi.spyOn(ShapeBuilder.prototype, 'blob').mockImplementation(function (
      this: ShapeBuilder,
      ...a: Parameters<typeof real>
    ) {
      sizes.push([a[3], a[7] ?? 1]);
      return real.apply(this, a);
    });
    for (const level of [1, 2, 3])
      for (const season of [0, 1, 2, 3]) farmstead.build(opts('orchard', 'apples', level, { season }));
    expect(sizes.length).toBeGreaterThan(0);
    for (const [rx, detail] of sizes) if (rx >= 0.1) expect(detail).toBe(0);
  });

  it('the grown cottage side garden uses the same painted tree', () => {
    const cottage = kitById.get('cottage')!;
    let leaf = 0;
    for (let seed = 1; seed <= 40; seed++)
      leaf += trianglesOf(
        cottage.build({ seed, size: [3, 2], entrance: [0, 1], params: { style: 'timber', season: 1 } }),
      ).filter((t) => t.surface === SURFACE.leaf).length;
    expect(leaf).toBeGreaterThan(0);
  });
});

describe('P2-E2: the shed', () => {
  it('has board walls and a courses roof, the same surfaces as the other buildings', () => {
    for (const [look, make] of [
      ['orchard', 'apples'],
      ['apiary', 'honey'],
    ] as const) {
      const g = farmstead.build(opts(look, make, 1, { entrance: [1, 2] }));
      // The shed stands at the back left (x 0.1 to 1.1, z 0.1 to 0.8).
      const inShed = trianglesOf(g).filter((t) => {
        const cx = (t.v[0]![0] + t.v[1]![0] + t.v[2]![0]) / 3;
        const cz = (t.v[0]![2] + t.v[1]![2] + t.v[2]![2]) / 3;
        const top = Math.max(...t.v.map((c) => c[1]));
        return cx > 0.1 && cx < 1.1 && cz > 0.1 && cz < 0.8 && top > 0.05 && top < 0.9;
      });
      const bySurface = new Map<number, number>();
      for (const t of inShed) bySurface.set(t.surface, (bySurface.get(t.surface) ?? 0) + 1);
      const total = inShed.length;
      expect(total, look).toBeGreaterThan(15);
      const plain = bySurface.get(SURFACE.plain) ?? 0;
      expect(plain / total, `${look} plain share`).toBeLessThan(0.5);
      expect(bySurface.get(SURFACE.timber) ?? 0, `${look} walls`).toBeGreaterThan(4);
      const roof = (bySurface.get(SURFACE.tile) ?? 0) + (bySurface.get(SURFACE.thatch) ?? 0);
      expect(roof, `${look} roof courses`).toBeGreaterThan(8);
    }
  });
});

describe('P2-E2: the farmhouse has a window on its free gable', () => {
  it.each([
    [1, [1, 2]],
    [2, [1, 2]],
    [3, [2, 2]],
  ] as const)('level %i, entrance %j', (level, entrance) => {
    for (const [look, make] of LOOKS) {
      const o = opts(look, make, level, { entrance: [...entrance] });
      const left = entrance[0] + 0.5 <= 3 / 2 + 0.01;
      const hw = level === 1 ? 0.95 : 1.15;
      // The house's gable wall that faces the yard, not the lot's edge.
      const plane = left ? 0.16 + hw : 3 - (0.16 + hw);
      const lights = farmstead.anchors!(o).lights ?? [];
      const onGable = lights.filter((p) => Math.abs(p[0] - plane) < 0.2 && p[2] > 1.7 && p[2] < 2.55);
      expect(onGable.length, `${look} L${level}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('P2-E2: budgets', () => {
  it('every farm look stays inside the kit budgets in every style, seed and season', () => {
    const tris = (o: ReturnType<typeof opts>): number =>
      farmstead.build(o).getAttribute('position').count / 3;
    for (const [look, make] of LOOKS)
      for (const level of [1, 2, 3])
        for (const style of ['brick', 'stone', 'timber', 'plaster'])
          for (const seed of [1, 2, 3])
            for (const season of [0, 1, 2, 3]) {
              const tag = `${look} L${level} ${style} seed ${seed} season ${season}`;
              const o = opts(look, make, level, { style, seed, season });
              expect(tris(o), tag).toBeLessThanOrEqual(level === 1 ? 3000 : 4000);
              expect(tris({ ...o, lod: 'low' }), tag).toBeLessThanOrEqual(250);
            }
  });
});
