// V2C: the far levels of the dozen commonest decor pieces, and the smoke test for every decor kit.
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { content } from '@qoti/content';
import { artKitId, kitById } from './kits';
import { SURFACE } from './surface';

const DOZEN = [
  'barrels',
  'bench',
  'birdbath',
  'crates',
  'fence',
  'flower-bed',
  'herb-planter',
  'lamp-post',
  'lantern',
  'low-wall',
  'planter',
  'wildflower-verge',
];

const tris = (g: BufferGeometry): number => g.getAttribute('position').count / 3;
const build = (id: string, lod?: 'low'): BufferGeometry => kitById.get(id)!.build(lod ? { lod } : {});

function bounds(g: BufferGeometry): number[] {
  const p = g.getAttribute('position');
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = p.getComponent(i, k);
      b[k] = Math.min(b[k]!, v);
      b[k + 3] = Math.max(b[k + 3]!, v);
    }
  }
  return b;
}

function surfaces(g: BufferGeometry): Set<number> {
  const a = g.getAttribute('surface');
  const out = new Set<number>();
  for (let i = 0; i < a.count; i++) out.add(a.getX(i));
  return out;
}

/** Glow height range (min, max) over vertices with glow > 0. */
function glowRange(g: BufferGeometry): [number, number] {
  const p = g.getAttribute('position');
  const a = g.getAttribute('glow');
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (a.getX(i) <= 0) continue;
    lo = Math.min(lo, p.getY(i));
    hi = Math.max(hi, p.getY(i));
  }
  return [lo, hi];
}

describe('decor far levels (V2C)', () => {
  const rows: string[] = [];
  for (const id of DOZEN) {
    it(`${id}: a lean far level with the same silhouette`, () => {
      const hi = build(id);
      const lo = build(id, 'low');
      rows.push(`${id}: ${tris(hi)} near, ${tris(lo)} far`);
      expect(tris(lo), id).toBeLessThanOrEqual(tris(hi) * 0.3);
      expect(tris(lo), id).toBeGreaterThan(0);
      for (const name of Object.keys(hi.attributes)) {
        const a = lo.getAttribute(name);
        expect(a, `${id} ${name}`).toBeDefined();
        expect(a!.itemSize, `${id} ${name}`).toBe(hi.getAttribute(name).itemSize);
      }
      expect(Object.keys(lo.attributes).sort()).toEqual(Object.keys(hi.attributes).sort());
      const bh = bounds(hi);
      const bl = bounds(lo);
      for (let k = 0; k < 6; k++)
        expect(Math.abs(bh[k]! - bl[k]!), `${id} bound ${k}`).toBeLessThanOrEqual(0.06);
    });
  }

  it('the near level carries its V2 surfaces', () => {
    const want: Record<string, number[]> = {
      barrels: [SURFACE.woodGrain, SURFACE.wroughtIron],
      bench: [SURFACE.woodGrain],
      birdbath: [SURFACE.stone],
      crates: [SURFACE.woodGrain, SURFACE.wroughtIron],
      fence: [SURFACE.paintedWood, SURFACE.woodGrain],
      'flower-bed': [SURFACE.stone],
      'herb-planter': [SURFACE.woodGrain],
      'lamp-post': [SURFACE.wroughtIron],
      lantern: [SURFACE.wroughtIron, SURFACE.stone],
      'low-wall': [SURFACE.stone],
      planter: [SURFACE.terracotta],
    };
    for (const [id, ids] of Object.entries(want)) {
      const have = surfaces(build(id));
      for (const s of ids) expect(have.has(s), `${id} near has surface ${s}`).toBe(true);
    }
  });

  it('the far level keeps its main surfaces', () => {
    expect(surfaces(build('barrels', 'low')).has(SURFACE.woodGrain)).toBe(true);
    expect(surfaces(build('lantern', 'low')).has(SURFACE.wroughtIron)).toBe(true);
    expect(surfaces(build('lamp-post', 'low')).has(SURFACE.wroughtIron)).toBe(true);
  });

  it('lit lamps keep their flame at the far level', () => {
    for (const id of ['lantern', 'lamp-post']) {
      const [hl, hh] = glowRange(build(id));
      const [ll, lh] = glowRange(build(id, 'low'));
      expect(Number.isFinite(ll), `${id} far has glow`).toBe(true);
      expect(ll, id).toBeCloseTo(hl, 2);
      expect(lh, id).toBeCloseTo(hh, 2);
    }
  });

  it('prints the table', () => {
    console.log(rows.join('\n'));
  });
});

describe('every decor kit', () => {
  it('builds at both levels', () => {
    for (const d of content.decor) {
      const kit = kitById.get(artKitId(d.art))!;
      expect(kit, d.id).toBeDefined();
      for (const lod of [undefined, 'low'] as const) {
        const g = kit.build({ ...(lod ? { lod } : {}), params: d.art.params ?? {} } as never);
        expect(tris(g), `${d.id} ${lod ?? 'high'}`).toBeGreaterThan(0);
      }
    }
  });
});
