// V3B: storeys for the townhouse and the shop, and the corner shop (kits/rows.ts is the contract).
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { kitById } from './kits';
import { ROW_EAVES, rowEaves } from './kits/rows';
import type { KitBuildOptions } from './kits/types';

const KITS = ['townhouse', 'shop'] as const;
const STYLES = ['', 'brick', 'timber', 'stone', 'plaster'];
const STOREYS = [1, 1.5, 2, 2.5, 3, 3.5, 4];

function opts(
  id: string,
  style: string,
  params: Record<string, string | number | boolean> = {},
  seed = 3,
  lod?: 'low',
): KitBuildOptions {
  return {
    size: id === 'shop' ? [2, 3] : [2, 2],
    entrance: [1, id === 'shop' ? 2 : 1],
    seed,
    params: { ...(style ? { style } : {}), ...params },
    ...(lod ? { lod } : {}),
  };
}

const build = (id: string, o: KitBuildOptions): BufferGeometry => kitById.get(id)!.build(o);
const positions = (g: BufferGeometry): number[] => Array.from(g.getAttribute('position').array);
const tris = (g: BufferGeometry): number => g.getAttribute('position').count / 3;

function maxY(g: BufferGeometry): number {
  g.computeBoundingBox();
  return g.boundingBox!.max.y;
}

/** Triangles lying in the plane x = `x` facing `dir` (-1 or 1) whose every vertex is below `y1`. */
function partyFaces(g: BufferGeometry, x: number, dir: number, y1: number): number {
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

/** Triangles in the plane x = `x` facing `dir` with a vertex strictly between heights y0 and y1. */
function wallFaces(g: BufferGeometry, x: number, dir: number, y0: number, y1: number): number {
  const p = g.getAttribute('position').array;
  const n = g.getAttribute('normal').array;
  let k = 0;
  for (let t = 0; t < p.length / 9; t++) {
    const v = t * 9;
    const onPlane = [0, 3, 6].every((o) => Math.abs(p[v + o]! - x) < 0.03);
    const inside = [1, 4, 7].some((o) => p[v + o]! > y0 && p[v + o]! < y1);
    // The wall body, not the shopfront's end pilaster at the front.
    const body = [2, 5, 8].every((o) => p[v + o]! < 2.5);
    if (onPlane && inside && body && Math.sign(n[v]!) === dir && Math.abs(n[v]!) > 0.9) k++;
  }
  return k;
}

describe('row kit storeys (V3B)', () => {
  it('draw native storeys exactly as when storeys is absent', () => {
    for (const id of KITS)
      for (const style of STYLES)
        for (const extra of [{}, { joinL: 'cottage' }, { joinR: 'shop', streetL: true }] as Record<
          string,
          string | boolean
        >[])
          for (const lod of [undefined, 'low' as const]) {
            const a = positions(build(id, opts(id, style, extra, 3, lod)));
            const b = positions(build(id, opts(id, style, { ...extra, storeys: 2 }, 3, lod)));
            expect(b, `${id} ${style} ${JSON.stringify(extra)} ${lod}`).toEqual(a);
          }
  });

  it('stand as tall as rowEaves says, at every storeys value, with and without a style', () => {
    for (const id of KITS)
      for (const style of STYLES) {
        const native = maxY(build(id, opts(id, style)));
        for (const st of STOREYS) {
          const rise = maxY(build(id, opts(id, style, { storeys: st }))) - native;
          const want = rowEaves(id, st)! - rowEaves(id)!;
          expect(rise, `${id} ${style} ${st}`).toBeCloseTo(want, 2);
        }
      }
  });

  it('put the shop wall top exactly at rowEaves (party wall measure)', () => {
    for (const style of STYLES)
      for (const st of STOREYS) {
        const g = build('shop', opts('shop', style, { storeys: st, joinL: 'cottage', partyL: 0.3 }));
        const p = g.getAttribute('position').array;
        const n = g.getAttribute('normal').array;
        let top = 0;
        for (let t = 0; t < p.length / 9; t++) {
          const v = t * 9;
          if (![0, 3, 6].every((o) => Math.abs(p[v + o]!) < 1e-3 && n[v + o]! < -0.99)) continue;
          const ys = [1, 4, 7].map((o) => p[v + o]!);
          if (new Set(ys.map((y) => y.toFixed(4))).size === 2) top = Math.max(top, ...ys);
        }
        expect(top, `${style} ${st}`).toBeCloseTo(rowEaves('shop', st)!, 2);
      }
    expect(ROW_EAVES.shop).toBeCloseTo(0.08 + 1.56, 6);
    expect(ROW_EAVES.townhouse).toBeCloseTo(0.12 + 1.46, 6);
  });

  it('give different geometry for 2 and 3 storeys, the same for the same storeys', () => {
    for (const id of KITS) {
      const two = positions(build(id, opts(id, 'brick', { storeys: 2 })));
      const three = positions(build(id, opts(id, 'brick', { storeys: 3 })));
      const again = positions(build(id, opts(id, 'brick', { storeys: 3 })));
      expect(three).not.toEqual(two);
      expect(again).toEqual(three);
    }
  });

  it('keep the far level a taller box: extra floors add no far windows', () => {
    for (const id of KITS) {
      const far = (st: number): number => tris(build(id, opts(id, 'brick', { storeys: st }, 3, 'low')));
      // From the third floor up the far level adds nothing but wall height.
      expect(far(4), id).toBe(far(3));
      expect(far(4), id).toBeLessThanOrEqual(200);
    }
  });

  it('draw the party wall above a shorter neighbor and none below a taller one', () => {
    const cottage = rowEaves('cottage', 1.5)!;
    const tall = build(
      'townhouse',
      opts('townhouse', 'brick', { storeys: 3, joinL: 'cottage', partyL: cottage }),
    );
    expect(partyFaces(tall, 0, -1, cottage - 0.01)).toBe(0);
    expect(partyFaces(tall, 0, -1, rowEaves('townhouse', 3)! + 0.01)).toBeGreaterThan(0);
    const t3 = rowEaves('townhouse', 3)!;
    const low = build(
      'townhouse',
      opts('townhouse', 'brick', { storeys: 2, joinR: 'townhouse', partyR: t3 }),
    );
    // No wall on its right side between the plinth band and its own eaves: the neighbor is the wall.
    expect(wallFaces(low, 2, 1, 0.3, rowEaves('townhouse', 2)! - 0.2)).toBe(0);
    // The shop too, beside a taller townhouse.
    const shop = build('shop', opts('shop', 'brick', { storeys: 2, joinR: 'townhouse', partyR: t3 }));
    expect(wallFaces(shop, 2, 1, 0.3, rowEaves('shop', 2)! - 0.2)).toBe(0);
  });

  it('keep floors, windows and roof inside the lot at every storeys value', { timeout: 120000 }, () => {
    for (const id of KITS)
      for (const style of ['', 'timber', 'brick'])
        for (const st of STOREYS)
          for (const corner of [undefined, 'L', 'R'] as const)
            for (const seed of [1, 2]) {
              const o = opts(
                id,
                style,
                { storeys: st, ...(corner ? { corner, [`street${corner}`]: true } : {}) },
                seed,
              );
              const [w, d] = o.size!;
              const pos = build(id, o).getAttribute('position');
              const lo = [Infinity, Infinity];
              const hi = [-Infinity, -Infinity];
              for (let i = 0; i < pos.count; i++) {
                if (pos.getY(i) < 0.2) continue;
                lo[0] = Math.min(lo[0]!, pos.getX(i));
                hi[0] = Math.max(hi[0]!, pos.getX(i));
                lo[1] = Math.min(lo[1]!, pos.getZ(i));
                hi[1] = Math.max(hi[1]!, pos.getZ(i));
              }
              const label = `${id} ${style} ${st} ${corner ?? '-'} ${seed}`;
              // A corner townhouse's window boxes may hang a hair (0.02) over the second street's edge.
              expect(lo[0]!, label).toBeGreaterThanOrEqual(-0.02);
              expect(hi[0]!, label).toBeLessThanOrEqual(w + 0.02);
              expect(lo[1]!, label).toBeGreaterThanOrEqual(-0.005);
              expect(hi[1]!, label).toBeLessThanOrEqual(d + 0.25);
            }
  });
});

describe('corner shops and townhouses (V3B)', () => {
  const canted = (g: BufferGeometry, sx: number): number => {
    const n = g.getAttribute('normal').array;
    const p = g.getAttribute('position');
    let k = 0;
    for (let i = 0; i < n.length / 3; i += 3) {
      if (Math.abs(n[i * 3]! - sx * 0.7071) >= 0.01 || Math.abs(n[i * 3 + 2]! - 0.7071) >= 0.01) continue;
      // V3X: only the cut itself counts, not the door's hood brackets and returns (a few pixels wide).
      const ax = p.getX(i + 1) - p.getX(i);
      const ay = p.getY(i + 1) - p.getY(i);
      const az = p.getZ(i + 1) - p.getZ(i);
      const bx = p.getX(i + 2) - p.getX(i);
      const by = p.getY(i + 2) - p.getY(i);
      const bz = p.getZ(i + 2) - p.getZ(i);
      const area = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
      if (area > 0.04) k++;
    }
    return k;
  };

  it('cut the ground floor corner at 45 degrees on the corner side only', () => {
    for (const style of STYLES) {
      const plain = build('shop', opts('shop', style));
      expect(canted(plain, 1)).toBe(0);
      expect(canted(plain, -1)).toBe(0);
      const r = build('shop', opts('shop', style, { corner: 'R', streetR: true }));
      const l = build('shop', opts('shop', style, { corner: 'L', streetL: true }));
      expect(canted(r, 1), `${style} R`).toBeGreaterThan(0);
      expect(canted(r, -1), `${style} R`).toBe(0);
      expect(canted(l, -1), `${style} L`).toBeGreaterThan(0);
      expect(canted(l, 1), `${style} L`).toBe(0);
    }
  });

  it('mirror: both sides stay in the lot and differ from each other', () => {
    for (const lod of [undefined, 'low' as const]) {
      const r = build('shop', opts('shop', 'brick', { corner: 'R', streetR: true }, 3, lod));
      const l = build('shop', opts('shop', 'brick', { corner: 'L', streetL: true }, 3, lod));
      for (const g of [r, l]) {
        g.computeBoundingBox();
        expect(g.boundingBox!.min.x).toBeGreaterThanOrEqual(-0.005);
        expect(g.boundingBox!.max.x).toBeLessThanOrEqual(2.005);
      }
      expect(positions(r)).not.toEqual(positions(l));
    }
  });

  it('give a corner building sills on both faces, and a plain one none of its own', () => {
    for (const id of KITS) {
      const kit = kitById.get(id)!;
      expect(kit.anchors!(opts(id, 'brick')).sills, id).toBeUndefined();
      for (const corner of ['L', 'R'] as const) {
        const a = kit.anchors!(opts(id, 'brick', { corner, [`street${corner}`]: true }));
        const sx = corner === 'R' ? 1 : -1;
        expect(
          a.sills!.some((s) => s.facing[0] === 0 && s.facing[1] === 1),
          `${id} ${corner} front`,
        ).toBe(true);
        expect(
          a.sills!.some((s) => s.facing[0] === sx),
          `${id} ${corner} side`,
        ).toBe(true);
      }
    }
  });

  it('keep the shop sign on the front fascia at every height', () => {
    for (const st of STOREYS)
      for (const level of [0, 2, 3]) {
        const a = kitById.get('shop')!.anchors!(
          opts('shop', 'brick', { storeys: st, level, corner: 'R', streetR: true }),
        );
        if (level === 0) continue;
        expect(a.sign, `${st} ${level}`).toBeDefined();
        expect(a.sign!.center[1], `${st} ${level}`).toBeLessThan(1);
        expect(a.sign!.normal).toEqual([0, 0, 1]);
      }
  });
});

describe('triangle budget (V3B)', () => {
  it('prints near and far triangles per storeys', () => {
    const rows: string[] = [];
    for (const id of KITS)
      for (const st of [undefined, ...STOREYS]) {
        const p: Record<string, number> = st ? { storeys: st } : {};
        const near = tris(build(id, opts(id, 'brick', p)));
        const far = tris(build(id, opts(id, 'brick', p, 3, 'low')));
        rows.push(`${id} ${st ?? 'native'} near ${near} far ${far}`);
        expect(near).toBeLessThanOrEqual(4000);
      }
    for (const corner of ['L', 'R'] as const) {
      const p = { corner, [`street${corner}`]: true };
      const near = tris(build('shop', opts('shop', 'brick', p)));
      const far = tris(build('shop', opts('shop', 'brick', p, 3, 'low')));
      rows.push(`shop corner ${corner} near ${near} far ${far}`);
      expect(near).toBeLessThanOrEqual(4000);
      expect(far).toBeLessThanOrEqual(200);
    }
    console.info(rows.join('\n'));
  });
});
