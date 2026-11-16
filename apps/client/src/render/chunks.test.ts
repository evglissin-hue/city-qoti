import { CHUNKS_PER_SIDE } from '@qoti/sim';
import {
  BufferGeometry,
  Float32BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three';
import { describe, expect, it } from 'vitest';
import { ChunkedMeshes, joinGeometries } from './chunks';

function quad(x: number, z: number, indexed: boolean): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute(
    'position',
    new Float32BufferAttribute([x, 0, z, x + 1, 0, z, x, 0, z + 1, x + 1, 0, z + 1], 3),
  );
  g.setAttribute('normal', new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  if (indexed) g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

describe('joinGeometries (V3C)', () => {
  it('joins attributes in order and offsets indices', () => {
    const j = joinGeometries([quad(0, 0, true), quad(5, 0, true)])!;
    expect(j.getAttribute('position').count).toBe(8);
    expect(j.getAttribute('normal').count).toBe(8);
    expect(Array.from(j.index!.array)).toEqual([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7]);
    expect(j.getAttribute('position').getX(4)).toBe(5);
  });

  it('indexes unindexed parts when another part is indexed', () => {
    const j = joinGeometries([quad(0, 0, false), quad(5, 0, true)])!;
    expect(Array.from(j.index!.array).slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(j.index!.count).toBe(10);
  });

  it('joins interleaved parts buffer by buffer, keeping offsets', () => {
    const part = (x: number): BufferGeometry => {
      const ib = new InterleavedBuffer(new Float32Array([x, 0, 0, 1, x + 1, 0, 0, 2, x, 0, 1, 3]), 4);
      const g = new BufferGeometry();
      g.setAttribute('position', new InterleavedBufferAttribute(ib, 3, 0));
      g.setAttribute('gsurf', new InterleavedBufferAttribute(ib, 1, 3));
      return g;
    };
    const j = joinGeometries([part(0), part(10)])!;
    expect(j.getAttribute('position').count).toBe(6);
    expect(j.getAttribute('position').getX(3)).toBe(10);
    expect(j.getAttribute('gsurf').getX(5)).toBe(3);
    expect(j.index).toBeNull();
  });

  it('is null for nothing', () => {
    expect(joinGeometries([])).toBeNull();
  });
});

describe('ChunkedMeshes groups (V3C)', () => {
  const meshes = (s: Scene) => s.children.filter((c) => c instanceof Mesh);

  it('draws one mesh a block, with every chunk in it', () => {
    const scene = new Scene();
    const c = new ChunkedMeshes(
      scene,
      new MeshBasicMaterial(),
      (cx, cz) => quad(cx * 16, cz * 16, true),
      0,
      true,
      3,
    );
    c.markAll();
    c.rebuild();
    const side = Math.ceil(CHUNKS_PER_SIDE / 3);
    expect(meshes(scene).length).toBe(side * side);
    const verts = meshes(scene).reduce((n, m) => n + (m as Mesh).geometry.getAttribute('position').count, 0);
    expect(verts).toBe(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE * 4);
  });

  it('rejoins only the block of a rebuilt chunk, and drops an emptied block', () => {
    const scene = new Scene();
    const empty = new Set<number>();
    const c = new ChunkedMeshes(
      scene,
      new MeshBasicMaterial(),
      (cx, cz) => (empty.has(cz * CHUNKS_PER_SIDE + cx) ? null : quad(cx * 16, cz * 16, false)),
      0,
      true,
      2,
    );
    c.markAll();
    c.rebuild();
    const before = meshes(scene).length;
    const other = meshes(scene)[meshes(scene).length - 1];
    for (const i of [0, 1, CHUNKS_PER_SIDE, CHUNKS_PER_SIDE + 1]) empty.add(i);
    c.markRect([0, 0, 31, 31], 0);
    expect(c.rebuild()).toBe(true);
    expect(meshes(scene).length).toBe(before - 1);
    expect(meshes(scene)).toContain(other);
    c.dispose();
    expect(meshes(scene).length).toBe(0);
  });
});
