// Debug only (C3D): synthetic residents for render tests and screenshots before the sim's own
// residents arrive. Fills the Mirror with resident views and posts agent frames every 100 ms, as
// the worker would: folk stroll between nearby spots, porters carry goods, some work or hop.
import { content } from '@qoti/content';
import { AGENT_STRIDE, AgentAnim, AgentFlags, MAP_SIZE, type ResidentView, type TierId } from '@qoti/sim';
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
