// V3.0: lotsFor, the one shape the long view draws rows, gardens, corners and storeys from.
import { describe, expect, it } from 'vitest';
import type { BuildingView, LotView } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { lotsFor } from './lots';

const N = 64;

type Extra = Record<string, unknown>;

function home(id: number, def: string, x: number, z: number, rot: 0 | 1 | 2 | 3 = 0, extra: Extra = {}) {
  return { id, def, x, z, rot, stage: 'built', ...extra } as unknown as BuildingView;
}

function lot(id: number, b: BuildingView | 0, extra: Extra = {}, at?: [number, number, 0 | 1 | 2 | 3]) {
  return {
    id,
    zone: 'homes',
    x: at ? at[0] : b ? b.x : 0,
    z: at ? at[1] : b ? b.z : 0,
    w: 2,
    d: 2,
    rot: at ? at[2] : b ? b.rot : 0,
    desirability: 1,
    style: 'old',
    buildingId: b ? b.id : 0,
    ...extra,
  } as unknown as LotView;
}

function mirrorOf(buildings: BuildingView[], lots: LotView[]): Mirror {
  const occ = new Int32Array(N * N);
  for (const b of buildings)
    for (let z = b.z; z < b.z + 2; z++) for (let x = b.x; x < b.x + 2; x++) occ[z * N + x] = b.id;
  return {
    buildings: new Map(buildings.map((b) => [b.id, b])),
    lots: new Map(lots.map((l) => [l.id, l])),
    occupant: (x: number, z: number) => (x < 0 || z < 0 || x >= N || z >= N ? 0 : occ[z * N + x]!),
    road: () => 0,
    height: () => 2,
    water: () => 0,
    padLevel: () => 2,
  } as unknown as Mirror;
}

describe('lotsFor, sim path', () => {
  it('uses the sim row and orders each row left to right seen from the road', () => {
    // Rot 0 faces +z, so left to right is increasing x; rot 2 faces -z, so decreasing x.
    const bs = [home(3, 'cottage', 14, 10), home(1, 'cottage', 10, 10), home(2, 'cottage', 12, 10)];
    const bs2 = [home(6, 'cottage', 10, 20, 2), home(4, 'cottage', 14, 20, 2), home(5, 'cottage', 12, 20, 2)];
    const lots = [...bs, ...bs2].map((b) => lot(b.id, b, { row: b.id <= 3 ? 7 : 9 }));
    const r = lotsFor(mirrorOf([...bs, ...bs2], lots));
    expect(r.fromSim).toBe(true);
    expect(r.lots.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.rows.get(7)!.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(r.rows.get(9)!.map((l) => l.id)).toEqual([4, 5, 6]);
    expect(r.lots.every((l) => l.rowSource === 'sim')).toBe(true);
  });

  it('orders rot 1 and rot 3 rows along z', () => {
    const a = home(1, 'cottage', 10, 10, 1);
    const b = home(2, 'cottage', 10, 12, 1);
    const c = home(3, 'cottage', 20, 10, 3);
    const d = home(4, 'cottage', 20, 12, 3);
    const r = lotsFor(
      mirrorOf(
        [a, b, c, d],
        [lot(1, a, { row: 1 }), lot(2, b, { row: 1 }), lot(3, c, { row: 2 }), lot(4, d, { row: 2 })],
      ),
    );
    expect(r.rows.get(1)!.map((l) => l.id)).toEqual([1, 2]);
    expect(r.rows.get(2)!.map((l) => l.id)).toEqual([4, 3]);
  });

  it('reads kind', () => {
    const r = lotsFor(
      mirrorOf([], [lot(1, 0, { row: 1, kind: 'garden' }, [5, 5, 0]), lot(2, 0, { row: 1 }, [7, 5, 0])]),
    );
    expect(r.lots.map((l) => l.kind)).toEqual(['garden', 'plot']);
  });

  it('reads corner and frontage2', () => {
    const r = lotsFor(
      mirrorOf(
        [],
        [
          lot(1, 0, { row: 1, corner: true, frontage2: 3 * N + 4 }, [5, 5, 0]),
          lot(2, 0, { row: 1 }, [7, 5, 0]),
        ],
      ),
    );
    expect(r.lots[0]).toMatchObject({ corner: true, frontage2: 3 * N + 4 });
    expect(r.lots[1]!.corner).toBe(false);
    expect(r.lots[1]!.frontage2).toBeUndefined();
  });

  it('reads storeys from the field or from params, clamped to a half', () => {
    const bs = [
      // A tile apart, so the one-step rule (lotsFor clamps touching neighbors) leaves them be.
      home(1, 'cottage', 10, 10, 0, { storeys: 2 }),
      home(2, 'cottage', 13, 10, 0, { params: { storeys: 1.5 } }),
      home(3, 'cottage', 16, 10, 0, { storeys: 9 }),
      home(4, 'cottage', 19, 10, 0, { storeys: 0 }),
      home(5, 'cottage', 22, 10, 0, { params: { storeys: 2.26 } }),
      home(6, 'cottage', 25, 10, 0),
    ];
    const r = lotsFor(
      mirrorOf(bs, [...bs.map((b) => lot(b.id, b, { row: 1 })), lot(7, 0, { row: 1 }, [30, 10, 0])]),
    );
    expect(r.lots.map((l) => l.storeys)).toEqual([2, 1.5, 4, 1, 2.5, 1, 1]);
  });

  it("prefers the lot's own storeys (R2.0's LotView.storeys) over its building's", () => {
    const b = home(1, 'cottage', 10, 10, 0, { storeys: 2 });
    const r = lotsFor(mirrorOf([b], [lot(1, b, { row: 1, storeys: 3 })]));
    expect(r.lots[0]!.storeys).toBe(3);
  });
});

describe('lotsFor, fallback', () => {
  it('joins side by side homes into a negative row, a lone house has row 0', () => {
    const a = home(1, 'cottage', 10, 10);
    const b = home(2, 'townhouse', 12, 10);
    const c = home(3, 'cottage', 14, 10);
    const lone = home(4, 'cottage', 30, 30);
    const r = lotsFor(mirrorOf([c, b, a, lone], [lot(3, c), lot(2, b), lot(1, a), lot(4, lone)]));
    expect(r.fromSim).toBe(false);
    const row = r.lots[0]!.row;
    expect(row).toBeLessThan(0);
    expect(r.rows.get(row)!.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(r.lots.slice(0, 3).every((l) => l.row === row && l.rowSource === 'joined')).toBe(true);
    expect(r.lots[3]).toMatchObject({ row: 0, kind: 'plot', corner: false, storeys: 1 });
    expect(r.rows.size).toBe(1);
  });

  it('numbers joined rows by their smallest lot id and orders them along the frontage', () => {
    const a = home(5, 'cottage', 10, 10, 2);
    const b = home(6, 'cottage', 12, 10, 2);
    const c = home(1, 'cottage', 20, 10);
    const d = home(2, 'cottage', 22, 10);
    const r = lotsFor(mirrorOf([a, b, c, d], [lot(5, a), lot(6, b), lot(1, c), lot(2, d)]));
    expect(r.rows.get(-1)!.map((l) => l.id)).toEqual([1, 2]);
    expect(r.rows.get(-2)!.map((l) => l.id)).toEqual([6, 5]);
  });
});

describe('lotsFor, mixed', () => {
  it('falls back to joined rows for lots with row 0', () => {
    const a = home(1, 'cottage', 10, 10);
    const b = home(2, 'cottage', 12, 10);
    const r = lotsFor(mirrorOf([a, b], [lot(1, a, { row: 0, kind: 'plot' }), lot(2, b, { row: 0 })]));
    expect(r.fromSim).toBe(false);
    expect(r.lots.map((l) => [l.row, l.rowSource])).toEqual([
      [-1, 'joined'],
      [-1, 'joined'],
    ]);
  });
});
