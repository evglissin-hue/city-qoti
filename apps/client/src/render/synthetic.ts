// Debug only (C3D): synthetic residents for render tests and screenshots before the sim's own
// residents arrive. Fills the Mirror with resident views and posts agent frames every 100 ms, as
// the worker would: folk stroll between nearby spots, porters carry goods, some work or hop.
import { content } from '@qoti/content';
import {
  AGENT_STRIDE,
  AgentAnim,
  AgentFlags,
  MAP_SIZE,
  type BuildingRuntimeView,
  type BuildingView,
  type LayerName,
  type ResidentView,
  type SimEvent,
  type TierId,
} from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { hash2 } from './coords';

const SPECIES = ['badger', 'fox', 'hedgehog', 'mouse', 'otter', 'rabbit', 'squirrel'];
const FIRST_ID = 900000;

interface Walker {
  id: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  speed: number;
  anim: number;
  carry: number;
  flags: number;
  heading: number;
  wait: number;
}

export interface SyntheticOptions {
  /** Center and radius of the area they wander, in tiles (default: the start area). */
  center?: [number, number];
  radius?: number;
  /** 'mixed' (default) or one fixed anim for everyone (AgentAnim number). */
  anim?: number;
  /** Bubble flags for everyone, for bubble screenshots. */
  flags?: number;
}

/**
 * Debug only: gives every building in the Mirror a plausible runtime (stock piles, outputs, crops,
 * status bits) and, when `sites` is set, turns that many of them into construction sites at
 * stages 0 to 3, so the art can be reviewed before the economy runs.
 */
export function fakeRuntime(mirror: Mirror, opts: { sites?: number; status?: boolean } = {}): void {
  const events: SimEvent[] = [];
  let site = 0;
  let i = 0;
  for (const b of mirror.buildings.values()) {
    const def = content.buildingById.get(b.def);
    const out = def?.methods?.[0]?.outputs ?? [];
    const inputs = def?.methods?.[0]?.inputs ?? [];
    const store: [string, number][] = def?.tags?.includes('storehouse')
      ? [
          ['logs', 50],
          ['planks', 34],
          ['stone', 22],
          ['flour', 12],
          ['bread', 20],
          ['vegetables', 30],
          ['fish', 8],
          ['wheat', 16],
        ]
      : def?.tags?.includes('outlet')
        ? [
            ['bread', 14],
            ['vegetables', 10],
            ['fish', 6],
          ]
        : [];
    const statusBits = [0, 1, 2, 4, 8, 16, 32, 64, 512, 1024];
    const rt: BuildingRuntimeView = {
      jobs: def?.jobs?.count ?? 0,
      workers: 1,
      present: 1,
      status: opts.status ? statusBits[i % statusBits.length]! : 0,
      condition: 100,
      paused: false,
      progress: ((i * 37) % 100) / 100,
      input: inputs.map(([g]) => [g, 4] as [string, number]),
      output: out.map(([g]) => [g, 6 + (i % 5)] as [string, number]),
      store,
    };
    let stage: BuildingView['stage'] = 'built';
    if (opts.sites && site < opts.sites && b.def !== 'town-hall') {
      stage = 'construction';
      rt.construction = {
        stage: (site % 4) as 0 | 1 | 2 | 3,
        progress: (site % 4) / 4,
        needs: [['planks', 6]],
        delivered: [
          ['logs', 4 + site * 2],
          ['planks', 2 + site * 3],
          ['stone', 6],
        ],
        priority: false,
      };
      rt.status = 128;
      site++;
    }
    events.push({ e: 'building.updated', b: { ...b, stage, rt } });
    i++;
  }
  // A few field tiles beside each farmhouse, one growth stage per column.
  const owner = new Int32Array(MAP_SIZE * MAP_SIZE);
  const crop = new Uint8Array(MAP_SIZE * MAP_SIZE);
  owner.set(mirror.layers.fieldOwner as Int32Array);
  crop.set(mirror.layers.crop as Uint8Array);
  for (const b of mirror.buildings.values()) {
    if (b.def !== 'farmhouse') continue;
    for (let dz = -1; dz < 3; dz++) {
      for (let dx = 0; dx < 4; dx++) {
        const x = b.x + 2 + dx;
        const z = b.z + dz;
        if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
        if (mirror.occupant(x, z) || mirror.water(x, z) || mirror.road(x, z)) continue;
        owner[z * MAP_SIZE + x] = b.id;
        crop[z * MAP_SIZE + x] = dx * 64 + 20;
      }
    }
  }
  const all: [number, number, number, number] = [0, 0, MAP_SIZE - 1, MAP_SIZE - 1];
  mirror.apply({
    t: mirror.lastTurn.value,
    events,
    patches: [
      { layer: 'fieldOwner', rect: all, data: owner },
      { layer: 'crop', rect: all, data: crop },
    ],
  });
}

/**
 * Debug only: a plausible charm field (until the sim's charm system runs), so the charm overlays can
 * be reviewed: warm near buildings and trees, a noisy patch around workshops.
 */
export function fakeCharm(mirror: Mirror): void {
  const spots = [...mirror.buildings.values()].map((b) => [b.x + 1, b.z + 1, b.def] as const);
  const layers: LayerName[] = [
    'charm',
    'charmNature',
    'charmComfort',
    'charmLight',
    'charmView',
    'charmNoise',
  ];
  const patches = layers.map((layer, li) => {
    const data = new Uint8Array(MAP_SIZE * MAP_SIZE);
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        let v = li === 1 ? (mirror.tree(x, z) ? 55 : 15) : 10;
        for (const [bx, bz, def] of spots) {
          const d2 = (bx - x) ** 2 + (bz - z) ** 2;
          const workshop = content.buildingById.get(def)?.tags?.includes('workshop') ?? false;
          if (li === 5) v += workshop ? 90 * Math.exp(-d2 / 18) : 0;
          else v += (li === 0 ? 55 : 35 + li * 6) * Math.exp(-d2 / (30 + li * 10));
        }
        v += (hash2(x >> 2, z >> 2, li) - 0.5) * 18;
        data[z * MAP_SIZE + x] = Math.max(0, Math.min(100, Math.round(v)));
      }
    }
    return { layer, rect: [0, 0, MAP_SIZE - 1, MAP_SIZE - 1] as [number, number, number, number], data };
  });
  mirror.apply({ t: mirror.lastTurn.value, events: [], patches });
}

/** Starts n synthetic residents; returns a stop function that clears them again. */
export function startSyntheticResidents(mirror: Mirror, n: number, opts: SyntheticOptions = {}): () => void {
  const [x0, z0, x1, z1] = mirror.meta.startArea;
  const cx = opts.center?.[0] ?? (x0 + x1) / 2;
  const cz = opts.center?.[1] ?? (z0 + z1) / 2;
  const radius = opts.radius ?? Math.max(12, Math.sqrt(n) * 1.2);
  const jobs = [...mirror.buildings.values()].filter(
    (b) => (content.buildingById.get(b.def)?.jobs?.count ?? 0) > 0,
  );
  const free = (x: number, z: number): boolean => {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    return (
      tx > 0 &&
      tz > 0 &&
      tx < MAP_SIZE - 1 &&
      tz < MAP_SIZE - 1 &&
      !mirror.water(tx, tz) &&
      !mirror.occupant(tx, tz)
    );
  };
  let seed = 1;
  const rnd = (): number => hash2(seed++, 91, 7);
  const spot = (): [number, number] => {
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * radius;
      const x = Math.floor(cx + Math.cos(a) * r) + 0.5;
      const z = Math.floor(cz + Math.sin(a) * r) + 0.5;
      if (free(x, z)) return [x, z];
    }
    return [cx, cz];
  };
  const walkers: Walker[] = [];
  const tiers: TierId[] = ['settler', 'settler', 'settler', 'craftsfolk', 'merchant', 'patron'];
  for (let i = 0; i < n; i++) {
    const id = FIRST_ID + i;
    const roll = rnd();
    const child = rnd() < 0.15;
    const anim =
      opts.anim ??
      (roll < 0.55
        ? AgentAnim.walk
        : roll < 0.72
          ? AgentAnim.carry
          : roll < 0.84
            ? AgentAnim.idle
            : roll < 0.94
              ? AgentAnim.work
              : AgentAnim.hop);
    const mood = rnd();
    let flags = opts.flags ?? 0;
    if (opts.flags === undefined) {
      if (mood < 0.08) flags |= AgentFlags.wish;
      else if (mood < 0.2) flags |= AgentFlags.happy;
      else if (mood < 0.25) flags |= AgentFlags.unhappy | AgentFlags.slow;
      else if (mood < 0.29) flags |= AgentFlags.sleepy;
    }
    if (child) flags |= AgentFlags.child;
    const [x, z] = spot();
    const [tx, tz] = spot();
    walkers.push({
      id,
      x,
      z,
      tx,
      tz,
      speed: 0.9 + rnd() * 0.5,
      anim,
      carry: anim === AgentAnim.carry ? 1 + Math.floor(rnd() * Math.min(8, content.goods.length)) : 0,
      flags,
      heading: 0,
      wait: 0,
    });
    const job = !child && jobs.length > 0 && rnd() < 0.6 ? jobs[Math.floor(rnd() * jobs.length)]!.id : 0;
    const r: ResidentView = {
      id,
      given: `Synth ${i}`,
      family: 'Test',
      species: SPECIES[Math.floor(rnd() * SPECIES.length)]!,
      stage: child ? 'child' : 'adult',
      traits: [],
      householdId: 0,
      homeId: 0,
      jobId: job,
      tier: tiers[Math.floor(rnd() * tiers.length)]!,
      wishId: flags & AgentFlags.wish ? 1 : 0,
      moodBand: 3,
      bond: 0,
      look: Math.floor(rnd() * 100000),
      flags: 0,
    };
    mirror.residents.set(id, r);
  }
  mirror.hamletRevision.value++;

  // The worker keeps posting (empty) frames for the real residents; mute them while this runs.
  const apply = mirror.applyAgents.bind(mirror);
  mirror.applyAgents = () => {};
  let t = mirror.agents.t;
  let last = performance.now();
  const tick = (): void => {
    const now = performance.now();
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    const data = new Float32Array(walkers.length * AGENT_STRIDE);
    walkers.forEach((w, i) => {
      if (w.anim === AgentAnim.walk || w.anim === AgentAnim.carry) {
        if (w.wait > 0) w.wait -= dt;
        else {
          const dx = w.tx - w.x;
          const dz = w.tz - w.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          const step = w.speed * dt * (w.flags & AgentFlags.slow ? 0.7 : 1);
          if (d <= step) {
            w.x = w.tx;
            w.z = w.tz;
            [w.tx, w.tz] = spot();
            w.wait = rnd() < 0.3 ? 1 + rnd() * 2 : 0;
          } else {
            w.x += (dx / d) * step;
            w.z += (dz / d) * step;
            w.heading = Math.atan2(dx, dz);
          }
        }
      }
      const o = i * AGENT_STRIDE;
      data[o] = w.id;
      data[o + 1] = w.x;
      data[o + 2] = w.z;
      data[o + 3] = mirror.height(Math.floor(w.x), Math.floor(w.z));
      data[o + 4] = w.heading;
      data[o + 5] = w.anim;
      data[o + 6] = w.carry;
      data[o + 7] = w.flags;
    });
    apply(++t, data, now);
  };
  tick();
  const timer = setInterval(tick, 100);
  return () => {
    clearInterval(timer);
    for (const w of walkers) mirror.residents.delete(w.id);
    apply(++t, new Float32Array(0), performance.now());
    mirror.applyAgents = apply;
    mirror.hamletRevision.value++;
  };
}
