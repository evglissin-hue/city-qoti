// Bench scenario for threats and raids (C5D): the threat fixture grown to 150 residents with an
// eight-strong Watch, a Large raid of 12 raiders run from dusk, timing the raids and defenses
// systems' share of each tick (budget 0.5 ms), and the daily threat pass (pressure, deterrence,
// the schedule) with the Watch roster (budget 1 ms). The rest of the tick is the village scenario's.
import { createTickCtx, runTick, type Household, type Resident, type WorldState } from '@qoti/sim';
import { threatFixture } from '../../../packages/sim/test/fixtures/threat';
import { withoutSystems } from '../../../packages/sim/src/systems';
import { defenses } from '../../../packages/sim/src/systems/defenses';
import { raids } from '../../../packages/sim/src/systems/raids';
import { raidStartTick } from '../../../packages/sim/src/systems/threats/api';
import { threatDay } from '../../../packages/sim/src/systems/threats/pressure';
import { rosterDay } from '../../../packages/sim/src/systems/watch';

export const RAID_TICK_BUDGET_MS = 0.5;
export const THREAT_DAY_BUDGET_MS = 1;
const RESIDENTS = 150;
const RAIDERS = 12;
const WATCH = 8;
/** Ticks of the raid timed (three in-game hours from dusk, the busy part). */
const TICKS = 600;

/** Grows a town to `n` residents with households of three copied from its own. */
function grow(state: WorldState, n: number): void {
  let k = 0;
  const base = state.households.length;
  while (state.residents.length < n) {
    const src = state.households[k++ % base]!;
    const h: Household = {
      ...src,
      id: state.nextId++,
      members: [],
      pantry: [...src.pantry],
      recentFoods: [],
    };
    for (let i = 0; i < 3 && state.residents.length < n; i++) {
      const proto = state.residents.find((r) => r.householdId === src.id) ?? state.residents[0]!;
      const r: Resident = {
        ...proto,
        id: state.nextId++,
        householdId: h.id,
        jobId: 0,
        inside: proto.inside,
        move: null,
        needs: [...proto.needs],
        modifiers: [],
        friends: [],
        traits: [...proto.traits],
        history: [],
      };
      delete r.watch;
      delete r.partner;
      state.residents.push(r);
      h.members.push(r.id);
    }
    state.households.push(h);
  }
}

export function raidsBench(): { lines: string[]; failures: string[]; report: Record<string, unknown> } {
  const f = threatFixture();
  const state = f.state;
  grow(state, RESIDENTS);
  const adults = state.residents.filter((r) => r.stage === 'adult').slice(0, WATCH);
  state.watch.members = adults.map((r) => r.id).sort((a, b) => a - b);
  for (const r of adults) r.watch = { dutyDay: 0, shakenUntil: 0 };
  const s = state.threats.scheduled!;
  s.strength = RAIDERS;
  s.band = 'large';

  // The daily threat pass and the roster.
  // The worst case: the network changed every day, so the raiders' reach is flooded afresh (one
  // pass first, untimed, so the timing is not the JIT's).
  const dctx = createTickCtx(state);
  const days = 20;
  threatDay(state, dctx);
  rosterDay(state, dctx);
  let t0 = performance.now();
  for (let i = 0; i < days; i++) {
    state.networkVersion += 1;
    threatDay(state, dctx);
    rosterDay(state, dctx);
    dctx.events.length = 0;
  }
  const perDay = (performance.now() - t0) / days;
  state.threats.scheduled = s;
  state.threats.pressure = 2000;
  state.watch.members = adults.map((r) => r.id).sort((a, b) => a - b);

  // The raid, from dusk.
  state.tick = raidStartTick(s);
  const ctx = createTickCtx(state);
  let raidMs = 0;
  let ticks = 0;
  let maxRaiders = 0;
  withoutSystems(['raids', 'defenses'], () => {
    for (let i = 0; i < TICKS; i++) {
      runTick(state, ctx);
      state.tick -= 1;
      t0 = performance.now();
      raids.tick(state, ctx);
      defenses.tick(state, ctx);
      raidMs += performance.now() - t0;
      state.tick += 1;
      ticks++;
      maxRaiders = Math.max(maxRaiders, state.raid?.raiders.length ?? 0);
      ctx.events.length = 0;
      if (i > 10 && !state.raid) break;
    }
  });
  const perTick = raidMs / ticks;
  const failures: string[] = [];
  if (perTick > RAID_TICK_BUDGET_MS) failures.push(`raid tick ${perTick.toFixed(3)} ms`);
  if (perDay > THREAT_DAY_BUDGET_MS) failures.push(`threat day ${perDay.toFixed(3)} ms`);
  return {
    lines: [
      `raids           ${state.residents.length} residents, ${maxRaiders} raiders, ${WATCH} Watch: ` +
        `${perTick.toFixed(3)} ms a tick for raids and defenses (budget ${RAID_TICK_BUDGET_MS} ms), ` +
        `${perDay.toFixed(3)} ms the daily threat pass and roster (budget ${THREAT_DAY_BUDGET_MS} ms)  ` +
        (failures.length ? 'OVER BUDGET' : 'ok'),
    ],
    failures,
    report: {
      residents: state.residents.length,
      raiders: maxRaiders,
      msPerRaidTick: perTick,
      msPerThreatDay: perDay,
    },
  };
}
