// Debug only: a hillside street of buildings for reviewing how buildings and roads sit on the
// ground, in this client's Mirror only (the sim never sees any of it). A lane runs along the hill;
// above it, cottages stand on footprints that straddle a level in every way a footprint can (cut
// into the hill at the back, raised at the front, split down the side, one corner up, a whole
// level above the lane), with a workshop, a house and a tavern; below it, homes step down the
// slope; a path climbs to a cottage at its dead end, and a street meets a corner shop.
import { content } from '@qoti/content';
import {
  Flags,
  footprintSize,
  MAP_SIZE,
  Road,
  Terrain,
  wantsStairs,
  type BuildingView,
  type LayerName,
  type Rect,
  type Rot4,
  type SimEvent,
} from '@qoti/sim';
import type { Mirror } from '../state/mirror';

const N = MAP_SIZE;
const FIRST_ID = 960_000;

export interface FitShowcaseResult {
  center: [number, number];
  buildings: number;
}

interface Plan {
  def: string;
  x: number;
  z: number;
  rot: Rot4;
  /** Level offsets per footprint tile, relative to the lane; default 0. */
  levels?: (lx: number, lz: number) => number;
  /** Keep the hill's own levels under it instead. */
  natural?: boolean;
}

export function fitShowcase(mirror: Mirror, cx = 60, cz = 128): FitShowcaseResult {
  const L = mirror.layers;
  const road = new Uint8Array(L.road as Uint8Array);
  const height = new Uint8Array(L.height as Uint8Array);
  const tree = new Uint8Array(L.tree as Uint8Array);
  const water = new Uint8Array(L.water as Uint8Array);
  const terrain = new Uint8Array(L.terrain as Uint8Array);
  const occupant = new Int32Array(L.occupant as Int32Array);
  const RX = 14;
  const RZ = 11;
  const h0 = Math.max(3, height[cz * N + cx]!);
  // The hill: flat along the lane, rising a level every three tiles to the north and falling a
  // level every three tiles to the south.
  for (let z = cz - RZ; z <= cz + RZ; z++) {
    for (let x = cx - RX; x <= cx + RX; x++) {
      const i = z * N + x;
      const dz = z - cz;
      const up = dz <= -3 ? Math.floor(-dz / 3) : 0;
      const down = dz >= 3 ? Math.floor(dz / 3) : 0;
      height[i] = h0 + up - down;
      tree[i] = 0;
      road[i] = 0;
      water[i] = 0;
      terrain[i] = Terrain.grass;
      occupant[i] = 0;
    }
  }
  for (let x = cx - RX + 1; x <= cx + RX - 1; x++) road[cz * N + x] = Road.lane;
  // A path up the hill to a cottage at its dead end, and a street off the lane to the south.
  for (let z = cz - 6; z < cz; z++) road[z * N + cx + 12] = Road.path;
  for (let z = cz + 1; z <= cz + 4; z++) road[z * N + cx - 13] = Road.street;

  const plans: Plan[] = [
    // North of the lane, doors facing it (rot 0 faces +z).
    { def: 'cottage', x: cx - 12, z: cz - 2, rot: 0 },
    { def: 'cottage', x: cx - 9, z: cz - 2, rot: 0, levels: (_x, z) => (z === 0 ? 1 : 0) },
    { def: 'cottage', x: cx - 6, z: cz - 2, rot: 0, levels: (_x, z) => (z === 1 ? 1 : 0) },
    { def: 'cottage', x: cx - 3, z: cz - 2, rot: 0, levels: (x) => (x === 0 ? 1 : 0) },
    { def: 'cottage', x: cx, z: cz - 2, rot: 0, levels: (x, z) => (x === 0 && z === 0 ? 1 : 0) },
    { def: 'cottage', x: cx + 3, z: cz - 2, rot: 0, levels: () => 1 },
    { def: 'workshop', x: cx + 6, z: cz - 3, rot: 0, levels: (_x, z) => (z === 0 ? 1 : 0) },
    { def: 'cottage', x: cx + 11, z: cz - 8, rot: 0, natural: true },
    // South of the lane, doors facing it (rot 2 faces -z), stepping down the slope.
    { def: 'house', x: cx - 9, z: cz + 1, rot: 2, levels: (_x, z) => (z === 2 ? -1 : 0) },
    { def: 'cottage', x: cx - 6, z: cz + 1, rot: 2, levels: (_x, z) => (z === 1 ? -1 : 0) },
    { def: 'tavern', x: cx - 2, z: cz + 1, rot: 2, levels: (x) => (x === 2 ? -1 : 0) },
    { def: 'cottage', x: cx + 3, z: cz + 1, rot: 2, levels: () => -1 },
    { def: 'townhouse', x: cx + 7, z: cz + 1, rot: 2, levels: (x, z) => (x === 1 && z === 1 ? -1 : 0) },
    // A corner shop on the street, door facing west (rot 1 faces -x).
    { def: 'corner-shop', x: cx - 12, z: cz + 2, rot: 1, levels: (x) => (x === 2 ? -1 : 0) },
  ];

  const events: SimEvent[] = [];
  let id = FIRST_ID;
  let placed = 0;
  for (const p of plans) {
    const def = content.buildingById.get(p.def);
    if (!def) continue;
    const [w, d] = footprintSize(def, p.rot);
    const bid = id++;
    for (let lz = 0; lz < d; lz++) {
      for (let lx = 0; lx < w; lx++) {
        const i = (p.z + lz) * N + p.x + lx;
        occupant[i] = bid;
        road[i] = 0;
        if (!p.natural) height[i] = h0 + (p.levels?.(lx, lz) ?? 0);
      }
    }
    const b: BuildingView = {
      id: bid,
      def: p.def,
      x: p.x,
      z: p.z,
      rot: p.rot,
      builtBy: 0,
      handmade: false,
      stage: 'built',
      foundation: false,
    };
    events.push({ e: 'building.added', b });
    placed++;
  }

  // Stairs where the path climbs, as the sim would flag them.
  const flags = new Uint8Array(L.flags as Uint8Array);
  const map = { road, height };
  for (let z = cz - RZ - 1; z <= cz + RZ + 1; z++) {
    for (let x = cx - RX - 1; x <= cx + RX + 1; x++) {
      const i = z * N + x;
      flags[i] = wantsStairs(map, i) ? flags[i]! | Flags.stairs : flags[i]! & ~Flags.stairs;
    }
  }

  const P = Math.max(RX, RZ) + 3;
  const rect: Rect = [cx - P, cz - P, cx + P, cz + P];
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
      patch('flags', flags),
    ],
  });
  return { center: [cx, cz], buildings: placed };
}
