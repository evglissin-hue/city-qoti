// Debug only (C4E): dresses the live village fixture (?debug&fixture=village) as a grown village for
// art review and render budgets, in this client's Mirror only (the sim never sees any of it):
// grown homes and shops on the fixture's lots, a cobbled street of workshops and services, a farm
// lane with pastures, a dairy, orchards and farmsteads, a terrace with stairs, desire paths, a
// forest belt, carts on the lanes, and residents dressed as couples, babies and story characters.
// `dense` adds two more streets of grown homes, for the 150-building budget scene.
import { content } from '@qoti/content';
import {
  AGENT_STRIDE,
  AgentAnim,
  AgentFlags,
  Flags,
  MAP_SIZE,
  ResidentFlags,
  Road,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type BuildingRuntimeView,
  type BuildingView,
  type LayerName,
  type LotView,
  type Rect,
  type ResidentView,
  type Rot4,
  type SimEvent,
} from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { hash2 } from './coords';
import { drawDef } from './defs';

const N = MAP_SIZE;
const FIRST_ID = 700000;

interface Plan {
  def: string;
  x: number;
  z: number;
  rot: Rot4;
  style?: string;
  zone?: string;
  out?: [string, number][];
  input?: [string, number][];
  store?: [string, number][];
  upgrading?: boolean;
  site?: 0 | 1 | 2 | 3;
}

interface Mover {
  id: number;
  pts: [number, number][];
  speed: number;
  anim: number;
  /** Good index + 1, or 0. */
  carry: number;
  /** Carts come back empty. */
  emptyBack?: boolean;
  /** Offset from the road's middle, to the left of the way it is going. */
  side: number;
  t: number;
  jitter?: boolean;
  /** Standing movers: the way they face (radians, 0 is +z). */
  facing?: number;
}

export interface ShowcaseResult {
  buildings: number;
  carts: number;
  stop: () => void;
}

function sizeOf(def: string, rot: Rot4): [number, number] {
  const d = drawDef(def);
  const [w, h] = d?.size ?? [1, 1];
  return rot % 2 === 0 ? [w, h] : [h, w];
}

/** A row of lots along a road: `side` 0 north of it (facing south), 2 south (facing north). */
function row(
  plans: Plan[],
  defs: string[],
  x0: number,
  x1: number,
  roadZ: number,
  side: 0 | 2,
  style: string,
  zone: string,
  gap = 1,
): void {
  let x = x0;
  let i = 0;
  while (x <= x1) {
    const def = defs[i % defs.length]!;
    const [w, d] = sizeOf(def, side);
    if (x + w - 1 > x1) break;
    const z = side === 0 ? roadZ - d : roadZ + 1;
    plans.push({ def, x, z, rot: side, style, zone });
    x += w + gap;
    i++;
  }
}

function rt(p: Plan): BuildingRuntimeView {
  return {
    jobs: drawDef(p.def)?.jobs?.count ?? 0,
    workers: 1,
    present: 1,
    status: 0,
    condition: 100,
    paused: false,
    progress: 0.4,
    input: p.input ?? [],
    output: p.out ?? [],
    store: p.store ?? [],
    ...(p.upgrading ? { upgrading: true } : {}),
    ...(p.site !== undefined
      ? {
          construction: {
            stage: p.site,
            progress: p.site / 4,
            needs: [['planks', 4]] as [string, number][],
            delivered: [
              ['planks', 8],
              ['stone', 6],
              ['bricks', 4],
            ] as [string, number][],
            priority: false,
          },
        }
      : {}),
  };
}

export function villageShowcase(mirror: Mirror, opts: { dense?: boolean } = {}): ShowcaseResult {
  const L = mirror.layers;
  const road = new Uint8Array(L.road as Uint8Array);
  const height = new Uint8Array(L.height as Uint8Array);
  const flags = new Uint8Array(L.flags as Uint8Array);
  const tree = new Uint8Array(L.tree as Uint8Array);
  const terrain = new Uint8Array(L.terrain as Uint8Array);
  const wear = new Uint8Array(L.wear as Uint8Array);
  const zone = new Uint8Array(L.zone as Uint8Array);
  const lotLayer = new Int32Array(L.lot as Int32Array);
  const occupant = new Int32Array(L.occupant as Int32Array);

  // Roads: a cobbled street through the middle, a farm lane to the north.
  const paint = (x0: number, x1: number, z0: number, z1: number, v: number): void => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) road[z * N + x] = v;
  };
  paint(33, 96, 60, 60, Road.street);
  paint(32, 96, 40, 40, Road.lane);
  paint(32, 32, 41, 49, Road.lane);
  paint(96, 96, 41, 69, Road.lane);
  if (opts.dense) {
    paint(33, 96, 82, 82, Road.street);
    paint(33, 96, 92, 92, Road.lane);
    paint(32, 32, 71, 92, Road.lane);
    paint(64, 64, 81, 91, Road.path);
  }

  // A terrace raised a level south of the street, with stone stairs up from it.
  for (let z = 61; z <= 65; z++) for (let x = 33; x <= 44; x++) height[z * N + x] = 3;
  road[61 * N + 39] = Road.path;
  road[62 * N + 39] = Road.path;
  flags[61 * N + 39] = flags[61 * N + 39]! | Flags.stairs;

  const plans: Plan[] = [];
  // Grown homes on the fixture's home lots (the first already holds a cottage).
  const homes = ['cottage', 'townhouse', 'cottage', 'cottage', 'townhouse', 'cottage'];
  homes.forEach((def, i) =>
    plans.push({
      def,
      x: 43 + i * 3,
      z: 71,
      rot: 2,
      style: 'timber',
      ...(i === 2 ? { upgrading: true } : {}),
    }),
  );
  // Shops on the shop lots along lane A.
  [66, 70, 74, 78].forEach((x, i) =>
    plans.push({
      def: 'shop',
      x,
      z: 51,
      rot: 2,
      style: i % 2 ? 'brick' : 'plaster',
      ...(i === 1 ? { out: [['cheese', 6]] as [string, number][] } : {}),
    }),
  );
  // The street: workshops, services and townhouses facing it.
  const north: Plan[] = [
    { def: 'school', x: 34, z: 57, rot: 0 },
    { def: 'herbalist', x: 38, z: 58, rot: 0, input: [['herbs', 4]] },
    { def: 'smithy', x: 41, z: 57, rot: 0, out: [['tools', 6]] },
    { def: 'cheesemaker', x: 44, z: 58, rot: 0, out: [['cheese', 8]] },
    { def: 'weaver', x: 47, z: 57, rot: 0, out: [['cloth', 6]], input: [['yarn', 4]] },
    { def: 'spinner', x: 50, z: 58, rot: 0, out: [['yarn', 6]] },
    { def: 'workshop', x: 53, z: 57, rot: 0, style: 'stone', zone: 'crafts', out: [['tools', 4]] },
    { def: 'townhouse', x: 57, z: 58, rot: 0, style: 'brick', zone: 'homes-medium' },
    { def: 'tavern', x: 65, z: 57, rot: 0, input: [['cider', 6]] },
    { def: 'cart-shed', x: 69, z: 57, rot: 0 },
    { def: 'workshop', x: 72, z: 57, rot: 0, style: 'brick', zone: 'crafts', out: [['bricks', 6]] },
    { def: 'shop', x: 76, z: 57, rot: 0, style: 'brick', zone: 'shops', out: [['bread', 4]] },
    { def: 'townhouse', x: 79, z: 58, rot: 0, style: 'brick', zone: 'homes-medium' },
    { def: 'townhouse', x: 82, z: 58, rot: 0, style: 'plaster', zone: 'homes-medium', site: 2 },
    { def: 'chopping-shed', x: 86, z: 58, rot: 0, out: [['firewood', 8]], input: [['logs', 4]] },
    {
      def: 'trading-post',
      x: 91,
      z: 57,
      rot: 0,
      store: [
        ['wool', 12],
        ['cloth', 8],
        ['tools', 6],
      ],
    },
  ];
  const south: Plan[] = [
    { def: 'orchard', x: 34, z: 62, rot: 2, out: [['apples', 6]] },
    { def: 'herb-garden', x: 41, z: 62, rot: 2, out: [['herbs', 5]] },
    { def: 'cottage', x: 46, z: 61, rot: 2, style: 'plaster', zone: 'homes-low' },
    { def: 'cottage', x: 49, z: 61, rot: 2, style: 'plaster', zone: 'homes-low' },
    { def: 'townhouse', x: 52, z: 61, rot: 2, style: 'plaster', zone: 'homes-medium' },
    { def: 'cottage', x: 55, z: 61, rot: 2, style: 'plaster', zone: 'homes-low' },
    { def: 'cottage', x: 66, z: 61, rot: 2, style: 'stone', zone: 'homes-low' },
    { def: 'cottage', x: 69, z: 61, rot: 2, style: 'stone', zone: 'homes-low' },
    { def: 'townhouse', x: 72, z: 61, rot: 2, style: 'stone', zone: 'homes-medium' },
    { def: 'shop', x: 75, z: 61, rot: 2, style: 'stone', zone: 'shops', out: [['apples', 4]] },
    { def: 'clay-pit', x: 84, z: 61, rot: 2, out: [['clay', 8]] },
    { def: 'brick-kiln', x: 88, z: 61, rot: 2, out: [['bricks', 10]], input: [['firewood', 6]] },
  ];
  // The farm lane: pastures, the dairy, orchards and farmsteads.
  const farms: Plan[] = [
    { def: 'sheep-pasture', x: 33, z: 36, rot: 0, out: [['wool', 6]] },
    { def: 'dairy', x: 38, z: 37, rot: 0, out: [['milk', 6]] },
    { def: 'orchard', x: 42, z: 37, rot: 0, out: [['apples', 4]] },
    { def: 'farmstead', x: 46, z: 37, rot: 0, style: 'stone', zone: 'farms' },
    { def: 'farmstead', x: 50, z: 37, rot: 0, style: 'timber', zone: 'farms' },
    { def: 'cider-press', x: 54, z: 37, rot: 0, out: [['cider', 6]], input: [['apples', 6]] },
    { def: 'farmstead', x: 66, z: 37, rot: 0, style: 'timber', zone: 'farms' },
    { def: 'sheep-pasture', x: 70, z: 36, rot: 0, out: [['wool', 4]] },
    { def: 'orchard', x: 75, z: 37, rot: 0 },
    { def: 'farmstead', x: 79, z: 37, rot: 0, style: 'plaster', zone: 'farms' },
    { def: 'dairy', x: 83, z: 37, rot: 0 },
    { def: 'farmstead', x: 37, z: 41, rot: 2, style: 'stone', zone: 'farms' },
    { def: 'farmstead', x: 41, z: 41, rot: 2, style: 'timber', zone: 'farms' },
    { def: 'orchard', x: 76, z: 41, rot: 2 },
    { def: 'farmstead', x: 80, z: 41, rot: 2, style: 'plaster', zone: 'farms' },
    { def: 'farmstead', x: 84, z: 41, rot: 2, style: 'timber', zone: 'farms' },
  ];
  plans.push(...north, ...south, ...farms);
  // Homes grown along the south side of lane A, behind the street's workshops.
  row(plans, ['cottage', 'cottage', 'townhouse', 'cottage'], 34, 58, 50, 2, 'timber', 'homes-low');
  if (opts.dense) {
    const mix = ['cottage', 'cottage', 'townhouse', 'cottage', 'shop', 'townhouse'];
    row(plans, mix, 34, 62, 82, 0, 'timber', 'homes-low');
    row(plans, mix, 66, 95, 82, 0, 'brick', 'homes-medium');
    row(plans, ['cottage', 'townhouse', 'cottage'], 34, 62, 82, 2, 'plaster', 'homes-low');
    row(plans, ['townhouse', 'cottage', 'workshop'], 66, 95, 82, 2, 'stone', 'crafts');
    row(plans, ['cottage', 'farmstead', 'cottage'], 34, 95, 92, 0, 'timber', 'homes-low');
  }

  // Place them: occupancy, lots and zones for the Ledger overlays, then the building views.
  const zoneValue = new Map(content.zones.map((zd) => [zd.id, zd.layerValue]));
  const events: SimEvent[] = [];
  let id = FIRST_ID;
  let placed = 0;
  for (const p of plans) {
    const [w, d] = sizeOf(p.def, p.rot);
    let clear = true;
    for (let z = p.z; z < p.z + d && clear; z++)
      for (let x = p.x; x < p.x + w; x++)
        if (x < 0 || z < 0 || x >= N || z >= N || occupant[z * N + x] || road[z * N + x]) clear = false;
    if (!clear || !drawDef(p.def)) continue;
    const bid = id++;
    let lot = 0;
    if (p.zone) {
      lot = id++;
      const lv: LotView = {
        id: lot,
        zone: p.zone,
        x: p.x,
        z: p.z,
        w,
        d,
        rot: p.rot,
        desirability: 40 + Math.round(hash2(p.x, p.z, 3) * 50),
        style: p.style ?? '',
        buildingId: bid,
      };
      events.push({ e: 'lot.added', l: lv });
    }
    for (let z = p.z; z < p.z + d; z++)
      for (let x = p.x; x < p.x + w; x++) {
        occupant[z * N + x] = bid;
        if (lot) {
          lotLayer[z * N + x] = lot;
          zone[z * N + x] = zoneValue.get(p.zone!) ?? 0;
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
      stage: p.site !== undefined ? 'construction' : 'built',
      foundation: false,
      ...(p.style ? { style: p.style } : {}),
      ...(lot ? { lot } : {}),
      rt: rt(p),
    };
    events.push({ e: 'building.added', b });
    placed++;
  }
  // A couple of empty zoned lots, waiting.
  for (const [x, z] of [
    [58, 61],
    [61, 61],
  ] as const) {
    const lot = id++;
    events.push({
      e: 'lot.added',
      l: {
        id: lot,
        zone: 'homes-low',
        x,
        z,
        w: 2,
        d: 2,
        rot: 2,
        desirability: 30,
        style: 'plaster',
        buildingId: 0,
      },
    } as SimEvent);
    for (let dz = 0; dz < 2; dz++)
      for (let dx = 0; dx < 2; dx++) {
        lotLayer[(z + dz) * N + x + dx] = lot;
        zone[(z + dz) * N + x + dx] = zoneValue.get('homes-low') ?? 1;
      }
  }

  // Nature: a forest belt round the village, meadows to the north, desire paths across the greens.
  const inVillage = (x: number, z: number): boolean =>
    x >= 30 && x <= 99 && z >= (opts.dense ? 30 : 32) && z <= (opts.dense ? 95 : 76);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      if (L.water[i] || road[i] || occupant[i] || tree[i]) continue;
      const edge = Math.max(30 - x, x - 99, (opts.dense ? 30 : 32) - z, z - (opts.dense ? 95 : 76), 0);
      if (inVillage(x, z)) {
        // Meadow flowers between the farms, the odd tree in a hedgerow.
        if (z < 36 && hash2(x >> 2, z >> 2, 5) > 0.5) terrain[i] = 1;
        continue;
      }
      const density = Math.min(0.85, 0.15 + edge * 0.08) * (0.6 + 0.6 * hash2(x >> 3, z >> 3, 9));
      if (hash2(x, z, 21) < density) {
        const sp = hash2(x >> 2, z >> 2, 33) < 0.5 ? 1 : hash2(x, z, 4) < 0.6 ? 2 : 3;
        tree[i] = sp * 8 + 3;
        terrain[i] = 2;
      }
    }
  }
  const trail = (pts: [number, number][], v: number): void => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k]!;
      const [bx, bz] = pts[k + 1]!;
      const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
      for (let s = 0; s <= n; s++) {
        const x = Math.round(ax + ((bx - ax) * s) / n);
        const z = Math.round(az + ((bz - az) * s) / n);
        const i = z * N + x;
        if (!road[i] && !occupant[i]) wear[i] = Math.max(wear[i]!, v);
      }
    }
  };
  trail(
    [
      [58, 51],
      [61, 55],
      [63, 58],
    ],
    170,
  );
  trail(
    [
      [65, 64],
      [67, 66],
      [72, 66],
      [78, 65],
    ],
    110,
  );
  trail(
    [
      [45, 41],
      [47, 44],
      [52, 45],
    ],
    80,
  );

  // Shade trees on the greens, and the little things a village collects: lanterns along the
  // street, benches and flowers round the well, a signpost at the crossing.
  for (const [x, z] of [
    [47, 54],
    [53, 55],
    [56, 53],
    [69, 65],
    [75, 66],
    [82, 64],
    [88, 66],
    [91, 64],
    [45, 66],
    [58, 64],
  ] as const) {
    const i = z * N + x;
    if (!road[i] && !occupant[i]) tree[i] = (hash2(x, z, 3) < 0.7 ? 1 : 2) * 8 + 3;
  }
  let did = 650000;
  const decor = (def: string, x: number, z: number, rot = 0): void => {
    if (!content.decorById.get(def)) return;
    events.push({
      e: 'decor.added',
      d: { id: did++, def, fx: Math.round(x * 256), fz: Math.round(z * 256), rot, builtBy: 0 },
    });
  };
  for (let x = 36; x <= 94; x += 5) decor('lantern', x + 0.5, x % 2 ? 60.12 : 60.88);
  for (let x = 36; x <= 94; x += 6) decor('lantern', x + 0.5, 50.88);
  decor('ring-bench', 61.5, 54.5);
  decor('bench', 58.5, 53.8, 16);
  decor('flower-bed', 59.5, 51.6);
  decor('flower-bed', 61.5, 51.6);
  decor('birdbath', 62.6, 53.3);
  decor('cherry-tree', 58.3, 55.6);
  decor('apple-tree', 62.8, 56.2);
  decor('signpost', 63.25, 59.25, 8);
  decor('planter', 64.8, 59.2);
  decor('barrels', 93.2, 59.25);
  decor('crates', 90.8, 59.3);
  decor('wildflower-verge', 70.5, 62.2);
  decor('wildflower-verge', 74.5, 62.2);
  decor('hanging-lantern', 68.4, 56.9);
  // Cart passes this hour for the traffic overlay: busiest by the market, quiet on the farm lane.
  const traffic = new Uint8Array(L.traffic as Uint8Array);
  for (let i = 0; i < N * N; i++) {
    if (!road[i]) continue;
    const x = i % N;
    const z = Math.floor(i / N);
    const near = Math.max(0, 1 - Math.abs(x - 72) / 30);
    traffic[i] = Math.round(
      (road[i] === Road.street ? 30 + 60 * near : z === 50 ? 12 + 30 * near : 6) *
        (0.8 + 0.4 * hash2(x, z, 8)),
    );
  }
  const all: Rect = [0, 0, N - 1, N - 1];
  const patch = (layer: LayerName, data: Uint8Array | Int32Array) => ({ layer, rect: all, data });
  mirror.apply({
    t: mirror.lastTurn.value,
    events,
    patches: [
      patch('road', road),
      patch('height', height),
      patch('flags', flags),
      patch('tree', tree),
      patch('terrain', terrain),
      patch('wear', wear),
      patch('traffic', traffic),
      patch('zone', zone),
      patch('lot', lotLayer),
      patch('occupant', occupant),
    ],
  });

  // Residents: couples, babies and the story characters, dressed in this Mirror only.
  const today = Math.floor((mirror.tick.value + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
  let stories = 0;
  const storySpecies = ['mouse', 'fox', 'rabbit'];
  for (const h of mirror.households.values()) {
    const adults = h.members.filter((m) => {
      const r = mirror.residents.get(m);
      return r && (r.stage === 'adult' || r.stage === 'young');
    });
    if (adults.length >= 2) {
      const [a, b] = adults as [number, number];
      mirror.residents.set(a, { ...mirror.residents.get(a)!, partner: b });
      mirror.residents.set(b, { ...mirror.residents.get(b)!, partner: a });
    }
    const kid = h.members.find((m) => mirror.residents.get(m)?.stage === 'child');
    if (kid && h.id % 2 === 0)
      mirror.residents.set(kid, { ...mirror.residents.get(kid)!, bornDay: today - 3 });
    const single = adults.length === 1 ? adults[0] : undefined;
    if (single !== undefined && stories < storySpecies.length) {
      const r = mirror.residents.get(single)!;
      mirror.residents.set(single, {
        ...r,
        species: storySpecies[stories]!,
        flags: r.flags | ResidentFlags.story,
      });
      stories++;
    }
  }
  // If the households had no singles, the first adults of the last families take the parts.
  if (stories < storySpecies.length) {
    const adults = [...mirror.residents.values()].filter((r) => r.stage === 'adult' && !r.partner);
    for (const r of adults.slice(0, storySpecies.length - stories)) {
      mirror.residents.set(r.id, {
        ...r,
        species: storySpecies[stories]!,
        flags: r.flags | ResidentFlags.story,
      });
      stories++;
    }
  }
  mirror.hamletRevision.value++;

  // Movers riding along in the worker's frames: carts up and down the lanes and the street, and a
  // few strollers to show off: couples hand in hand, a parent with a baby in a sling, the story
  // characters about their business, porters with the new goods, children at play by the school.
  const gi = (g: string): number => content.goodIndex.get(g) ?? 0;
  const movers: Mover[] = [];
  const route = (pts: number[][]): [number, number][] => pts.map((p) => [p[0]! + 0.5, p[1]! + 0.5]);
  const cartGoods = ['logs', 'bricks', 'wool', 'cheese', 'apples', 'firewood', 'planks', 'cloth'];
  const cartRoutes: { pts: number[][]; speed: number }[] = [
    {
      pts: [
        [33, 50],
        [96, 50],
      ],
      speed: 1.6,
    },
    {
      pts: [
        [95, 60],
        [34, 60],
      ],
      speed: 1.3,
    },
    {
      pts: [
        [33, 40],
        [96, 40],
        [96, 69],
        [33, 70],
      ],
      speed: 1.5,
    },
    {
      pts: [
        [96, 69],
        [96, 41],
        [33, 40],
      ],
      speed: 1.4,
    },
    {
      pts: [
        [64, 60],
        [96, 60],
        [96, 50],
        [33, 50],
      ],
      speed: 1.5,
    },
  ];
  cartRoutes.forEach((r, i) =>
    movers.push({
      id: 690000 + i,
      pts: route(r.pts),
      speed: r.speed,
      anim: AgentAnim.cart,
      carry: gi(cartGoods[i % cartGoods.length]!) + 1,
      emptyBack: true,
      side: 0.12,
      t: i * 9,
    }),
  );
  const species = ['badger', 'fox', 'hedgehog', 'mouse', 'otter', 'rabbit', 'squirrel'];
  let rid = 680000;
  let hid = 685000;
  const person = (sp: string, stage: 'adult' | 'child', extra: Partial<ResidentView> = {}): ResidentView => {
    const r: ResidentView = {
      id: rid++,
      given: 'Stroller',
      family: 'Showcase',
      species: sp,
      stage,
      traits: [],
      householdId: 0,
      homeId: 0,
      jobId: 0,
      tier: 'craftsfolk',
      wishId: 0,
      moodBand: 3,
      bond: 2,
      look: Math.floor(hash2(rid, 7, 3) * 100000),
      flags: 0,
      ...extra,
    };
    mirror.residents.set(r.id, r);
    return r;
  };
  const walk = (
    r: ResidentView,
    pts: number[][],
    speed: number,
    t: number,
    extra: Partial<Mover> = {},
  ): void => {
    movers.push({ id: r.id, pts: route(pts), speed, anim: AgentAnim.walk, carry: 0, side: 0, t, ...extra });
  };
  // Couples, each pair on one route so they walk together.
  const couples: [string, string, number[][], number][] = [
    [
      'rabbit',
      'hedgehog',
      [
        [40, 60],
        [62, 60],
        [64, 55],
        [64, 45],
      ],
      0,
    ],
    [
      'fox',
      'otter',
      [
        [66, 60],
        [90, 60],
      ],
      6,
    ],
    [
      'badger',
      'squirrel',
      [
        [56, 70],
        [34, 70],
        [33, 62],
      ],
      3,
    ],
  ];
  for (const [a, b, pts, t] of couples) {
    const h = hid++;
    const ra = person(a, 'adult', { householdId: h });
    const rb = person(b, 'adult', { householdId: h, partner: ra.id });
    mirror.residents.set(ra.id, { ...ra, partner: rb.id });
    walk(ra, pts, 0.75, t);
    walk(rb, pts, 0.75, t);
  }
  // A parent out with the baby in a sling (the baby itself stays home in the frames).
  {
    const h = hid++;
    const parent = person('mouse', 'adult', { householdId: h });
    const baby = person('mouse', 'child', { householdId: h, bornDay: today - 2 });
    mirror.households.set(h, {
      id: h,
      family: 'Showcase',
      members: [parent.id, baby.id],
      homeId: 0,
      tier: 'settler',
      pantryFood: 4,
    });
    walk(
      parent,
      [
        [44, 60],
        [62, 60],
      ],
      0.6,
      2,
    );
  }
  // The story characters about their business.
  const story = (sp: string, pts: number[][], t: number): void =>
    walk(person(sp, 'adult', { flags: ResidentFlags.story, tier: 'craftsfolk' }), pts, 0.8, t);
  story(
    'mouse',
    [
      [72, 60],
      [72, 56],
      [80, 56],
    ],
    0,
  );
  story(
    'fox',
    [
      [90, 60],
      [93, 56],
      [96, 56],
    ],
    2,
  );
  story(
    'rabbit',
    [
      [64, 62],
      [64, 66],
      [60, 66],
    ],
    1,
  );
  // Porters with the village's new goods, children playing by the school.
  const porterGoods = ['wool', 'cheese', 'cider', 'yarn', 'cloth', 'firewood', 'apples', 'bricks'];
  porterGoods.forEach((g, i) => {
    const r = person(species[i % species.length]!, 'adult', { tier: 'settler' });
    const x = 36 + i * 7;
    walk(
      r,
      [
        [x, 60],
        [x + 5, 60],
        [x + 5, 50],
      ],
      0.7,
      i * 2,
      { anim: AgentAnim.carry, carry: gi(g) + 1 },
    );
  });
  for (let i = 0; i < 4; i++) {
    const r = person(species[(i * 3) % species.length]!, 'child', { tier: 'settler' });
    movers.push({
      id: r.id,
      pts: route([[35 + i, 59]]),
      speed: 0,
      anim: AgentAnim.hop,
      carry: 0,
      side: 0,
      t: 0,
      jitter: true,
    });
  }
  // A tableau in front of the tavern for close-ups: a couple chatting hand in hand, a parent with
  // the baby, the three story characters, and a cart unloading at the Trading Post.
  const stand = (
    r: ResidentView,
    x: number,
    z: number,
    facing: number,
    anim: number = AgentAnim.idle,
  ): void => {
    movers.push({ id: r.id, pts: [[x, z]], speed: 0, anim, carry: 0, side: 0, t: 0, facing });
  };
  {
    const h = hid++;
    const a = person('hedgehog', 'adult', { householdId: h });
    const b = person('rabbit', 'adult', { householdId: h, partner: a.id });
    mirror.residents.set(a.id, { ...a, partner: b.id });
    stand(a, 62.6, 60.55, 0.3);
    stand(b, 62.6, 60.55, 0.3);
    const h2 = hid;
    const parent = person('otter', 'adult', { householdId: h2 });
    const baby = person('otter', 'child', { householdId: h2, bornDay: today - 1 });
    mirror.households.set(h2, {
      id: h2,
      family: 'Showcase',
      members: [parent.id, baby.id],
      homeId: 0,
      tier: 'craftsfolk',
      pantryFood: 4,
    });
    stand(parent, 66.2, 60.7, -0.4);
    const pippa = person('mouse', 'adult', { flags: ResidentFlags.story });
    const odette = person('fox', 'adult', { flags: ResidentFlags.story });
    const juniper = person('rabbit', 'adult', { flags: ResidentFlags.story });
    stand(pippa, 63.9, 61.1, 2.6);
    stand(odette, 65.2, 61.3, -2.8);
    stand(juniper, 64.6, 59.8, 0.0, AgentAnim.hop);
  }
  movers.push({
    id: 690100,
    pts: [[92.5, 60.4]],
    speed: 0,
    anim: AgentAnim.cart,
    carry: gi('wool') + 1,
    side: 0,
    t: 0,
    facing: Math.PI / 2,
  });
  mirror.hamletRevision.value++;

  const moverRows = (dt: number): Float32Array => {
    const data = new Float32Array(movers.length * AGENT_STRIDE);
    const now = performance.now();
    movers.forEach((r, i) => {
      r.t += dt * r.speed;
      let x = r.pts[0]![0];
      let z = r.pts[0]![1];
      let dx = 0;
      let dz = 1;
      let back = false;
      if (r.pts.length > 1) {
        // Out and back along the polyline.
        const lens = r.pts.slice(1).map((p, k) => Math.hypot(p[0] - r.pts[k]![0], p[1] - r.pts[k]![1]));
        const total = lens.reduce((sum, l) => sum + l, 0);
        let s = r.t % (total * 2);
        back = s > total;
        if (back) s = total * 2 - s;
        let k = 0;
        while (k < lens.length - 1 && s > lens[k]!) s -= lens[k++]!;
        const a = r.pts[k]!;
        const b = r.pts[k + 1]!;
        const f = lens[k]! > 0 ? s / lens[k]! : 0;
        x = a[0] + (b[0] - a[0]) * f;
        z = a[1] + (b[1] - a[1]) * f;
        dx = (b[0] - a[0]) * (back ? -1 : 1);
        dz = (b[1] - a[1]) * (back ? -1 : 1);
      } else if (r.facing !== undefined) {
        dx = Math.sin(r.facing);
        dz = Math.cos(r.facing);
      } else if (r.jitter) {
        // Children hop about a spot.
        x += Math.sin(r.id + now / 900) * 0.4;
        z += Math.cos(r.id * 1.7 + now / 1300) * 0.3;
      }
      const len = Math.hypot(dx, dz) || 1;
      const o = i * AGENT_STRIDE;
      data[o] = r.id;
      // Carts keep to one side of the road's middle, like a polite carter.
      data[o + 1] = x + (dz / len) * r.side;
      data[o + 2] = z - (dx / len) * r.side;
      data[o + 3] = 2;
      data[o + 4] = Math.atan2(dx, dz);
      data[o + 5] = r.anim;
      data[o + 6] = back && r.emptyBack ? 0 : r.carry;
      data[o + 7] = r.anim === AgentAnim.hop ? AgentFlags.child | AgentFlags.happy : 0;
    });
    return data;
  };
  const apply = mirror.applyAgents.bind(mirror);
  let last = performance.now();
  mirror.applyAgents = (t, data, now) => {
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    const extra = moverRows(dt);
    const merged = new Float32Array(data.length + extra.length);
    merged.set(data);
    merged.set(extra, data.length);
    apply(t, merged, now);
  };
  return {
    buildings: placed,
    carts: movers.filter((m) => m.anim === AgentAnim.cart).length,
    stop: () => {
      mirror.applyAgents = apply;
    },
  };
}
