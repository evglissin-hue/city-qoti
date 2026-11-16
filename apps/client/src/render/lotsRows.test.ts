// V3B: rows, storeys, corners, gardens, yards and the endpaper feed, from synthetic lots.
import { afterEach, describe, expect, it } from 'vitest';
import { MAP_SIZE, type BuildingView, type LotView } from '@qoti/sim';
import { rowEaves } from '@qoti/art';
import type { Mirror } from '../state/mirror';
import { rowNeighbors } from './layers/buildings';
import { endpaperStreets, gardenParams, lotSignature, lotsFor, rowParams, yardOf } from './lots';
import { buildingKey, setRowReader } from './kitGeometry';

const N = 64;
type Rot = 0 | 1 | 2 | 3;
type Extra = Record<string, unknown>;

function home(id: number, def: string, x: number, z: number, rot: Rot = 0, extra: Extra = {}) {
  return { id, def, x, z, rot, stage: 'built', ...extra } as unknown as BuildingView;
}

function lot(
  id: number,
  b: BuildingView | 0,
  extra: Extra = {},
  at?: [number, number, Rot, number?, number?],
) {
  return {
    id,
    zone: 'homes',
    x: at ? at[0] : b ? b.x : 0,
    z: at ? at[1] : b ? b.z : 0,
    w: at?.[3] ?? 2,
    d: at?.[4] ?? 2,
    rot: at ? at[2] : b ? b.rot : 0,
    desirability: 1,
    style: '',
    buildingId: b ? b.id : 0,
    ...extra,
  } as unknown as LotView;
}

function mirrorOf(
  buildings: BuildingView[],
  lots: LotView[],
  roads: [number, number][] = [],
  level: (id: number) => number = () => 2,
): Mirror {
  const occ = new Int32Array(N * N);
  const road = new Uint8Array(N * N);
  for (const b of buildings)
    for (let z = b.z; z < b.z + 2; z++) for (let x = b.x; x < b.x + 2; x++) occ[z * N + x] = b.id;
  for (const [x, z] of roads) road[z * N + x] = 1;
  return {
    buildings: new Map(buildings.map((b) => [b.id, b])),
    lots: new Map(lots.map((l) => [l.id, l])),
    occupant: (x: number, z: number) => (x < 0 || z < 0 || x >= N || z >= N ? 0 : occ[z * N + x]!),
    road: (x: number, z: number) => (x < 0 || z < 0 || x >= N || z >= N ? 0 : road[z * N + x]!),
    height: () => 2,
    water: () => 0,
    padLevel: (x: number, z: number) => level(occ[z * N + x]!),
  } as unknown as Mirror;
}

/** A touching row of cottages at x = 10, 12, ... on z = 10, with the given storeys (undefined: unknown). */
function rowOfCottages(storeys: (number | undefined)[], row = 5, x0 = 10, z = 10) {
  const bs = storeys.map((s, i) =>
    home(100 + i, 'cottage', x0 + 2 * i, z, 0, s === undefined ? {} : { storeys: s }),
  );
  return { bs, lots: bs.map((b) => lot(b.id, b, { row })) };
}

const storeysOfRow = (m: Mirror): number[] => lotsFor(m).lots.map((l) => l.storeys);

afterEach(() => setRowReader(null));

describe('rows hold plots only', () => {
  it('keeps a garden that shares its owner row id out of the row order', () => {
    const { bs, lots } = rowOfCottages([2, 2, 2], 7);
    const garden = lot(50, 0, { row: 7, kind: 'garden' }, [10, 6, 0, 4, 4]);
    const r = lotsFor(mirrorOf(bs, [...lots, garden]));
    expect(r.rows.get(7)!.map((l) => l.id)).toEqual([100, 101, 102]);
    expect(r.gardens.map((g) => g.id)).toEqual([50]);
    expect(r.lots.find((l) => l.id === 50)!.kind).toBe('garden');
  });

  it('does not count a garden toward a row of one', () => {
    const b = home(1, 'cottage', 10, 10);
    const r = lotsFor(
      mirrorOf([b], [lot(1, b, { row: 7 }), lot(2, 0, { row: 7, kind: 'garden' }, [10, 6, 0, 2, 2])]),
    );
    expect(r.rows.size).toBe(0);
  });
});

describe('storeys, one step at a time', () => {
  const run = (s: (number | undefined)[]) => {
    const { bs, lots } = rowOfCottages(s);
    return storeysOfRow(mirrorOf(bs, lots));
  };

  it('leaves a valid stepped skyline alone', () => {
    expect(run([1.5, 2, 3, 4, 3, 2])).toEqual([1.5, 2, 3, 4, 3, 2]);
    expect(run([2, 2, 2, 2])).toEqual([2, 2, 2, 2]);
  });

  it('steps a 1 beside a 4 (the upper envelope)', () => {
    expect(run([4, 1])).toEqual([4, 3]);
    expect(run([1, 1, 4, 1, 1])).toEqual([2, 3, 4, 3, 2]);
    expect(run([1, 4, 1, 1, 1])).toEqual([3, 4, 3, 2, 1]);
  });

  it('never goes past four', () => {
    expect(run([4, 4, 9, 4])).toEqual([4, 4, 4, 4]);
  });

  it('does not step across a gap or an unknown lot', () => {
    const gapped = [
      home(1, 'cottage', 10, 10, 0, { storeys: 4 }),
      home(2, 'cottage', 13, 10, 0, { storeys: 1 }),
    ];
    expect(
      storeysOfRow(
        mirrorOf(
          gapped,
          gapped.map((b) => lot(b.id, b, { row: 3 })),
        ),
      ),
    ).toEqual([4, 1]);
    expect(run([4, undefined, 1])).toEqual([4, 1, 1]);
  });

  it('reports whether the storeys were known', () => {
    const { bs, lots } = rowOfCottages([2, undefined]);
    expect(lotsFor(mirrorOf(bs, lots)).lots.map((l) => l.storeysKnown)).toEqual([true, false]);
  });
});

describe('rowParams, a row of 24', () => {
  const { bs, lots } = rowOfCottages(
    Array.from({ length: 24 }, () => 2),
    9,
    4,
  );
  const m = mirrorOf(bs, lots);
  const screen = lotsFor(m);
  const params = rowParams(m, screen);

  it('joins every inner side, with party eaves and storeys', () => {
    expect(screen.rows.get(9)).toHaveLength(24);
    const eaves = rowEaves('cottage', 2)!;
    expect(params.get(100)).toEqual({ joinR: 'cottage', partyR: eaves, storeys: 2 });
    expect(params.get(123)).toEqual({ joinL: 'cottage', partyL: eaves, storeys: 2 });
    for (let i = 1; i < 23; i++)
      expect(params.get(100 + i)).toEqual({
        joinL: 'cottage',
        joinR: 'cottage',
        partyL: eaves,
        partyR: eaves,
        storeys: 2,
      });
  });

  it('names a taller neighbor by its own eaves', () => {
    const t = rowOfCottages([1.5, 3]);
    const p = rowParams(mirrorOf(t.bs, t.lots), lotsFor(mirrorOf(t.bs, t.lots)));
    expect(p.get(100)!.partyR).toBe(rowEaves('cottage', 3));
    expect(p.get(101)!.partyL).toBe(rowEaves('cottage', 2)); // 1.5 beside a 3 is clamped to 2;
  });

  it('marks a road side of an unjoined end', () => {
    const t = rowOfCottages([2, 2]);
    const mm = mirrorOf(t.bs, t.lots, [[9, 11]]);
    expect(rowParams(mm, lotsFor(mm)).get(100)).toMatchObject({ streetL: true, joinR: 'cottage' });
  });

  it('does not join a neighbor that sits in another row', () => {
    const a = home(1, 'cottage', 10, 10);
    const b = home(2, 'cottage', 12, 10);
    const mm = mirrorOf([a, b], [lot(1, a, { row: 1 }), lot(2, b, { row: 2 })]);
    expect(rowParams(mm, lotsFor(mm)).get(1)).toEqual({});
  });
});

describe('rowParams equals rowNeighbors on the fallback', () => {
  it('for every building: joined rows, a lone house by a road, gaps, steps, hand-placed homes', () => {
    const bs = [
      home(1, 'cottage', 10, 10),
      home(2, 'townhouse', 12, 10),
      home(3, 'cottage', 14, 10),
      home(4, 'cottage', 30, 30),
      home(5, 'cottage', 20, 10, 2),
      home(6, 'cottage', 22, 10, 2),
      home(7, 'cottage', 40, 10),
      home(8, 'cottage', 43, 10),
      home(9, 'cottage', 50, 10),
      home(10, 'cottage', 52, 10),
      home(11, 'bakery', 56, 10),
      home(12, 'cottage', 58, 10),
      home(13, 'cottage', 30, 20, 1),
      home(14, 'cottage', 30, 22, 1),
    ];
    // Hand-placed homes (no lot): 12, 13 and 14, one of them touching a lotted house's row.
    const lots = bs.slice(0, 11).map((b) => lot(b.id, b));
    const roads: [number, number][] = [
      [32, 31],
      [19, 11],
      [39, 11],
      [46, 11],
      [28, 22],
    ];
    const m = mirrorOf(bs, lots, roads, (id) => (id === 10 ? 3 : 2));
    const screen = lotsFor(m);
    expect(screen.fromSim).toBe(false);
    const params = rowParams(m, screen);
    let seen = 0;
    for (const b of bs) {
      const expected = rowNeighbors(m, b);
      if (b.def === 'bakery') {
        expect(params.has(b.id)).toBe(false);
        continue;
      }
      expect(params.get(b.id), `building ${b.id}`).toEqual(expected);
      seen++;
    }
    expect(seen).toBe(13);
    // The lone house beside a road and the joined ends really carry something.
    expect(params.get(4)).toEqual({ streetR: true });
    expect(params.get(1)).toEqual({ joinR: 'townhouse' });
    // Joined homes with no lot of their own still join (hand-placed: 13 and 14).
    expect(params.get(13)).toEqual(rowNeighbors(m, bs[12]!));
  });
});

describe('corners', () => {
  // The kit-local right of each rotation, as a world step.
  const RIGHT = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const;
  for (const rot of [0, 1, 2, 3] as const) {
    it(`picks the side of the second street at rot ${rot}`, () => {
      const [rx, rz] = RIGHT[rot];
      // A 2x2 at (20, 20): the tile one step out along local +x and local -x (at the front row).
      const right: [number, number] = [rx > 0 ? 22 : rx < 0 ? 19 : 20, rz > 0 ? 22 : rz < 0 ? 19 : 20];
      const left: [number, number] = [rx > 0 ? 19 : rx < 0 ? 22 : 20, rz > 0 ? 19 : rz < 0 ? 22 : 20];
      const front: [number, number] = [20, rot === 0 ? 22 : 19];
      for (const [tile, want] of [
        [right, 'R'],
        [left, 'L'],
      ] as const) {
        const b = home(1, 'cottage', 20, 20, rot);
        const m = mirrorOf(
          [b],
          [lot(1, b, { row: 1, corner: true, frontage2: tile[1] * MAP_SIZE + tile[0] })],
        );
        expect(rowParams(m, lotsFor(m)).get(1)!.corner).toBe(want);
      }
      if (rot === 0 || rot === 2) {
        const b = home(1, 'cottage', 20, 20, rot);
        const m = mirrorOf(
          [b],
          [lot(1, b, { row: 1, corner: true, frontage2: front[1] * MAP_SIZE + front[0] })],
        );
        expect(rowParams(m, lotsFor(m)).get(1)!.corner).toBeUndefined();
      }
    });
  }

  it('leaves corner unset on a side that is joined, and on a plain lot', () => {
    const a = home(1, 'cottage', 20, 20);
    const b = home(2, 'cottage', 22, 20);
    const m = mirrorOf(
      [a, b],
      [lot(1, a, { row: 1 }), lot(2, b, { row: 1, corner: true, frontage2: 20 * MAP_SIZE + 24 })],
    );
    const p = rowParams(m, lotsFor(m));
    expect(p.get(1)!.corner).toBeUndefined();
    expect(p.get(2)!.corner).toBe('R');
    expect(p.get(2)!.joinL).toBe('cottage');
  });
});

describe('storeys in the build key', () => {
  it('rebuilds when the lot storeys change, and only then', () => {
    const keyAt = (storeys: number): string => {
      const b = home(1, 'cottage', 10, 10);
      const m = mirrorOf([b], [lot(1, b, { row: 1, storeys })]);
      setRowReader((v) => rowParams(m, lotsFor(m)).get(v.id) ?? {});
      return buildingKey(b);
    };
    expect(keyAt(2)).not.toBe(keyAt(3));
    expect(keyAt(2)).toBe(keyAt(2));
    expect(keyAt(2)).toContain('storeys=2');
  });
});

describe('gardens', () => {
  function block() {
    // A row of three houses on z = 10 facing south, its back (north) to a 4x4 garden lot, a road
    // round the garden's north and west, open fields to its east.
    const { bs, lots } = rowOfCottages([2, 2], 4, 10, 10);
    const plots = lots.map((l) => ({ ...l, style: 'brick' }) as unknown as LotView);
    const garden = lot(60, 0, { row: 4, kind: 'garden' }, [10, 6, 0, 4, 4]);
    const roads: [number, number][] = [];
    for (let x = 9; x < 15; x++) roads.push([x, 5]);
    for (let z = 5; z < 10; z++) roads.push([9, z]);
    return { bs, lots: [...plots, garden], roads };
  }

  it('reads its sides and walls: plots never, road and open always', () => {
    const { bs, lots, roads } = block();
    const m = mirrorOf(bs, lots, roads);
    const g = gardenParams(m, lotsFor(m)).get(60)!;
    // North road, east open, south the backs of the houses (z = 10 holds x 10 and 11 only), west road.
    expect(g.sides).toBe('ropr');
    expect(g.walls).toBe('new');
    expect(g.style).toBe('brick');
  });

  it('puts a garden-to-garden wall on the lower id only', () => {
    const a = lot(61, 0, { row: 4, kind: 'garden' }, [10, 6, 0, 2, 4]);
    const b = lot(62, 0, { row: 4, kind: 'garden' }, [12, 6, 0, 2, 4]);
    const m = mirrorOf([], [a, b]);
    const p = gardenParams(m, lotsFor(m));
    expect(p.get(61)!.sides[1]).toBe('g');
    expect(p.get(62)!.sides[3]).toBe('g');
    expect(p.get(61)!.walls).toContain('e');
    expect(p.get(62)!.walls).not.toContain('w');
  });

  it('gives a style of "" when the row has none', () => {
    const a = lot(61, 0, { row: 4, kind: 'garden' }, [10, 6, 0, 2, 4]);
    const m = mirrorOf([], [a]);
    expect(gardenParams(m, lotsFor(m)).get(61)!.style).toBe('');
  });
});

describe('yardOf', () => {
  it('is null with no lot', () => {
    const b = home(1, 'cottage', 10, 10);
    const m = mirrorOf([b], []);
    expect(yardOf(m, 1)).toBeNull();
    expect(yardOf(m, 99)).toBeNull();
  });

  it('gives a lone house its whole lot', () => {
    const b = home(1, 'cottage', 10, 10);
    const m = mirrorOf([b], [lot(1, b, {}, [10, 10, 0, 3, 4])]);
    expect(yardOf(m, 1)).toEqual({ x: 10, z: 10, w: 3, d: 4 });
  });

  it('stops at the footprint on a joined side (end and middle houses)', () => {
    // Lots a tile wider than the houses, the spare tile standing against the neighbor (synthetic).
    const a = home(1, 'cottage', 10, 10);
    const b = home(2, 'cottage', 12, 10);
    const c = home(3, 'cottage', 14, 10);
    const m = mirrorOf(
      [a, b, c],
      [
        lot(1, a, { row: 1 }, [10, 10, 0, 3, 2]),
        lot(2, b, { row: 1 }, [12, 10, 0, 3, 2]),
        lot(3, c, { row: 1 }, [14, 10, 0, 3, 2]),
      ],
    );
    expect(yardOf(m, 1)).toEqual({ x: 10, z: 10, w: 2, d: 2 });
    expect(yardOf(m, 2)).toEqual({ x: 12, z: 10, w: 2, d: 2 });
    // The end house keeps its spare side tile.
    expect(yardOf(m, 3)).toEqual({ x: 14, z: 10, w: 3, d: 2 });
  });

  it('cuts off a garden lot', () => {
    const b = home(1, 'cottage', 30, 30);
    const m = mirrorOf(
      [b],
      [lot(1, b, {}, [30, 30, 0, 2, 4]), lot(2, 0, { row: 1, kind: 'garden' }, [30, 32, 0, 2, 2])],
    );
    expect(yardOf(m, 1)).toEqual({ x: 30, z: 30, w: 2, d: 2 });
  });
});

describe('endpaperStreets', () => {
  it('lists a roofline per built plot in row order, lone lots with row 0, and the gardens', () => {
    const { bs, lots } = rowOfCottages([2, 3], 3);
    const lone = home(200, 'cottage', 30, 30, 2);
    const site = home(201, 'cottage', 40, 40, 0, { stage: 'construction' });
    const garden = lot(70, 0, { row: 3, kind: 'garden' }, [10, 6, 0, 4, 4]);
    const m = mirrorOf([...bs, lone, site], [...lots, lot(200, lone), lot(201, site), garden]);
    const e = endpaperStreets(m);
    expect(e.rooflines).toEqual([
      { row: 3, x: 10, z: 10, w: 2, d: 2, rot: 0, storeys: 2 },
      { row: 3, x: 12, z: 10, w: 2, d: 2, rot: 0, storeys: 3 },
      { row: 0, x: 30, z: 30, w: 2, d: 2, rot: 2, storeys: 1 },
    ]);
    expect(e.gardens).toEqual([{ x: 10, z: 6, w: 4, d: 4 }]);
  });
});

describe('lotSignature', () => {
  it('moves with the lot fields and with nothing else', () => {
    const b = home(1, 'cottage', 10, 10);
    const sig = (extra: Extra): string => lotSignature(mirrorOf([b], [lot(1, b, extra)]));
    expect(sig({ row: 1, storeys: 2 })).toBe(sig({ row: 1, storeys: 2 }));
    expect(sig({ row: 1, storeys: 2 })).not.toBe(sig({ row: 1, storeys: 3 }));
    expect(sig({ row: 1 })).not.toBe(sig({ row: 1, corner: true, frontage2: 5 }));
  });
});
