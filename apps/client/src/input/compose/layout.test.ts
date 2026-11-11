import { content, type PatternDef } from '@qoti/content';
import { TILE_FP } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { layoutCommands, layoutPieces, turnOffset } from './layout';

// The commands a plan may hold (packages/sim/src/commands/plan.ts, PLANNABLE).
const PLANNABLE = new Set(['build.place', 'decor.place', 'decor.placeRun', 'road.paint', 'tree.plant']);
const c = (t: number) => t * TILE_FP + TILE_FP / 2;

const mini = (layout: PatternDef['layout']): PatternDef => ({ ...content.patterns[0]!, layout });

describe('turning offsets', () => {
  it('turns clockwise a quarter at a time', () => {
    expect(turnOffset(2, 0, 0)).toEqual([2, 0]);
    expect(turnOffset(2, 0, 1)).toEqual([-0, 2]);
    expect(turnOffset(2, 0, 2)).toEqual([-2, -0]);
    expect(turnOffset(2, 1, 3)).toEqual([1, -2]);
  });
});

describe('layout commands', () => {
  it('places decor and trees at tile centers from the anchor', () => {
    const def = mini([
      { decor: 'lantern', dx: 1, dz: -1 },
      { tree: 'oak', dx: 2, dz: 0 },
    ]);
    expect(layoutCommands(def, [10, 10], 0)).toEqual([
      { t: 'decor.place', def: 'lantern', fx: c(11), fz: c(9), rot: 0 },
      { t: 'tree.plant', species: 'oak', x: 12, z: 10 },
    ]);
  });

  it('a quarter turn moves the offsets and turns decor by 16', () => {
    const def = mini([{ decor: 'lantern', dx: 2, dz: 0, rot: 4 }]);
    expect(layoutCommands(def, [10, 10], 1)).toEqual([
      { t: 'decor.place', def: 'lantern', fx: c(10), fz: c(12), rot: 20 },
    ]);
  });

  it('keeps a turned building footprint in place', () => {
    const bed = content.patterns.flatMap((p) => p.layout ?? []).find((p) => 'building' in p);
    expect(bed).toBeDefined();
    const id = (bed as { building: string }).building;
    const size = content.buildingById.get(id)!.size;
    const def = mini([{ building: id, dx: 0, dz: 0 }]);
    const [cmd] = layoutCommands(def, [20, 20], 1);
    // Turned a quarter, the footprint spans x from 20 - (depth - 1) to 20, z from 20 for width tiles.
    expect(cmd).toEqual({ t: 'build.place', def: id, x: 20 - (size[1] - 1), z: 20, rot: 1 });
  });

  it('draws a road tile by tile and a run from tile center to tile center', () => {
    const def = mini([
      { road: 'path', dx: 0, dz: 0, tx: 3, tz: 0 },
      { run: 'hedge', dx: 0, dz: 1, tx: 3, tz: 1 },
    ]);
    expect(layoutCommands(def, [5, 5], 3)).toEqual([
      {
        t: 'road.paint',
        kind: 'path',
        tiles: [
          [5, 5],
          [5, 4],
          [5, 3],
          [5, 2],
        ],
      },
      { t: 'decor.placeRun', def: 'hedge', from: [c(6), c(5)], to: [c(6), c(2)] },
    ]);
  });

  it('leaves out decor the valley has locked', () => {
    const def = mini([
      { decor: 'lantern', dx: 0, dz: 0 },
      { run: 'hedge', dx: 0, dz: 1, tx: 2, tz: 1 },
    ]);
    expect(layoutCommands(def, [5, 5], 0, undefined, () => true)).toEqual([]);
  });

  it('every layout in content makes plannable commands, at every turn', () => {
    const withLayout = content.patterns.filter((p) => p.layout);
    expect(withLayout.length).toBeGreaterThan(0);
    for (const def of withLayout) {
      for (const turn of [0, 1, 2, 3] as const) {
        const pieces = layoutPieces(def, [30, 30], turn);
        expect(pieces.length, def.id).toBe(def.layout!.length);
        for (const p of pieces) {
          expect(PLANNABLE.has(p.cmd.t), `${def.id}: ${p.cmd.t}`).toBe(true);
          expect(p.tiles.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
