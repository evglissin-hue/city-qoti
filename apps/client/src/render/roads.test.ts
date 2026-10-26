import { CHUNK_SIZE, MAP_SIZE } from '@qoti/sim';
import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { Mirror } from '../state/mirror';
import { roadsLayer } from './layers/roads';

function fakeMirror(road: (x: number, z: number) => number, water: (x: number, z: number) => number): Mirror {
  return {
    road: (x: number, z: number) => road(x, z),
    water: (x: number, z: number) => water(x, z),
    height: () => 1,
  } as unknown as Mirror;
}

describe('roads layer', () => {
  it('builds a plank bridge where a road crosses water, and nothing for roads on land', () => {
    const scene = new Scene();
    // A path along x = 20 from z = 10 to 16, crossing a river at z = 12..14.
    const mirror = fakeMirror(
      (x, z) => (x === 20 && z >= 10 && z <= 16 ? 1 : 0),
      (_x, z) => (z >= 12 && z <= 14 ? 1 : 0),
    );
    const layer = roadsLayer();
    layer.init({ scene, mirror, material: undefined as never, invalidate: () => {} });
    const meshes = scene.children;
    expect(meshes.length).toBe(1);
    const g = (meshes[0] as unknown as { geometry: { getAttribute(n: string): { count: number } } }).geometry;
    expect(g.getAttribute('position').count / 3).toBeGreaterThan(100);
    expect(MAP_SIZE % CHUNK_SIZE).toBe(0);
    layer.dispose();
  });
});
