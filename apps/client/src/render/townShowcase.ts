// Debug only (V1.0): a City-scale stress scene for render budgets and the V1 before and after
// shots, in this client's Mirror only (the sim never sees any of it). Streets run east to west every
// seven tiles out from the start area, crossed by lanes every 24, with today's kits facing them:
// terraces of townhouses and shops on the streets, cottages, houses and workshops on the lanes, a
// district style per block. Lanterns light the streets, and gardens, benches, planters and trees
// fill what is left, up to about 1,000 buildings and 6,000 decor and trees. Residents come from
// `synthResidents(2000)` on top (window.__qoti.townShowcase does both).
import { content } from '@qoti/content';
import {
  MAP_SIZE,
  Road,
  type BuildingRuntimeView,
  type BuildingView,
  type LayerName,
  type Rect,
  type Rot4,
  type SimEvent,
} from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { hash2 } from './coords';
import { drawDef } from './defs';
import { businessHands } from './showcaseBusiness';

const N = MAP_SIZE;
const FIRST_BUILDING = 760000;
const FIRST_DECOR = 800000;
/** A street, three tiles of homes facing it, three facing the next street. */
const STREET_EVERY = 7;
/** Lanes cross the streets this often, splitting the town into blocks. */
const CROSS_EVERY = 24;
const MARGIN = 6;

/** Grown kits take a district style; the others ignore it. */
const STYLED = new Set(['cottage', 'corner-shop', 'townhouse', 'workshop']);
const STYLES = ['brick', 'plaster', 'stone', 'timber'];
const STREET_ROW = [
  'townhouse',
  'corner-shop',
  'townhouse',
  'corner-shop',
  'townhouse',
  'workshop',
  'corner-shop',
  'townhouse',
  'corner-shop',
  'townhouse',
  'workshop',
  'corner-shop',
  'corner-shop',
  'townhouse',
  'tavern',
];
const LANE_ROW = [
  'cottage',
  'cottage',
  'house',
  'townhouse',
  'cottage',
  'workshop',
  'cottage',
  'workshop',
  'house',
  'cottage',
  'sawmill',
  'herbalist',
  'cottage',
  'workshop',
  'school',
];
const GARDEN = [
  'flower-bed',
  'planter',
  'bench',
  'herb-planter',
  'barrels',
  'crates',
  'birdbath',
  'wildflower-verge',
  'hedge',
  'fence',
  'low-wall',
  'lamp-post',
  'cafe-table',
  'planter-wall',
  'curved-bench',
];

export interface TownShowcaseOptions {
  /** Buildings to place (default 1,000). */
  buildings?: number;
  /** Decor pieces (default 4,000) and garden trees (default 2,000) on top of the valley's own. */
  decor?: number;
  trees?: number;
}

export interface TownShowcaseResult {
  buildings: number;
  decor: number;
  trees: number;
  /** The tile the town grows from, and the rect its streets cover. */
  center: [number, number];
  rect: Rect;
}

function sizeOf(def: string, rot: Rot4): [number, number] {
  const [w, d] = drawDef(def)?.size ?? [1, 1];
  return rot % 2 === 0 ? [w, d] : [d, w];
}

function runtime(def: string, x: number, z: number): BuildingRuntimeView {
  const out = content.buildingById.get(def)?.methods?.[0]?.outputs[0]?.[0];
  return {
    jobs: drawDef(def)?.jobs?.count ?? 0,
    workers: 1,
    present: 1,
    status: 0,
    condition: 100,
    paused: false,
    progress: 0.5,
    input: [],
    output: out && hash2(x, z, 41) < 0.6 ? [[out, 2 + Math.floor(hash2(x, z, 42) * 6)]] : [],
    store: [],
  };
}

export function townShowcase(mirror: Mirror, opts: TownShowcaseOptions = {}): TownShowcaseResult {
  const wantBuildings = opts.buildings ?? 1000;
  const wantDecor = opts.decor ?? 4000;
  const wantTrees = opts.trees ?? 2000;
  const L = mirror.layers;
  const road = new Uint8Array(L.road as Uint8Array);
  const tree = new Uint8Array(L.tree as Uint8Array);
  const occupant = new Int32Array(L.occupant as Int32Array);
  const water = L.water as Uint8Array;
  const height = L.height as Uint8Array;
  const [sx0, sz0, sx1, sz1] = mirror.meta.startArea;
  const cx = Math.floor((sx0 + sx1) / 2);
  const cz = Math.floor((sz0 + sz1) / 2);
  const crossing = (x: number): boolean => (((x - cx) % CROSS_EVERY) + CROSS_EVERY) % CROSS_EVERY === 0;
  const dry = (x: number, z: number): boolean =>
    x >= MARGIN && z >= MARGIN && x < N - MARGIN && z < N - MARGIN && !water[z * N + x];

  /** Every footprint tile is dry, free and off the streets, and the ground climbs at most a level. */
  const fits = (x: number, z: number, w: number, d: number): boolean => {
    let lo = 255;
    let hi = 0;
    for (let tz = z; tz < z + d; tz++)
      for (let tx = x; tx < x + w; tx++) {
        const i = tz * N + tx;
        if (!dry(tx, tz) || road[i] || occupant[i] || crossing(tx)) return false;
        lo = Math.min(lo, height[i]!);
        hi = Math.max(hi, height[i]!);
      }
    return hi - lo <= 1;
  };

  const events: SimEvent[] = [];
  const hands = businessHands();
  let bid = FIRST_BUILDING;
  let placed = 0;
  const place = (def: string, x: number, z: number, rot: Rot4, style: string): void => {
    const [w, d] = sizeOf(def, rot);
    const id = bid++;
    for (let tz = z; tz < z + d; tz++)
      for (let tx = x; tx < x + w; tx++) {
        occupant[tz * N + tx] = id;
        tree[tz * N + tx] = 0;
      }
    const b: BuildingView = {
      id,
      def,
      x,
      z,
      rot,
      builtBy: 0,
      handmade: false,
      stage: 'built',
      foundation: false,
      ...(STYLED.has(def) ? { style } : {}),
      ...hands.next(def),
      rt: runtime(def, x, z),
    };
    events.push({ e: 'building.added', b });
    placed++;
  };

  /** One side of a street: `rot` 0 north of it facing the street, 2 south of it. */
  const row = (streetZ: number, rot: 0 | 2, defs: readonly string[], joined: boolean): void => {
    let x = MARGIN;
    let k = Math.floor(hash2(streetZ, rot, 5) * defs.length);
    while (x < N - MARGIN && placed < wantBuildings) {
      const def = defs[k % defs.length]!;
      const [w, d] = sizeOf(def, rot);
      const z = rot === 0 ? streetZ - d : streetZ + 1;
      if (fits(x, z, w, d)) {
        const style = STYLES[Math.floor((x - cx + 960) / CROSS_EVERY + (streetZ - cz + 960) / 14) % 4]!;
        place(def, x, z, rot, style);
        x += w + (joined && hash2(x, streetZ, 7) < 0.8 ? 0 : 1);
        k++;
      } else x++;
    }
  };

  // Streets out from the center, alternating north and south, until the town is big enough.
  let zMin = cz;
  let zMax = cz;
  for (let n = 0; placed < wantBuildings; n++) {
    const k = n === 0 ? 0 : n % 2 ? (n + 1) / 2 : -n / 2;
    const zs = cz + k * STREET_EVERY;
    if (zs < MARGIN + 3 || zs > N - MARGIN - 4) {
      if (n > (N / STREET_EVERY) * 2) break;
      continue;
    }
    const main = k % 2 === 0;
    for (let x = MARGIN; x < N - MARGIN; x++)
      if (dry(x, zs)) road[zs * N + x] = main ? Road.street : Road.lane;
    for (let x = MARGIN; x < N - MARGIN; x++) tree[zs * N + x] = 0;
    row(zs, 0, main ? STREET_ROW : LANE_ROW, main);
    row(zs, 2, main ? STREET_ROW : LANE_ROW, main);
    zMin = Math.min(zMin, zs);
    zMax = Math.max(zMax, zs);
  }
  // Lanes across the blocks, between the outermost streets.
  for (let x = MARGIN; x < N - MARGIN; x++) {
    if (!crossing(x)) continue;
    for (let z = zMin; z <= zMax; z++) {
      const i = z * N + x;
      if (dry(x, z) && !occupant[i]) {
        if (!road[i]) road[i] = Road.lane;
        tree[i] = 0;
      }
    }
  }
  const rect: Rect = [MARGIN, Math.max(MARGIN, zMin - 3), N - MARGIN - 1, Math.min(N - MARGIN - 1, zMax + 3)];

  // Lanterns down both sides of every street, alternating.
  let did = FIRST_DECOR;
  let decor = 0;
  const addDecor = (def: string, x: number, z: number, rot: number): void => {
    if (!content.decorById.get(def)) return;
    events.push({
      e: 'decor.added',
      d: { id: did++, def, fx: Math.round(x * 256), fz: Math.round(z * 256), rot, builtBy: 0 },
    });
    decor++;
  };
  for (let z = rect[1]; z <= rect[3]; z++) {
    if ((z - cz) % STREET_EVERY !== 0) continue;
    for (let x = MARGIN; x < N - MARGIN && decor < wantDecor; x++) {
      if (!road[z * N + x] || crossing(x)) continue;
      if (x % 5 === 0) addDecor('lantern', x + 0.5, z + 0.12, 0);
      else if (x % 5 === 2) addDecor('lantern', x + 0.5, z + 0.88, 32);
    }
  }

  // Gardens, yards and greens: free dry tiles, the town's first, then a ring around it.
  const free: [number, number, number][] = [];
  for (let z = MARGIN; z < N - MARGIN; z++)
    for (let x = MARGIN; x < N - MARGIN; x++) {
      const i = z * N + x;
      if (!dry(x, z) || road[i] || occupant[i]) continue;
      const out = Math.max(rect[1] - z, z - rect[3], 0);
      free.push([x, z, out * 1000 + hash2(x, z, 17) * 999]);
    }
  free.sort((a, b) => a[2] - b[2]);
  let trees = 0;
  for (const [x, z] of free) {
    if (decor >= wantDecor && trees >= wantTrees) break;
    const i = z * N + x;
    const r = hash2(x, z, 23);
    if (trees < wantTrees && (r < 0.35 || decor >= wantDecor)) {
      tree[i] = (r < 0.2 ? 1 : r < 0.3 ? 2 : 3) * 8 + 3;
      trees++;
      continue;
    }
    if (decor >= wantDecor) continue;
    tree[i] = 0;
    const a = GARDEN[Math.floor(hash2(x, z, 29) * GARDEN.length)]!;
    const b = GARDEN[Math.floor(hash2(x, z, 31) * GARDEN.length)]!;
    addDecor(a, x + 0.3, z + 0.3, Math.floor(hash2(x, z, 37) * 64));
    if (decor < wantDecor) addDecor(b, x + 0.72, z + 0.7, Math.floor(hash2(x, z, 39) * 64));
  }

  const all: Rect = [0, 0, N - 1, N - 1];
  const patch = (layer: LayerName, data: Uint8Array | Int32Array) => ({ layer, rect: all, data });
  for (const k of hands.keepers) mirror.residents.set(k.id, k);
  mirror.apply({
    t: mirror.lastTurn.value,
    events,
    patches: [patch('road', road), patch('tree', tree), patch('occupant', occupant)],
  });
  return { buildings: placed, decor, trees, center: [cx, cz], rect };
}
