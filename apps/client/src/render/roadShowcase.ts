// Debug only (C4P): a hill of roads for art review, in this client's Mirror only (the sim never sees
// any of it). A cone four levels high with a straight path and a zigzag path climbing it on stairs,
// a lane that climbs it as a ramp, a lane ring round its foot that the paths join, a cobbled street
// leading off the ring, and worn ground beside the paths.
import { Flags, MAP_SIZE, Road, wantsStairs, type LayerName, type Rect } from '@qoti/sim';
import type { Mirror } from '../state/mirror';

const N = MAP_SIZE;

export interface RoadsShowcaseResult {
  center: [number, number];
  stairs: number;
}

export function roadsShowcase(mirror: Mirror, cx = 84, cz = 96): RoadsShowcaseResult {
  const L = mirror.layers;
  const road = new Uint8Array(L.road as Uint8Array);
  const height = new Uint8Array(L.height as Uint8Array);
  const flags = new Uint8Array(L.flags as Uint8Array);
  const tree = new Uint8Array(L.tree as Uint8Array);
  const wear = new Uint8Array(L.wear as Uint8Array);
  const R = 13;
  const h0 = height[cz * N + cx]!;
  for (let z = cz - R; z <= cz + R; z++) {
    for (let x = cx - R; x <= cx + R; x++) {
      const i = z * N + x;
      const d = Math.max(Math.abs(x - cx), Math.abs(z - cz));
      height[i] = h0 + Math.max(0, Math.min(4, 4 - Math.floor((d - 1) / 2)));
      tree[i] = 0;
      road[i] = 0;
      wear[i] = 0;
    }
  }
  const set = (x: number, z: number, v: number): void => {
    road[z * N + x] = v;
  };
  // The ring at the foot of the hill.
  const ring = 10;
  for (let k = -ring; k <= ring; k++) {
    set(cx + k, cz - ring, Road.lane);
    set(cx + k, cz + ring, Road.lane);
    set(cx - ring, cz + k, Road.lane);
    set(cx + ring, cz + k, Road.lane);
  }
  // A straight path up from the south, a lane ramp up from the east.
  for (let z = cz; z < cz + ring; z++) set(cx, z, Road.path);
  for (let x = cx + 1; x < cx + ring; x++) set(x, cz, Road.lane);
  // A zigzag path up from the north-west corner.
  let x = cx - ring + 1;
  let z = cz - ring;
  set(x, z, Road.path);
  while (x < cx || z < cz) {
    if (z < cz) z++;
    set(x, z, Road.path);
    if (x < cx) x++;
    set(x, z, Road.path);
  }
  // A cobbled street off the ring to the east, and a path to the west.
  for (let k = 1; k <= 3; k++) set(cx + ring + k, cz - 4, Road.street);
  for (let k = 1; k <= 3; k++) set(cx - ring - k, cz + 4, Road.path);
  // Worn ground where folk cut the corner beside the straight path.
  for (const [wx, wz, v] of [
    [cx + 1, cz + 7, 160],
    [cx + 2, cz + 8, 200],
    [cx + 3, cz + 9, 140],
    [cx - 1, cz + 8, 90],
  ] as const)
    wear[wz * N + wx] = v;

  let stairs = 0;
  const map = { road, height };
  for (let zz = cz - R - 1; zz <= cz + R + 1; zz++) {
    for (let xx = cx - R - 1; xx <= cx + R + 1; xx++) {
      const i = zz * N + xx;
      const want = wantsStairs(map, i);
      flags[i] = want ? flags[i]! | Flags.stairs : flags[i]! & ~Flags.stairs;
      if (want) stairs++;
    }
  }
  // Only the hill's rect, so the road chunks around it rebuild first.
  const P = R + 4;
  const rect: Rect = [cx - P, cz - P, cx + P, cz + P];
  const patch = (layer: LayerName, data: Uint8Array) => {
    const w = rect[2] - rect[0] + 1;
    const out = new Uint8Array(w * (rect[3] - rect[1] + 1));
    for (let z = rect[1]; z <= rect[3]; z++)
      out.set(data.subarray(z * N + rect[0], z * N + rect[2] + 1), (z - rect[1]) * w);
    return { layer, rect, data: out };
  };
  mirror.apply({
    t: mirror.lastTurn.value,
    events: [],
    patches: [
      patch('road', road),
      patch('height', height),
      patch('flags', flags),
      patch('tree', tree),
      patch('wear', wear),
    ],
  });
  return { center: [cx, cz], stairs };
}
