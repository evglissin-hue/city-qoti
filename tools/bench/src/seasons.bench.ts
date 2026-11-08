// Bench scenario for the seasons (C5A): the winter fixture grown to 150 residents, and one in-game
// day of the seasons, weather, warmth and trials passes (with spoilage and the season report), against
// a budget of 1 ms per day. The Village tick budget is the village scenario's (village.bench.ts).
import { createTickCtx, type Household, type Resident } from '@qoti/sim';
import { winterFixture } from '../../../packages/sim/test/fixtures/winter';
import { seasonReportView } from '../../../packages/sim/src/view/season';
import { turnDay } from '../../../packages/sim/src/systems/seasons';
import { stepTrial } from '../../../packages/sim/src/systems/trials';
import { burnDay } from '../../../packages/sim/src/systems/warmth';
import { weatherDay } from '../../../packages/sim/src/systems/weather';

export const SEASONS_DAY_BUDGET_MS = 1;
const RESIDENTS = 150;

export function seasonsBench(): { lines: string[]; failures: string[]; report: Record<string, unknown> } {
  const { state } = winterFixture();
  // Grow the town with households of three copied from the fixture's.
  let k = 0;
  while (state.residents.length < RESIDENTS) {
    const src = state.households[k++ % state.households.length]!;
    const h: Household = {
      ...src,
      id: state.nextId++,
      members: [],
      pantry: [...src.pantry],
      recentFoods: [],
    };
    for (let i = 0; i < 3 && state.residents.length < RESIDENTS; i++) {
      const proto = state.residents.find((r) => r.householdId === src.id) ?? state.residents[0]!;
      const r: Resident = {
        ...proto,
        id: state.nextId++,
        householdId: h.id,
        needs: [...proto.needs],
        modifiers: [],
        friends: [],
        traits: [...proto.traits],
      };
      state.residents.push(r);
      h.members.push(r.id);
    }
    state.households.push(h);
  }
  const ctx = createTickCtx(state);
  // C5X: a few days first, so the JIT has compiled the passes, then the median day of forty (a cold
  // mean of twenty swung from 0.84 to 1.30 ms between identical runs on one machine).
  const day = () => {
    turnDay(state, ctx);
    weatherDay(state, ctx);
    burnDay(state, ctx);
    stepTrial(state, ctx);
    seasonReportView(state);
    ctx.events.length = 0;
  };
  for (let i = 0; i < 5; i++) day();
  const times: number[] = [];
  for (let i = 0; i < 40; i++) {
    const t0 = performance.now();
    day();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const perDay = times[times.length >> 1]!;
  const failures = perDay > SEASONS_DAY_BUDGET_MS ? [`seasons day ${perDay.toFixed(3)} ms`] : [];
  return {
    lines: [
      `seasons         ${state.residents.length} residents, ${state.households.length} households: ` +
        `${perDay.toFixed(3)} ms an in-game day of seasons, weather, warmth and trials (budget ${SEASONS_DAY_BUDGET_MS} ms)  ` +
        (failures.length ? 'OVER BUDGET' : 'ok'),
    ],
    failures,
    report: { residents: state.residents.length, households: state.households.length, msPerDay: perDay },
  };
}
