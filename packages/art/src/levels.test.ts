// V1B: the two levels of every building kit and joined facades.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { kitById, kits } from './kits';
import { ROW_EAVES } from './kits/rows';
import type { KitBuildOptions } from './kits/types';

const STYLES = ['', 'timber', 'stone', 'brick', 'plaster'];
/** Homes: at most this many triangles at the far level (docs/build/cycle-v1b-buildings-detail.md). */
const HOME_LOW = 150;
const HOMES = ['cottage', 'house', 'shop', 'townhouse', 'workshop'];
/** Homes (and farmsteads) at the near level. */
const HOME_HIGH = 4000;
/** A farmstead is a house and a barn on one lot. */
const FARM_LOW = 220;
/** Everything else, landmarks included. */
const OTHER_LOW = 600;

function optsOf(id: string, style: string, seed: number): KitBuildOptions {
  const kit = kitById.get(id)!;
  const def = content.buildings.find((b) => b.art.kit === id);
  return {
    size: def?.size ?? kit.footprint?.size ?? [2, 2],
    entrance: def?.entrance ?? kit.footprint?.entrance ?? [1, 1],
    seed,
    params: { ...(def?.art.params ?? {}), ...(style ? { style } : {}) },
  };
}

const tris = (id: string, o: KitBuildOptions): number =>
  kitById.get(id)!.build(o).getAttribute('position').count / 3;

describe('building levels (V1B)', () => {
  it('keep the far level within its budget', { timeout: 60000 }, () => {
    for (const kit of kits) {
      if (kit.kind !== 'building') continue;
      const styled = !!kit.footprint || kit.id === 'cottage';
      const budget = HOMES.includes(kit.id) ? HOME_LOW : kit.id === 'farmstead' ? FARM_LOW : OTHER_LOW;
      for (const style of styled ? STYLES : ['']) {
        for (let seed = 1; seed <= 6; seed++) {
          const o = optsOf(kit.id, style, seed);
          const low = tris(kit.id, { ...o, lod: 'low' });
          expect(low, `${kit.id} ${style} ${seed}`).toBeLessThanOrEqual(budget);
          expect(low, `${kit.id} ${style} ${seed}`).toBeLessThan(tris(kit.id, o));
        }
      }
    }
  });

  it('match: the same chimneys, lights and outline at both levels (no pop on a swap)', () => {
    for (const kit of kits) {
      if (kit.kind !== 'building') continue;
      for (const style of ['', 'brick']) {
        for (let seed = 1; seed <= 3; seed++) {
          const o = optsOf(kit.id, style, seed);
          const high = kit.build(o);
          const low = kit.build({ ...o, lod: 'low' });
          // Silhouette choices are rolled the same way: the far level never pokes out of the near.
          const bh = high.boundingBox!;
          const bl = low.boundingBox!;
          expect(bl.max.y, kit.id).toBeLessThanOrEqual(bh.max.y + 0.08);
          expect(bl.min.x, kit.id).toBeGreaterThanOrEqual(bh.min.x - 0.02);
          expect(bl.max.x, kit.id).toBeLessThanOrEqual(bh.max.x + 0.02);
          if (kit.anchors) {
            const ah = kit.anchors(o);
            const al = kit.anchors({ ...o, lod: 'low' });
            expect(al.smoke, `${kit.id} smoke`).toEqual(ah.smoke);
          }
          // Both levels carry the same attributes (one batch holds both).
          expect(Object.keys(low.attributes).sort()).toEqual(Object.keys(high.attributes).sort());
        }
      }
    }
  });

  it('keep lit panes at the far level, so a distant town still lights up at night', () => {
    for (const id of ['cottage', 'townhouse', 'shop', 'house', 'farmstead', 'tavern', 'town-hall']) {
      for (const style of ['', 'timber', 'brick']) {
        const o = optsOf(id, style, 2);
        const lit = (lod: 'high' | 'low'): number =>
          Array.from(
            kitById
              .get(id)!
              .build({ ...o, lod })
              .getAttribute('glow').array,
          ).filter((v) => v === 1).length;
        expect(lit('low'), `${id} ${style}`).toBeGreaterThan(0);
      }
    }
  });

  it('keep per-face paint where the levels share a face', () => {
    // The wall body is the same box at both levels: its colors match exactly (hashed jitter).
    const o = optsOf('cottage', 'plaster', 4);
    const colorAt = (lod: 'high' | 'low', nx: number, nz: number): string => {
      const g = kitById.get('cottage')!.build({ ...o, lod });
      const n = g.getAttribute('normal').array;
      const c = g.getAttribute('color').array;
      const s = g.getAttribute('surface').array;
      const p = g.getAttribute('position').array;
      // The first plaster vertex facing the given way, high up the wall (clear of the foot AO).
      for (let i = 0; i < s.length; i++)
        if (s[i] === 1 && n[i * 3]! === nx && n[i * 3 + 2]! === nz && p[i * 3 + 1]! > 0.85)
          return [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]].map((v) => v!.toFixed(3)).join(',');
      return '';
    };
    expect(colorAt('low', 0, 1)).not.toBe('');
    expect(colorAt('low', 0, 1)).toBe(colorAt('high', 0, 1));
    expect(colorAt('low', 1, 0)).toBe(colorAt('high', 1, 0));
  });
});

describe('joined facades (V1B)', () => {
  /** Triangles lying in the plane x = `x` facing `dir`, between heights y0 and y1. */
  function partyFaces(
    id: string,
    params: Record<string, string>,
    x: number,
    dir: number,
    y1: number,
  ): number {
    const g = kitById.get(id)!.build({ ...optsOf(id, 'brick', 3), params: { style: 'brick', ...params } });
    const p = g.getAttribute('position').array;
    const n = g.getAttribute('normal').array;
    let k = 0;
    for (let t = 0; t < p.length / 9; t++) {
      const v = t * 9;
      const onPlane = [0, 3, 6].every((o) => Math.abs(p[v + o]! - x) < 0.03);
      const below = [1, 4, 7].every((o) => p[v + o]! < y1);
      if (onPlane && below && Math.sign(n[v]!) === dir && Math.abs(n[v]!) > 0.9) k++;
    }
    return k;
  }

  it('build to the lot edge and leave the party wall out below the neighbor’s eaves', () => {
    const w = 2;
    // Alone, a cottage stands back from its lot's sides.
    expect(partyFaces('cottage', {}, w, 1, 0.88)).toBe(0);
    // Joined on the right to a townhouse: it reaches the edge, with no wall face there at all
    // (the townhouse is taller, so nothing of the cottage shows above its eaves).
    const joined = kitById.get('cottage')!.build({
      ...optsOf('cottage', 'brick', 3),
      params: { style: 'brick', joinR: 'townhouse' },
    }).boundingBox!;
    expect(joined.max.x).toBeGreaterThan(w - 0.01);
    expect(partyFaces('cottage', { joinR: 'townhouse' }, w, 1, 0.88)).toBe(0);
    // The townhouse joined on its left to a cottage shows its party wall above the cottage's eaves.
    expect(partyFaces('townhouse', { joinL: 'cottage' }, 0, -1, ROW_EAVES.cottage! - 0.01)).toBe(0);
    expect(partyFaces('townhouse', { joinL: 'cottage' }, 0, -1, 3)).toBeGreaterThan(0);
  });

  it('stand on one band, so neighbors of any lot depth meet face to face', () => {
    const front = (id: string, d: number): [number, number] => {
      const kit = kitById.get(id)!;
      const g = kit.build({
        size: [2, d],
        entrance: [1, d - 1],
        seed: 2,
        params: { style: 'plaster', joinL: 'cottage' },
      });
      const p = g.getAttribute('position').array;
      const n = g.getAttribute('normal').array;
      // The front wall plane (largest z of a +z face low on the wall), measured from the lot front.
      let zf = -Infinity;
      for (let i = 0; i < p.length / 3; i++)
        if (n[i * 3 + 2]! > 0.99 && p[i * 3 + 1]! > 0.2 && p[i * 3 + 1]! < 0.3)
          zf = Math.max(zf, p[i * 3 + 2]!);
      return [d - zf, d];
    };
    const [a] = front('cottage', 2);
    const [b] = front('cottage', 3);
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });
});
