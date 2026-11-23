// R3H: each level of a specialized building reads as more building (docs/build/cycle-r3h-specialized-levels.md,
// Task 4): level 2 differs from level 1 and level 3 from level 2, at both levels of detail; level 1 is
// exactly the build with no level; the budgets hold at every level.
import { afterAll, describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { content } from '@qoti/content';
import { artKitId, kitById } from './kits';
import type { KitBuildOptions } from './kits/types';
import { SURFACE } from './surface';
import {
  columnHit,
  levelPoleGeometry,
  levelPoleSpot,
  poleColumns,
  POLE_HALF,
  POLE_OUTSET,
  trisOf,
  withLevelPole,
} from './kits/levelPole';

/** The far budget every non-home kit keeps (levels.test.ts) and a ceiling for the near build. */
const FAR_BUDGET = 600;
const NEAR_BUDGET = 9000;

const EXPECT_OUTSIDE: string[] = ['market-stall', 'trading-post', 'windmill'];
const defs = content.buildings.filter((b) => b.levels);

function optsOf(id: string, level: number | undefined, seed: number, lod?: 'low'): KitBuildOptions {
  const def = content.buildings.find((b) => b.id === id)!;
  const params: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(def.art.params ?? {}))
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') params[k] = v;
  if (def.placement?.some((r) => r.kind === 'waterEdge')) params.span = 3;
  if (level !== undefined) params.level = level;
  return { size: def.size, entrance: def.entrance, seed, params, ...(lod ? { lod } : {}) };
}

interface Shape {
  tris: number;
  box: [number, number, number, number, number, number];
  sum: number;
}

function shapeOf(g: BufferGeometry): Shape {
  const a = g.getAttribute('position');
  const box: Shape['box'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let sum = 0;
  for (let i = 0; i < a.count; i++) {
    const p: [number, number, number] = [a.getX(i), a.getY(i), a.getZ(i)];
    for (let k = 0; k < 3; k++) {
      box[k] = Math.min(box[k]!, p[k]!);
      box[k + 3] = Math.max(box[k + 3]!, p[k]!);
    }
    sum += p[0] * 1.3 + p[1] * 2.7 + p[2] * 3.1;
  }
  return { tris: a.count / 3, box, sum: Math.round(sum * 1e4) };
}

function build(id: string, level: number | undefined, lod?: 'low', seed = 1): Shape {
  const def = content.buildings.find((b) => b.id === id)!;
  return shapeOf(kitById.get(artKitId(def.art))!.build(optsOf(id, level, seed, lod)));
}

const differs = (a: Shape, b: Shape): boolean =>
  a.tris !== b.tris || a.sum !== b.sum || a.box.some((v, i) => Math.abs(v - b.box[i]!) > 1e-6);

/** The silhouette's volume: grows when a level adds something tall or long. */
const volume = (s: Shape): number => (s.box[3] - s.box[0]) * (s.box[4] - s.box[1]) * (s.box[5] - s.box[2]);

describe('specialized building levels (R3H)', () => {
  it('cover every building that has levels', () => {
    expect(defs.length).toBeGreaterThanOrEqual(10);
  });

  for (const def of defs) {
    describe(def.id, () => {
      it('draws level 1 as it always was, and each level above as more', { timeout: 30000 }, () => {
        for (const lod of [undefined, 'low'] as const) {
          const none = build(def.id, undefined, lod);
          const l1 = build(def.id, 1, lod);
          const l2 = build(def.id, 2, lod);
          const l3 = build(def.id, 3, lod);
          expect(l1, `${def.id} ${lod ?? 'near'} level 1`).toEqual(none);
          expect(differs(l2, l1), `${def.id} ${lod ?? 'near'} 2 vs 1`).toBe(true);
          expect(differs(l3, l2), `${def.id} ${lod ?? 'near'} 3 vs 2`).toBe(true);
        }
      });

      it('grows at the far level too', () => {
        const l1 = build(def.id, 1, 'low');
        const l2 = build(def.id, 2, 'low');
        const l3 = build(def.id, 3, 'low');
        const grows = (a: Shape, b: Shape): boolean => b.tris > a.tris || volume(b) > volume(a) * 1.001;
        expect(grows(l1, l2), `${def.id} far 2 vs 1`).toBe(true);
        expect(grows(l2, l3), `${def.id} far 3 vs 2`).toBe(true);
      });

      it('has a bigger silhouette at level 2 than level 1, near and far', () => {
        for (const lod of [undefined, 'low'] as const) {
          const l1 = build(def.id, 1, lod);
          const l2 = build(def.id, 2, lod);
          expect(volume(l2), `${def.id} ${lod ?? 'near'} 2 vs 1`).toBeGreaterThan(volume(l1) * 1.001);
        }
      });

      it('keeps its budgets at every level and seed', { timeout: 30000 }, () => {
        for (const level of [1, 2, 3])
          for (let seed = 1; seed <= 4; seed++) {
            const far = build(def.id, level, 'low', seed);
            const near = build(def.id, level, undefined, seed);
            expect(far.tris, `${def.id} L${level} far`).toBeLessThanOrEqual(FAR_BUDGET);
            expect(near.tris, `${def.id} L${level} near`).toBeLessThanOrEqual(NEAR_BUDGET);
            expect(far.tris).toBeLessThan(near.tris);
          }
      });

      it('stays inside its lot', () => {
        const [w, d] = def.size;
        for (const level of [1, 2, 3]) {
          const b = build(def.id, level).box;
          expect(b[1], `${def.id} L${level} base`).toBeGreaterThanOrEqual(-0.4);
          // The footprint with the small overhangs the level 1 kits already have (awnings, jetties, roofs).
          expect(b[0], `${def.id} L${level} x-`).toBeGreaterThanOrEqual(-0.35);
          expect(b[3], `${def.id} L${level} x+`).toBeLessThanOrEqual(w + 0.35);
          expect(b[2], `${def.id} L${level} z-`).toBeGreaterThanOrEqual(-0.35);
          expect(b[5], `${def.id} L${level} z+`).toBeLessThanOrEqual(d + 0.45);
        }
      });
    });
  }

  // The size rule: a level 2 stall, lodge, fishery, granary or storehouse is clearly bigger in silhouette
  // from the default camera (the far level included), a level 3 one bigger again.
  describe('clear steps in size', () => {
    const steps: [id: string, side: 'height' | 'width' | 'depth', l2: number, l3: number][] = [
      ['market-stall', 'height', 0.3, 0.5],
      ['foresters-lodge', 'height', 0.6, 0.25],
      ['fishery', 'depth', 0.25, 0],
      ['fishery', 'width', 0.05, 0.1],
      ['granary', 'height', 0.6, 0.1],
      ['storehouse', 'height', 0.6, 0.1],
    ];
    for (const [id, side, d2, d3] of steps)
      it(`${id} grows its ${side} by ${d2} then ${d3} at both levels of detail`, () => {
        const size = (s: Shape): number =>
          side === 'height' ? s.box[4] : side === 'width' ? s.box[3] - s.box[0] : s.box[5] - s.box[2];
        for (const lod of [undefined, 'low'] as const) {
          const [l1, l2, l3] = [1, 2, 3].map((lv) => size(build(id, lv, lod)));
          expect(l2! - l1!, `${id} ${lod ?? 'near'} 2 vs 1`).toBeGreaterThanOrEqual(d2);
          expect(l3! - l2!, `${id} ${lod ?? 'near'} 3 vs 2`).toBeGreaterThanOrEqual(d3);
        }
      });
  });

  // R3X: the level pole, one pennant a level, standing clear of the building.
  describe('level pole', () => {
    /** Defs whose lot the kit fills edge to edge, so the post stands just outside it. */
    const outside = new Set<string>();
    afterAll(() => {
      // Only the full lots: a stall, a mill's tower. Anything else has free ground inside.
      expect([...outside].sort()).toEqual(EXPECT_OUTSIDE);
    });
    /** Turn a kit-local point by `rot` quarter turns about the footprint's middle (the buildings matrix). */
    const turn = (x: number, z: number, w: number, d: number, rot: number): [number, number] => {
      let [px, pz, cw, cd] = [x, z, w, d];
      for (let i = 0; i < rot; i++) {
        [px, pz] = [cd - pz, px];
        [cw, cd] = [cd, cw];
      }
      return [px, pz];
    };
    for (const def of defs)
      it(`${def.id}: one pennant a level, inside the footprint, off the door, through nothing`, { timeout: 30000 }, () => {
        const [w, d] = def.size;
        const [ex, ez] = def.entrance;
        for (const level of [1, 2, 3]) {
          const kit = kitById.get(artKitId(def.art))!.build(optsOf(def.id, level, 1));
          const spot = levelPoleSpot(kit, def.size, def.entrance);
          const pole = levelPoleGeometry(spot, level);
          const surf = pole.getAttribute('surface').array as Uint8Array;
          let cloth = 0;
          for (const v of surf) if (v === SURFACE.cloth) cloth++;
          expect(cloth / 6, `${def.id} L${level} pennants`).toBe(level);
          const merged = withLevelPole(kit, def.size, def.entrance, level);
          expect(merged.getAttribute('position').count).toBe(
            kit.getAttribute('position').count + pole.getAttribute('position').count,
          );
          // Inside the footprint, off the door tile and the strip in front of it, at every rotation.
          for (let rot = 0; rot < 4; rot++) {
            const rw = rot % 2 ? d : w;
            const rd = rot % 2 ? w : d;
            const [px, pz] = turn(spot.x, spot.z, w, d, rot);
            // A lot the kit fills edge to edge puts the post at most POLE_OUTSET outside; see `outside`.
            const slack = POLE_OUTSET + POLE_HALF + 1e-6;
            expect(px - POLE_HALF, `${def.id} L${level} r${rot} x`).toBeGreaterThanOrEqual(-slack);
            expect(px + POLE_HALF).toBeLessThanOrEqual(rw + slack);
            expect(pz - POLE_HALF).toBeGreaterThanOrEqual(-slack);
            expect(pz + POLE_HALF).toBeLessThanOrEqual(rd + slack);
            if (rot === 0 && (px < 0 || px > w || pz < 0 || pz > d)) outside.add(def.id);
            const [ax, az] = turn(ex, ez, w, d, rot);
            const [bx, bz] = turn(ex + 1, ez + 1, w, d, rot);
            const onDoor =
              px > Math.min(ax, bx) && px < Math.max(ax, bx) && pz > Math.min(az, bz) && pz < Math.max(az, bz);
            expect(onDoor, `${def.id} L${level} r${rot} on the door tile`).toBe(false);
          }
          // The post and the cloth meet none of the kit's walls, roofs or eaves.
          const tris = trisOf(kit);
          for (const [x, z, y0, y1] of poleColumns(spot, level))
            expect(columnHit(tris, x, z, y0, y1, 0.02), `${def.id} L${level} through the kit at ${x},${z}`).toBe(
              false,
            );
          pole.dispose();
          merged.dispose();
        }
      });
  });
});
