// R3X: the master's sign kit and the two pieces masters bring (carved stone, ornamental tree).
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { SIGN_SIZE } from './facade';
import { kitById } from './kits';
import { MASTER_EMBLEMS, POST_HANG } from './kits/masterSign';

const tris = (id: string, opts: object = {}): number =>
  kitById.get(id)!.build(opts).getAttribute('position').count / 3;

function bounds(id: string, opts: object = {}) {
  const g = kitById.get(id)!.build(opts);
  g.computeBoundingBox();
  return g.boundingBox!;
}

describe('the master-sign kit (R3X)', () => {
  it('has an emblem for every trade and building a master can have, and no others', () => {
    expect([...MASTER_EMBLEMS].sort()).toEqual(content.masters.map((m) => m.of).sort());
  });

  it('builds every emblem, on a wall and on a post, within its size and the decor budget', () => {
    for (const emblem of [...MASTER_EMBLEMS, 'no-such-trade']) {
      for (const post of [false, true]) {
        const opts = { params: { emblem, post }, seed: 2 };
        const at = `${emblem}${post ? ' post' : ''}`;
        const n = tris('master-sign', opts);
        expect(n, at).toBeGreaterThan(40);
        expect(n, at).toBeLessThan(400);
        expect(tris('master-sign', { ...opts, lod: 'low' }), `${at} low`).toBeLessThanOrEqual(n);
        const b = bounds('master-sign', opts);
        expect(b.min.y, at).toBeGreaterThanOrEqual(-0.001);
        if (!post) {
          // The arm's plate sits just behind the wall plane, the sign reaches `reach` out, within its width.
          expect(b.min.z, at).toBeGreaterThanOrEqual(-0.013);
          expect(b.max.z, at).toBeLessThanOrEqual(SIGN_SIZE.reach + 0.03);
          expect(b.max.y, at).toBeLessThanOrEqual(SIGN_SIZE.h + 0.001);
          expect(Math.max(-b.min.x, b.max.x), at).toBeLessThanOrEqual(SIGN_SIZE.halfW + 0.001);
        } else {
          // On a post: the board hangs at POST_HANG from the ground, the post at its left.
          expect(b.min.y, at).toBeLessThan(0.01);
          expect(b.max.y, at).toBeLessThanOrEqual(POST_HANG + SIGN_SIZE.h + 0.001);
          expect(b.max.z - b.min.z, at).toBeLessThan(0.1);
        }
      }
    }
  });

  it('is deterministic from its options and seed, and paints its own emblem', () => {
    const colors = (emblem: string, seed = 1): number[] =>
      Array.from(kitById.get('master-sign')!.build({ params: { emblem }, seed }).getAttribute('color').array);
    expect(colors('baker')).toEqual(colors('baker'));
    expect(colors('baker')).not.toEqual(colors('weaver'));
    expect(colors('baker')).not.toEqual(colors('fishery'));
  });

  it('faces the street on both sides: front and back are both painted', () => {
    const g = kitById.get('master-sign')!.build({ params: { emblem: 'baker' } });
    const pos = g.getAttribute('position');
    let front = 0;
    let back = 0;
    for (let i = 0; i < pos.count; i += 3) {
      // Triangles lying in a plane of constant z outside the board's own thickness.
      const z = [pos.getZ(i), pos.getZ(i + 1), pos.getZ(i + 2)];
      if (Math.abs(z[0]! - z[1]!) > 1e-6 || Math.abs(z[1]! - z[2]!) > 1e-6) continue;
      const mid = SIGN_SIZE.reach;
      if (z[0]! > mid + 0.005) front++;
      else if (z[0]! < mid - 0.005 && z[0]! > 0.05) back++;
    }
    expect(front).toBeGreaterThan(10);
    expect(back).toBeGreaterThan(10);
  });
});

describe('the carved stone and the ornamental tree (R3X)', () => {
  const pieces: [id: string, def: { art: { kit: string; params?: unknown } }, radius: number][] = [
    ['carved-stone', content.decorById.get('carved-stone')!, 0.3],
    ['ornamental-tree', content.decorById.get('ornamental-tree')!, 0.4],
  ];

  for (const [id, def, radius] of pieces) {
    it(`${id}: its def points at its own kit, which builds within budget and on the ground`, () => {
      expect(def.art.kit).toBe(id);
      expect(def.art.params).toBeUndefined();
      expect(kitById.get(id)?.kind).toBe('decor');
      const n = tris(id);
      expect(n).toBeGreaterThan(60);
      expect(n).toBeLessThan(400);
      expect(tris(id, { lod: 'low' })).toBeLessThanOrEqual(n);
      const b = bounds(id);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.001);
      // About the size of its neighbors: under a tile across, and no taller than a young tree.
      expect(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z)).toBeLessThanOrEqual(radius);
      expect(b.max.y).toBeGreaterThan(0.3);
      expect(b.max.y).toBeLessThan(1);
    });

    it(`${id}: is deterministic and varies a little with its seed`, () => {
      const colors = (seed: number): number[] =>
        Array.from(kitById.get(id)!.build({ seed }).getAttribute('color').array);
      expect(colors(3)).toEqual(colors(3));
      expect(colors(3)).not.toEqual(colors(4));
    });
  }
});
