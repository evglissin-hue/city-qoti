// V3B: the street furniture kits (bollard, street lamp): small, lighter far, the lamp head glows.
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { kitById } from './kits';

const tris = (g: BufferGeometry): number => g.getAttribute('position').count / 3;
const build = (id: string, lod?: 'low', params?: Record<string, boolean>): BufferGeometry =>
  kitById.get(id)!.build({ ...(lod ? { lod } : {}), ...(params ? { params } : {}) });

const height = (g: BufferGeometry): number => {
  g.computeBoundingBox();
  return g.boundingBox!.max.y;
};

describe('street furniture kits', () => {
  it('builds a bollard, iron or stone, about 0.22 tall, a few dozen triangles near', () => {
    for (const params of [undefined, { stone: true }]) {
      const near = build('bollard', undefined, params);
      const far = build('bollard', 'low', params);
      expect(height(near)).toBeGreaterThan(0.18);
      expect(height(near)).toBeLessThan(0.26);
      expect(tris(near)).toBeLessThan(300);
      expect(tris(near)).toBeGreaterThan(20);
      expect(tris(far)).toBeLessThan(tris(near));
      expect(tris(far)).toBeLessThan(40);
    }
  });

  it('builds a street lamp about 0.75 tall whose head glows', () => {
    const near = build('street-lamp');
    const far = build('street-lamp', 'low');
    expect(height(near)).toBeGreaterThan(0.7);
    expect(height(near)).toBeLessThan(0.85);
    expect(tris(near)).toBeLessThan(300);
    expect(tris(far)).toBeLessThan(tris(near));
    const glow = near.getAttribute('glow');
    let lit = 0;
    for (let i = 0; i < glow.count; i++) if (glow.getX(i) > 0) lit++;
    expect(lit).toBeGreaterThan(0);
    expect(kitById.get('street-lamp')!.anchors?.().lights?.length).toBe(1);
  });
});
