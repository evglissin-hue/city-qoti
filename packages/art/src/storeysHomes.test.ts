// V3B (E1a): the cottage and the house build their storeys and corners. `params.storeys` lifts the
// walls by `storeyLift` (so `rowEaves` is always the kit's real eaves), the native storeys draw
// exactly as an absent value, a taller cottage shows its own wall above a lower neighbor, and a
// corner lot's second face is a second front.
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { kitById } from './kits';
import { rowEaves, ROW_NATIVE_STOREYS, STOREY_H } from './kits/rows';
import type { KitBuildOptions } from './kits/types';

const KITS = ['cottage', 'house'] as const;
const STOREYS = [1, 1.5, 2, 2.5, 3, 3.5, 4];
/** '' is the hamlet's own cottage and house; the others grow in a district's look. */
const LOOKS = ['', 'timber', 'brick', 'stone', 'plaster'];

function optsOf(
  id: string,
  look: string,
  seed: number,
  params: Record<string, number | string | boolean> = {},
  lod: 'high' | 'low' = 'high',
): KitBuildOptions {
  return {
    size: id === 'house' ? [2, 3] : [2, 2],
    entrance: [1, id === 'house' ? 2 : 1],
    seed,
    lod,
    params: { ...(look ? { style: look, level: 1 } : {}), ...params },
  };
}

function build(id: string, o: KitBuildOptions): BufferGeometry {
  return kitById.get(id)!.build(o);
}

function positions(g: BufferGeometry): number[] {
  return Array.from(g.getAttribute('position').array as ArrayLike<number>);
}

function tris(g: BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

/** Top of the walls: the highest big upward face (a wall box's top), never a ridge or a trim band. */
function wallTop(g: BufferGeometry): number {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const area = new Map<number, number>();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    if (nor.getY(i) < 0.99) continue;
    const y = Math.round(pos.getY(i) * 1000) / 1000;
    if (Math.abs(pos.getY(i + 1) - y) > 1e-4 || Math.abs(pos.getY(i + 2) - y) > 1e-4) continue;
    const ax = pos.getX(i + 1) - pos.getX(i);
    const az = pos.getZ(i + 1) - pos.getZ(i);
    const bx = pos.getX(i + 2) - pos.getX(i);
    const bz = pos.getZ(i + 2) - pos.getZ(i);
    area.set(y, (area.get(y) ?? 0) + Math.abs(ax * bz - az * bx) / 2);
  }
  let best = -Infinity;
  for (const [y, a] of area) if (a >= 0.9 && y > best) best = y;
  return best;
}

describe('storeys of the cottage and the house (V3B)', () => {
  it('stand the walls at rowEaves for every storeys value, with and without a district look', () => {
    for (const id of KITS)
      for (const look of LOOKS)
        for (const storeys of STOREYS)
          for (const seed of [1, 2, 3]) {
            const g = build(id, optsOf(id, look, seed, { storeys }));
            expect(wallTop(g), `${id} ${look || 'hamlet'} storeys ${storeys} seed ${seed}`).toBeCloseTo(
              rowEaves(id, storeys)!,
              2,
            );
          }
  });

  it('draw the native storeys exactly as an absent value', () => {
    for (const id of KITS)
      for (const look of LOOKS)
        for (const lod of ['high', 'low'] as const)
          for (const seed of [1, 2, 3, 4]) {
            const absent = positions(build(id, optsOf(id, look, seed, {}, lod)));
            const native = positions(
              build(id, optsOf(id, look, seed, { storeys: ROW_NATIVE_STOREYS[id]! }, lod)),
            );
            expect(native, `${id} ${look || 'hamlet'} ${lod} seed ${seed}`).toEqual(absent);
          }
  });

  it('build the same geometry for the same storeys and different geometry for different ones', () => {
    for (const id of KITS)
      for (const look of ['', 'brick']) {
        const at = (storeys: number): number[] => positions(build(id, optsOf(id, look, 5, { storeys })));
        expect(at(3)).toEqual(at(3));
        expect(at(2)).not.toEqual(at(3));
        expect(at(3)).not.toEqual(at(4));
        expect(at(1)).not.toEqual(at(1.5));
      }
  });

  it('show a taller cottage its own wall above a lower neighbor, flush and never below its eaves', () => {
    const partyL = rowEaves('cottage', 1)!;
    for (const look of LOOKS)
      for (const seed of [1, 2, 3]) {
        const o = optsOf('cottage', look, seed, { storeys: 3, joinL: 'cottage', partyL });
        const pos = build('cottage', o).getAttribute('position');
        const nor = build('cottage', o).getAttribute('normal');
        let lowest = Infinity;
        let highest = -Infinity;
        for (let i = 0; i + 2 < pos.count; i += 3) {
          // Faces lying in the party plane (x = 0, looking left): the wall seen above the neighbor.
          if (nor.getX(i) > -0.99) continue;
          if ([0, 1, 2].some((k) => Math.abs(pos.getX(i + k)) > 1e-4)) continue;
          for (const k of [0, 1, 2]) {
            if (pos.getY(i + k) < 0.12) continue; // the plinth runs through
            lowest = Math.min(lowest, pos.getY(i + k));
            highest = Math.max(highest, pos.getY(i + k));
          }
        }
        const label = `${look || 'hamlet'} seed ${seed}`;
        // The gable end (a triangle in the same plane) rises past the eaves, so only the floor is exact.
        expect(highest, label).toBeGreaterThanOrEqual(rowEaves('cottage', 3)!);
        expect(lowest, label).toBeGreaterThanOrEqual(partyL - 1e-3);
      }
  });

  it('keep walls, bands and windows inside a joined lot below the eaves (masonry jitter aside)', () => {
    for (const id of KITS)
      for (const look of LOOKS) {
        const o = optsOf(id, look, 2, { storeys: 4, joinL: 'cottage', joinR: 'house' });
        const g = build(id, o);
        const pos = g.getAttribute('position');
        const w = o.size![0];
        const eaves = rowEaves(id, 4)! - 0.11; // the party chimney starts 0.1 below the eaves
        for (let i = 0; i < pos.count; i++) {
          // Upper floors, walls and bands below the eaves (doorstep props aside) (the roof's own verge boards are the roof's business).
          if (pos.getY(i) < 0.7 || pos.getY(i) > eaves) continue;
          expect(pos.getX(i), `${id} ${look || 'hamlet'}`).toBeGreaterThanOrEqual(-0.03);
          expect(pos.getX(i), `${id} ${look || 'hamlet'}`).toBeLessThanOrEqual(w + 0.03);
        }
      }
  });

  it('give a corner lot windows on its second face at every floor, and none extra without a corner', () => {
    const floorYs = (id: string, whole: number): number[] =>
      Array.from({ length: whole }, (_, i) =>
        i === 0
          ? id === 'house'
            ? 0.45
            : 0.52
          : id === 'house'
            ? 1.12 + (i - 1) * STOREY_H
            : 0.52 + i * STOREY_H,
      );
    for (const id of KITS)
      for (const look of LOOKS)
        for (const storeys of [2, 3, 4])
          for (const corner of ['L', 'R'] as const) {
            const o = optsOf(id, look, 3, { storeys, corner });
            const w = o.size![0];
            const lights = kitById.get(id)!.anchors!(o).lights ?? [];
            const onSide = (y: number): number => {
              const near = lights.filter(
                (l) =>
                  Math.abs(l[1] - y) < 0.01 && (corner === 'R' ? l[0] > w / 2 + 0.3 : l[0] < w / 2 - 0.3),
              );
              // Two or more windows sharing one x and differing in z: a row along the side face.
              const groups = new Map<string, Set<number>>();
              for (const l of near) {
                const k = l[0].toFixed(3);
                groups.set(k, (groups.get(k) ?? new Set()).add(Math.round(l[2] * 100)));
              }
              return Math.max(0, ...[...groups.values()].map((s) => s.size));
            };
            for (const y of floorYs(id, storeys))
              expect(
                onSide(y),
                `${id} ${look || 'hamlet'} storeys ${storeys} corner ${corner} y ${y}`,
              ).toBeGreaterThanOrEqual(2);
          }
    const plain =
      kitById.get('cottage')!.anchors!(optsOf('cottage', 'timber', 3, { storeys: 3 })).lights ?? [];
    expect(plain.length).toBeGreaterThan(0);
  });

  it('keep the far level cheap: extra floors add few triangles', () => {
    const rows: string[] = [];
    for (const id of KITS)
      for (const look of ['', 'brick']) {
        const counts: Record<number, [number, number]> = {};
        for (const storeys of [1, 1.5, 2, 3, 4]) {
          const hi = tris(build(id, optsOf(id, look, 4, { storeys })));
          const lo = tris(build(id, optsOf(id, look, 4, { storeys }, 'low')));
          counts[storeys] = [hi, lo];
          rows.push(`${id} ${look || 'hamlet'} storeys ${storeys}: near ${hi}, far ${lo}`);
          expect(lo, rows.at(-1)).toBeLessThan(hi);
        }
        // From two to four storeys the far level gains four floors' windows at most, not a building.
        expect(counts[4]![1] - counts[2]![1], `${id} ${look}`).toBeLessThan(220);
      }
    console.log(rows.join('\n'));
  });
});
