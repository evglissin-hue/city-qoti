// V2X: the orchard trees' dab thinning (`params.thin`) only removes; at 1 the geometry is unchanged.
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { kitById } from './kits';

const tris = (g: BufferGeometry): number => g.getAttribute('position').count / 3;
const verts = (g: BufferGeometry): string[] => {
  const p = g.getAttribute('position');
  const out: string[] = [];
  for (let i = 0; i < p.count; i++) out.push(`${p.getX(i)},${p.getY(i)},${p.getZ(i)}`);
  return out;
};

describe.each(['apple-tree', 'cherry-tree'])('%s thinning', (id) => {
  const kit = kitById.get(id)!;
  const plain = kit.build({});

  it('is unchanged at thin 1, vertex for vertex', () => {
    const one = kit.build({ params: { thin: 1 } });
    expect(verts(one)).toEqual(verts(plain));
  });

  it('keeps fewer triangles at 0.25, every vertex one of the full build', () => {
    const thin = kit.build({ params: { thin: 0.25 } });
    expect(tris(thin)).toBeLessThan(tris(plain));
    const full = new Set(verts(plain));
    for (const v of verts(thin)) expect(full.has(v)).toBe(true);
  });

  it('leaves the far level alone', () => {
    const far = kit.build({ lod: 'low' });
    expect(verts(kit.build({ lod: 'low', params: { thin: 0.25 } }))).toEqual(verts(far));
  });
});

describe('cherry-tree looks (R3X)', () => {
  const kit = kitById.get('cherry-tree')!;
  const meanColor = (g: BufferGeometry): number[] => {
    const c = g.getAttribute('color');
    const m = [0, 0, 0];
    for (let i = 0; i < c.count; i++) {
      m[0]! += c.getX(i) / c.count;
      m[1]! += c.getY(i) / c.count;
      m[2]! += c.getZ(i) / c.count;
    }
    return m;
  };

  it('is the blossom build by default and with leaf blossom', () => {
    expect(verts(kit.build({ params: { leaf: 'blossom' } }))).toEqual(verts(kit.build({})));
  });

  it('in leaf is greener than the blossom and the turned look is redder, at both levels', () => {
    for (const lod of ['high', 'low'] as const) {
      const blossom = meanColor(kit.build({ lod }));
      const leaf = meanColor(kit.build({ lod, params: { leaf: 'leaf' } }));
      const autumn = meanColor(kit.build({ lod, params: { leaf: 'autumn' } }));
      expect(leaf[1]!).toBeGreaterThan(leaf[0]!);
      expect(blossom[0]!).toBeGreaterThan(blossom[1]!);
      expect(autumn[0]!).toBeGreaterThan(autumn[1]!);
      expect(autumn[0]! - autumn[2]!).toBeGreaterThan(0.2);
      expect(leaf[2]!).toBeLessThan(blossom[2]!);
    }
  });

  it('keeps the orchard apple unchanged by a leaf param', () => {
    const apple = kitById.get('apple-tree')!;
    expect(verts(apple.build({ params: { leaf: 'autumn' } }))).toEqual(verts(apple.build({})));
  });
});
