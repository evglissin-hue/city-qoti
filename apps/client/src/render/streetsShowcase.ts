// Debug only: a synthetic town block for reviewing V3B's rows, gardens, corners and storeys in the
// real renderer, in this client's Mirror only (the sim never sees any of it). R2's lot fields reach
// `main` only with R2X, so the lots here carry them by hand, as `lots.ts` reads them (`row`, `kind`,
// `corner`, `frontage2`, `storeys`).
//
// The scene, on cleared flat ground (bx, bz is the block's north-west tile):
// - A closed block, 14 x 10 tiles, ringed by four streets. Rows of lots 2 wide and 3 deep face
//   outward onto their street; the four corner lots are 3 x 3 and front two streets. The hollow
//   behind the rows (8 x 4) is cut into garden lots.
// - A row of 24 joined homes on a street to the south, its storeys stepping up and down.
// - A short row north of the block with no road behind it, so the fields stay open there.
import { content } from '@qoti/content';
import {
  footprintSize,
  MAP_SIZE,
  Road,
  Terrain,
  TILE_FP,
  type BuildingView,
  type LayerName,
  type LotView,
  type Rect,
  type Rot4,
  type SimEvent,
} from '@qoti/sim';
import type { Mirror } from '../state/mirror';

const N = MAP_SIZE;
const FIRST_BUILDING = 970_000;
const FIRST_LOT = 980_000;

export interface StreetsShowcaseResult {
  center: [number, number];
  buildings: number;
  lots: number;
  gardens: number;
}

/** The lot fields R2 adds to `LotView` and the storeys it adds to `BuildingView`, as lots.ts reads them. */
type Lot = LotView & {
  row: number;
  kind: 'plot' | 'garden';
  corner?: true;
  frontage2?: number;
  storeys?: number;
};
type Building = BuildingView & { storeys: number };

/** Storeys by def for the block's rows (neighbors stay within one of each other). */
const BLOCK_STOREYS: Record<string, number> = { cottage: 1.5, house: 2, 'corner-shop': 2, townhouse: 2.5 };

/** The stepped row's storeys, one per home: never more than one between neighbors, at most four. */
export const STEPPED_STOREYS: readonly number[] = [
  1.5, 1.5, 2, 2, 3, 3, 4, 3, 2, 2, 1.5, 1, 1, 1.5, 2, 2, 3, 3, 2, 2, 1.5, 1.5, 1, 1,
];

const STYLES = ['brick', 'plaster', 'stone'] as const;

export function streetsShowcase(mirror: Mirror, cx = 96, cz = 90): StreetsShowcaseResult {
  const L = mirror.layers;
  const road = new Uint8Array(L.road as Uint8Array);
  const height = new Uint8Array(L.height as Uint8Array);
  const tree = new Uint8Array(L.tree as Uint8Array);
  const water = new Uint8Array(L.water as Uint8Array);
  const terrain = new Uint8Array(L.terrain as Uint8Array);
  const occupant = new Int32Array(L.occupant as Int32Array);
  const h0 = Math.max(3, height[cz * N + cx]!);

  const bx = cx - 7;
  const bz = cz - 5;
  const rect: Rect = [cx - 30, bz - 9, cx + 30, bz + 28];
  const events: SimEvent[] = [];

  // Clear the ground, and any lot or building the area already held.
  for (const b of mirror.buildings.values())
    if (b.x >= rect[0] && b.x <= rect[2] && b.z >= rect[1] && b.z <= rect[3])
      events.push({ e: 'building.removed', id: b.id });
  for (const l of mirror.lots.values())
    if (l.x >= rect[0] && l.x <= rect[2] && l.z >= rect[1] && l.z <= rect[3])
      events.push({ e: 'lot.removed', id: l.id });
  // The grown village's decor too (its lanterns, pots and cherry trees stood in the gardens).
  for (const d of mirror.decor.values()) {
    const x = Math.floor(d.fx / TILE_FP);
    const z = Math.floor(d.fz / TILE_FP);
    if (x >= rect[0] && x <= rect[2] && z >= rect[1] && z <= rect[3])
      events.push({ e: 'decor.removed', id: d.id });
  }
  for (let z = rect[1]; z <= rect[3]; z++) {
    for (let x = rect[0]; x <= rect[2]; x++) {
      const i = z * N + x;
      height[i] = h0;
      tree[i] = 0;
      road[i] = 0;
      water[i] = 0;
      terrain[i] = Terrain.grass;
      occupant[i] = 0;
    }
  }
  const street = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) road[z * N + x] = Road.street;
  };
  // Four streets round the block (the north one also fronts the short row), and the stepped row's.
  street(bx - 1, bz - 2, bx + 14, bz - 1);
  street(bx - 1, bz + 10, bx + 14, bz + 10);
  street(bx - 1, bz - 2, bx - 1, bz + 10);
  street(bx + 14, bz - 2, bx + 14, bz + 10);
  street(cx - 26, bz + 18, cx + 25, bz + 18);

  let bid = FIRST_BUILDING;
  let lid = FIRST_LOT;
  let buildings = 0;
  let lots = 0;
  let gardens = 0;

  interface PlotSpec {
    x: number;
    z: number;
    w: number;
    d: number;
    rot: Rot4;
    def: string;
    row: number;
    style: string;
    storeys: number;
    /** Tiles from the lot's low-coordinate side along the frontage to the building. */
    along?: number;
    /** frontage2 of a corner lot: the second street's road tile index. */
    corner?: number;
  }
  const plot = (p: PlotSpec) => {
    const def = content.buildingById.get(p.def);
    if (!def) return;
    const [fw, fd] = footprintSize(def, p.rot);
    // Against the lot's front: the entrance tile is in the front row of the footprint.
    const along = p.along ?? 0;
    const x = p.rot === 1 ? p.x : p.rot === 3 ? p.x + p.w - fw : p.x + along;
    const z = p.rot === 0 ? p.z + p.d - fd : p.rot === 2 ? p.z : p.z + along;
    const id = bid++;
    const lotId = lid++;
    for (let lz = 0; lz < fd; lz++)
      for (let lx = 0; lx < fw; lx++) {
        occupant[(z + lz) * N + x + lx] = id;
        road[(z + lz) * N + x + lx] = 0;
      }
    const b: Building = {
      id,
      def: p.def,
      x,
      z,
      rot: p.rot,
      builtBy: 0,
      handmade: false,
      stage: 'built',
      foundation: false,
      lot: lotId,
      style: p.style,
      storeys: p.storeys,
    };
    const l: Lot = {
      id: lotId,
      zone: p.def === 'corner-shop' ? 'shops' : 'homes',
      x: p.x,
      z: p.z,
      w: p.w,
      d: p.d,
      rot: p.rot,
      desirability: 1,
      style: p.style,
      buildingId: id,
      row: p.row,
      kind: 'plot',
      storeys: p.storeys,
    };
    if (p.corner !== undefined) {
      l.corner = true;
      l.frontage2 = p.corner;
    }
    events.push({ e: 'building.added', b }, { e: 'lot.added', l });
    buildings++;
    lots++;
  };
  const garden = (x: number, z: number, w: number, d: number, rot: Rot4, row: number, style: string) => {
    const l: Lot = {
      id: lid++,
      zone: '',
      x,
      z,
      w,
      d,
      rot,
      desirability: 1,
      style,
      buildingId: 0,
      row,
      kind: 'garden',
    };
    events.push({ e: 'lot.added', l });
    lots++;
    gardens++;
  };
  const st = (def: string) => BLOCK_STOREYS[def] ?? 1;
  const at = (x: number, z: number) => z * N + x;

  // North row, brick, facing north. Corners are 3 x 3; their buildings stand at the inner end so
  // the row joins.
  const north = [
    ['corner-shop', bx, 3],
    ['cottage', bx + 3, 2],
    ['townhouse', bx + 5, 2],
    ['house', bx + 7, 2],
    ['cottage', bx + 9, 2],
    ['townhouse', bx + 11, 3],
  ] as const;
  for (const [i, [def, x, w]] of north.entries()) {
    const corner = i === 0 ? at(bx - 1, bz + 1) : i === 5 ? at(bx + 14, bz + 1) : undefined;
    plot({
      x,
      z: bz,
      w,
      d: 3,
      rot: 2,
      def,
      row: 1,
      style: 'brick',
      storeys: st(def),
      along: i === 0 ? 1 : 0,
      ...(corner === undefined ? {} : { corner }),
    });
  }
  // South row, plaster, facing south.
  const south = [
    ['townhouse', bx, 3],
    ['cottage', bx + 3, 2],
    ['house', bx + 5, 2],
    ['townhouse', bx + 7, 2],
    ['cottage', bx + 9, 2],
    ['corner-shop', bx + 11, 3],
  ] as const;
  for (const [i, [def, x, w]] of south.entries()) {
    const corner = i === 0 ? at(bx - 1, bz + 8) : i === 5 ? at(bx + 14, bz + 8) : undefined;
    plot({
      x,
      z: bz + 7,
      w,
      d: 3,
      rot: 0,
      def,
      row: 2,
      style: 'plaster',
      storeys: st(def),
      along: i === 0 ? 1 : 0,
      ...(corner === undefined ? {} : { corner }),
    });
  }
  // West side, stone, facing west; east side, timber, facing east. Lots are 3 wide, 2 along z.
  const side = (x: number, z: number, rot: Rot4, def: string, row: number, style: string) =>
    plot({ x, z, w: 3, d: 2, rot, def, row, style, storeys: st(def) });
  side(bx, bz + 3, 1, 'cottage', 3, 'stone');
  side(bx, bz + 5, 1, 'townhouse', 3, 'stone');
  side(bx + 11, bz + 3, 3, 'house', 4, 'timber');
  side(bx + 11, bz + 5, 3, 'cottage', 4, 'timber');

  // The hollow (x bx+3..bx+10, z bz+3..bz+6) cut into gardens, one per row lot it backs onto.
  for (const x of [bx + 3, bx + 5, bx + 7, bx + 9]) {
    garden(x, bz + 3, 2, 2, 2, 1, 'brick');
    garden(x, bz + 5, 2, 2, 0, 2, 'plaster');
  }

  // The stepped row on the south street: 24 homes, one row, facing south.
  for (const [i, s] of STEPPED_STOREYS.entries()) {
    plot({
      x: cx - 24 + i * 2,
      z: bz + 15,
      w: 2,
      d: 3,
      rot: 0,
      def: s >= 2.5 || i % 2 === 1 ? 'townhouse' : 'cottage',
      row: 5,
      style: STYLES[Math.floor(i / 8)]!,
      storeys: s,
    });
  }

  // The short row north of the block, facing the north street, with no road behind it.
  const short = ['cottage', 'cottage', 'house', 'cottage', 'townhouse'];
  for (const [i, def] of short.entries())
    plot({
      x: bx + 2 + i * 2,
      z: bz - 5,
      w: 2,
      d: 3,
      rot: 0,
      def,
      row: 6,
      style: 'timber',
      storeys: st(def),
    });

  const patch = (layer: LayerName, data: Uint8Array | Int32Array) => {
    const w = rect[2] - rect[0] + 1;
    const out =
      data instanceof Int32Array
        ? new Int32Array(w * (rect[3] - rect[1] + 1))
        : new Uint8Array(w * (rect[3] - rect[1] + 1));
    for (let z = rect[1]; z <= rect[3]; z++)
      out.set(data.subarray(z * N + rect[0], z * N + rect[2] + 1), (z - rect[1]) * w);
    return { layer, rect, data: out };
  };
  mirror.apply({
    t: mirror.lastTurn.value,
    events,
    patches: [
      patch('road', road),
      patch('height', height),
      patch('tree', tree),
      patch('water', water),
      patch('terrain', terrain),
      patch('occupant', occupant),
    ],
  });
  return { center: [bx + 7, bz + 5], buildings, lots, gardens };
}
