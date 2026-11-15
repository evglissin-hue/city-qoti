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
