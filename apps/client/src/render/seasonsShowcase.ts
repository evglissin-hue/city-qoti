// Debug only (C5E part 2): the I3 pieces side by side for art review, in this client's Mirror (the
// sim never sees any of it): a palisade with a gate (pieces whole, chipped, breached and down), a
// stone wall with ivy and a flower box, the watchtower, bell tower and Watch House, both traps (one
// sprung), a festival square laid out for tonight (bonfire, stage, stalls with the menu's goods,
// tables, bunting, a flower arch, festoon lanterns round the site), the circus on a green, the new
// trades, the bath house, apiary, dock and bridge, and homes with modules fitted.
import { content } from '@qoti/content';
import {
  Flags,
  MAP_SIZE,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type BuildingRuntimeView,
  type BuildingView,
  type Rot4,
  type SimEvent,
} from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { drawDef } from './defs';
import { buildingMatrix } from './kitGeometry';
import { Vector3 } from 'three';

const N = MAP_SIZE;
const FIRST_ID = 760000;

interface Piece {
  def: string;
  x: number;
  z: number;
  rot?: Rot4;
  hp?: number;
  open?: boolean;
  modules?: [string, string][];
  style?: string;
}

export interface SeasonsShowcaseResult {
  center: [number, number];
  buildings: number;
  decor: number;
  /** Where to look at each group: [name, x, z]. */
  spots: [string, number, number][];
}

export function seasonsShowcase(mirror: Mirror, cx?: number, cz?: number): SeasonsShowcaseResult {
  const [sx0, sz0, sx1, sz1] = mirror.meta.startArea;
  const x0 = Math.round(cx ?? (sx0! + sx1!) / 2 + 24);
  const z0 = Math.round(cz ?? (sz0! + sz1!) / 2 - 6);
  const pieces: Piece[] = [];
  const spots: [string, number, number][] = [];

  // Defenses: a palisade run with a gate and a corner; damage from the left.
  const hpRow = [100, 70, 30, 0, 100, 100];
  for (let i = 0; i < 6; i++)
    pieces.push({ def: 'palisade', x: x0 + i, z: z0, ...(hpRow[i]! < 100 ? { hp: hpRow[i]! } : {}) });
  pieces.push({ def: 'gate', x: x0 + 6, z: z0 });
  pieces.push({ def: 'palisade', x: x0 + 7, z: z0 });
  for (let i = 1; i <= 3; i++) pieces.push({ def: 'palisade', x: x0 + 7, z: z0 + i });
  pieces.push({ def: 'gate', x: x0 + 7, z: z0 + 4, rot: 1, open: false });
  pieces.push({ def: 'palisade', x: x0 + 7, z: z0 + 5 });
  spots.push(['palisade', x0 + 4, z0 + 2]);
  // A stone wall: whole, ivy, flower box, chipped, breached, down.
  const stone: Partial<Piece>[] = [
    {},
    { modules: [['wall', 'ivy']] },
    { modules: [['wall', 'flower-boxes']] },
    { hp: 70 },
    { hp: 30 },
    { hp: 0 },
  ];
  stone.forEach((p, i) => pieces.push({ def: 'stone-wall', x: x0 + i, z: z0 + 3, ...p }));
  spots.push(['stone-wall', x0 + 3, z0 + 4]);
  pieces.push({ def: 'watchtower', x: x0 - 2, z: z0 + 1 });
  pieces.push({ def: 'bell-tower', x: x0 - 2, z: z0 + 4 });
  pieces.push({ def: 'watch-house', x: x0 - 5, z: z0 + 2 });
  pieces.push({ def: 'net-trap', x: x0 + 1, z: z0 - 2 });
  pieces.push({ def: 'net-trap', x: x0 + 2, z: z0 - 2, hp: 0 });
  pieces.push({ def: 'pit-trap', x: x0 + 3, z: z0 - 2 });
  pieces.push({ def: 'pit-trap', x: x0 + 4, z: z0 - 2, hp: 0 });
  spots.push(['watch', x0 - 3, z0 + 3]);

  // The new buildings and homes with modules, in a row to the south.
  const zb = z0 + 8;
  let x = x0 - 6;
  for (const def of [
    'bath-house',
    'apiary',
    'pie-shop',
    'chandler',
    'tailor',
    'carpenter',
    'herbalists-cottage',
  ]) {
    const d = drawDef(def);
    if (!d) continue;
    pieces.push({ def, x, z: zb });
    x += d.size[0] + 1;
  }
  spots.push(['trades', x0 + 2, zb + 1]);
  const zm = zb + 4;
  const mods: [string, string][][] = [
    [['front', 'porch']],
    [
      ['roof', 'dormer'],
      ['side', 'bay-window'],
    ],
    [
      ['top', 'extra-floor'],
      ['wall', 'flower-boxes'],
    ],
    [
      ['side', 'balcony'],
      ['wall', 'ivy'],
    ],
    [
      ['front', 'arcade'],
      ['top', 'tower'],
    ],
  ];
  x = x0 - 6;
  for (const m of mods) {
    pieces.push({ def: 'townhouse', x, z: zm, modules: m, style: 'plaster' });
    x += 3;
  }
  pieces.push({
    def: 'tavern',
    x,
    z: zm,
    modules: [
      ['front', 'arcade'],
      ['side', 'balcony'],
      ['wall', 'ivy'],
    ],
  });
  spots.push(['modules', x0 + 1, zm + 1]);

  // The dock and the bridge on the nearest bank whose water lies behind them.
  const waterL = mirror.layers.water as Uint8Array;
  const roadL = mirror.layers.road as Uint8Array;
  const occL = mirror.layers.occupant as Int32Array;
  const v = new Vector3();
  const bank = (def: string, near: [number, number], avoid: [number, number] | null): Piece | null => {
    const d = drawDef(def);
    if (!d) return null;
    let best: Piece | null = null;
    let bestD = Infinity;
    for (let z = Math.max(2, near[1] - 30); z < Math.min(N - 4, near[1] + 30); z++)
      for (let xx = Math.max(2, near[0] - 30); xx < Math.min(N - 4, near[0] + 30); xx++)
        for (const rot of [0, 1, 2, 3] as Rot4[]) {
          const [w, dd] = rot % 2 ? [d.size[1], d.size[0]] : d.size;
          let ok = true;
          for (let tz = z; tz < z + dd && ok; tz++)
            for (let tx = xx; tx < xx + w && ok; tx++) {
              const i = tz * N + tx;
              if (waterL[i] || roadL[i] || occL[i]) ok = false;
            }
          if (!ok) continue;
          const m = buildingMatrix(def, xx, z, rot, 0);
          for (let u = 0; u < d.size[0] && ok; u++) {
            v.set(u + 0.5, 0, -0.5).applyMatrix4(m);
            if (!waterL[Math.floor(v.z) * N + Math.floor(v.x)]) ok = false;
          }
          if (!ok) continue;
          const dist = Math.hypot(xx - near[0], z - near[1]);
          if (avoid && Math.hypot(xx - avoid[0], z - avoid[1]) < 6) continue;
          if (dist < bestD) {
            bestD = dist;
            best = { def, x: xx, z, rot };
          }
        }
    return best;
  };
  const dock = bank('river-dock', [x0 + 22, z0 + 10], null);
  if (dock) {
    pieces.push(dock);
    spots.push(['dock', dock.x + 1, dock.z + 1]);
  }
  const bridge = bank('stone-bridge', [x0 + 22, z0 + 18], dock ? [dock.x, dock.z] : null);
  if (bridge) {
    pieces.push(bridge);
    spots.push(['bridge', bridge.x + 1.5, bridge.z + 1]);
  }

  // Place them.
  const occupant = new Int32Array(mirror.layers.occupant as Int32Array);
  const road = mirror.layers.road as Uint8Array;
  const water = mirror.layers.water as Uint8Array;
  const events: SimEvent[] = [];
  let id = FIRST_ID;
  let placed = 0;
  for (const p of pieces) {
    const def = drawDef(p.def);
    if (!def) continue;
    const rot = p.rot ?? 0;
    const [w, d] = rot % 2 ? [def.size[1], def.size[0]] : def.size;
    let clear = true;
    for (let z = p.z; z < p.z + d && clear; z++)
      for (let xx = p.x; xx < p.x + w; xx++) {
        const i = z * N + xx;
        if (xx < 0 || z < 0 || xx >= N || z >= N || occupant[i] || road[i] || water[i]) clear = false;
      }
    if (!clear) continue;
    const bid = id++;
    for (let z = p.z; z < p.z + d; z++) for (let xx = p.x; xx < p.x + w; xx++) occupant[z * N + xx] = bid;
    const rt: BuildingRuntimeView = {
      jobs: def.jobs?.count ?? 0,
      workers: 1,
      present: 1,
      status: 0,
      condition: 100,
      paused: false,
      progress: 0.4,
      input: [],
      output: [],
      store: [],
      ...(p.hp !== undefined ? { hp: p.hp } : {}),
      ...(p.open === false ? { open: false } : {}),
    };
    const b: BuildingView = {
      id: bid,
      def: p.def,
      x: p.x,
      z: p.z,
      rot,
      builtBy: 0,
      handmade: false,
      stage: 'built',
      foundation: false,
      ...(p.style ? { style: p.style } : {}),
      ...(p.modules ? { modules: p.modules } : {}),
      rt,
    };
    events.push({ e: 'building.added', b });
    placed++;
  }

  // A festival square to the east, set for tonight.
  const fx = x0 + 11;
  const fz = z0 + 1;
  let did = 860000;
  let decor = 0;
  const put = (def: string, px: number, pz: number, rot = 0): void => {
    if (!content.decorById.get(def)) return;
    const i = Math.floor(pz) * N + Math.floor(px);
    if (occupant[i] || water[i]) return;
    events.push({
      e: 'decor.added',
      d: { id: did++, def, fx: Math.round(px * 256), fz: Math.round(pz * 256), rot, builtBy: 0 },
    });
    decor++;
  };
  put('bonfire', fx + 3.5, fz + 3.5);
  put('festival-stage', fx + 3.5, fz + 0.6, 0);
  put('festival-stall', fx + 0.8, fz + 2.5, 16);
  put('festival-stall', fx + 0.8, fz + 4.5, 16);
  put('festival-table', fx + 5.8, fz + 2.8, 16);
  put('festival-table', fx + 5.8, fz + 4.4, 16);
  for (let i = 0; i < 6; i++) put('bunting', fx + 0.5 + i, fz + 6.6);
  put('flower-arch', fx + 3.5, fz + 7.4);
  put('gate-banner', x0 + 5.6, z0 + 0.7);
  put('gate-banner', x0 + 7.4 + 0, z0 - 0.4);
  put('lookout-bench', x0 - 1.5, z0 - 1.2);
  put('arbor-seat', x0 + 15.5, zm + 0.6);
  put('pear-tree', x0 + 16.6, zm + 1.8);
  put('reed-bed', x0 + 17.8, zm + 0.6);
  put('see-saw', x0 + 15.4, zm + 2.6, 16);
  put('swing', x0 + 17.6, zm + 2.7);
  spots.push(['greens', x0 + 16.5, zm + 1.5]);
  spots.push(['festival', fx + 3.5, fz + 3.5]);

  // Fixture valleys have high banks and no floodplain: mark one along the river (the land within
  // four tiles of it), so a pinned flood (`?debug&flood=0.8`) has somewhere to stand.
  const flags = new Uint8Array(mirror.layers.flags as Uint8Array);
  const markPlain = !flags.some((f) => f & Flags.floodplain);
  if (markPlain) {
    for (let z = 0; z < N; z++)
      for (let xx = 0; xx < N; xx++) {
        if (water[z * N + xx]) continue;
        let near = false;
        for (let dz = -4; dz <= 4 && !near; dz++)
          for (let dx = -4; dx <= 4 && !near; dx++) {
            const tx = xx + dx;
            const tz = z + dz;
            if (tx >= 0 && tz >= 0 && tx < N && tz < N && water[tz * N + tx]) near = true;
          }
        if (near) flags[z * N + xx]! |= Flags.floodplain;
      }
  }
  // Patch only the rect the pieces cover, so the ground's caches redraw just that.
  let bx0 = N;
  let bz0 = N;
  let bx1 = -1;
  let bz1 = -1;
  for (let i = 0; i < N * N; i++) {
    if (occupant[i] === (mirror.layers.occupant as Int32Array)[i]) continue;
    const x = i % N;
    const z = Math.floor(i / N);
    bx0 = Math.min(bx0, x);
    bz0 = Math.min(bz0, z);
    bx1 = Math.max(bx1, x);
    bz1 = Math.max(bz1, z);
  }
  const patches: {
    layer: 'occupant' | 'flags';
    rect: [number, number, number, number];
    data: Uint8Array | Int32Array;
  }[] = [];
  if (bx1 >= 0) {
    const w = bx1 - bx0 + 1;
    const data = new Int32Array(w * (bz1 - bz0 + 1));
    for (let z = bz0; z <= bz1; z++) data.set(occupant.subarray(z * N + bx0, z * N + bx1 + 1), (z - bz0) * w);
    patches.push({ layer: 'occupant', rect: [bx0, bz0, bx1, bz1], data });
  }
  if (markPlain) patches.push({ layer: 'flags', rect: [0, 0, N - 1, N - 1], data: flags });
  mirror.apply({ t: mirror.lastTurn.value, events, patches });

  // The festival, planned on the square for today, and the circus on a green to the north.
  const tick = mirror.tick.value;
  const today = Math.floor((tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
  mirror.festival.value = {
    festival: { id: 'harvest-supper', name: 'Harvest Supper', season: 2 },
    day: today,
    plan: {
      festival: 'harvest-supper',
      site: { rect: [fx, fz, fx + 6, fz + 7] },
      menu: [
        ['pies', 12, 12],
        ['apples', 10, 10],
        ['cheese', 6, 6],
      ],
      twist: '',
      music: 'resident',
      musician: 0,
      by: 0,
    },
    pieces: [],
    live: true,
  };
  const gx = x0 + 22;
  const gz = z0 + 4;
  mirror.patterns.set('village-green', {
    id: 'village-green',
    discovered: true,
    hinted: true,
    sites: [{ x: gx, z: gz, members: [], tiles: [] }],
  });
  const w = mirror.weather.value ?? { today: 'clear' as const, forecast: [], events: [], frozen: false };
  mirror.weather.value = {
    ...w,
    events: [
      ...w.events.filter((e) => e.event !== 'circus'),
      {
        id: 1,
        event: 'circus',
        name: 'The circus',
        start: tick,
        end: tick + TICKS_PER_DAY,
        forecastTick: tick,
        active: true,
      },
    ],
  };
  spots.push(['circus', gx, gz]);
  return { center: [x0, z0], buildings: placed, decor, spots };
}
