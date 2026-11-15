// Bench scenario for festivals, renown, commissions and the River Dock (C5B): the winter fixture
// grown to 150 residents with its feast's well gathering place made real, a River Dock and
// commissions open. Budgets (C5B brief): a festival's outcome (who comes, the joy parts, the
// stars and the rewards) under 3 ms; a day of the renown, commissions and dock passes under 1 ms.
// R1.0: the dock has no orders (the carrier sails the boat; R1A); its daily pass is still timed.
import { createTickCtx, type Household, type Resident, type WorldState } from '@qoti/sim';
import { addDecorAt, placeFree } from '../../../packages/sim/test/fixtures/seasonsPlace';
import { winterFixture } from '../../../packages/sim/test/fixtures/winter';
import { runPatterns } from '../../../packages/sim/src/systems/hearth/patterns/engine';
import { chooseGuests, inReach } from '../../../packages/sim/src/systems/festivals/api';
import { grantFestival } from '../../../packages/sim/src/systems/festivals/rewards';
import { scoreFestival } from '../../../packages/sim/src/systems/festivals/score';
import { siteRect } from '../../../packages/sim/src/systems/festivals/site';
import { checkCommissions, offerNeighbor, offerVisitor } from '../../../packages/sim/src/systems/commissions';
import { dockDay } from '../../../packages/sim/src/systems/dock';
import { TICKS_PER_HOUR } from '../../../packages/sim/src/constants';

export const FESTIVAL_OUTCOME_BUDGET_MS = 3;
export const FESTIVAL_DAY_BUDGET_MS = 1;
const RESIDENTS = 150;

function grow(state: WorldState): void {
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
}

export function festivalsBench(): { lines: string[]; failures: string[]; report: Record<string, unknown> } {
  const { state } = winterFixture();
  grow(state);
  addDecorAt(state, 'bench', 58.5, 53.5);
  addDecorAt(state, 'bench', 63.5, 53.5);
  addDecorAt(state, 'cherry-tree', 61.5, 50.5);
  addDecorAt(state, 'festival-table', 59.5, 55.5);
  const ctx = createTickCtx(state);
  runPatterns(state, ctx);
  state.weather.river.frozen = false;
  state.renown.level = 3;
  state.renown.points = 60;
  placeFree(state, 'river-dock', 98, 60);
  for (let g = 0; g < state.economy.everProduced.length; g++) state.economy.everProduced[g] = 10;
  for (let i = 0; i < 2; i++) offerNeighbor(state, ctx);
  for (const c of state.commissions.list) {
    c.status = 'accepted';
    c.deadlineTick = state.tick + 1_000_000;
  }
  const plan = state.festival.plan!;
  const rect = siteRect(state, plan.site)!;

  // A festival's outcome: who comes, the score, and the rewards.
  const runs = 30;
  let t0 = performance.now();
  for (let i = 0; i < runs; i++) {
    const guests = chooseGuests(state, rect);
    const outcome = scoreFestival(state, plan, rect, guests.length, inReach(state, rect).length);
    grantFestival(state, ctx, plan, rect, outcome, guests);
    ctx.events.length = 0;
  }
  const outcomeMs = (performance.now() - t0) / runs;

  // A day of renown (00:06), commissions (hourly) and the dock (08:00).
  const days = 20;
  t0 = performance.now();
  for (let d = 0; d < days; d++) {
    offerVisitor(state, ctx);
    for (let h = 0; h < 24; h++) {
      checkCommissions(state, ctx);
      state.tick += TICKS_PER_HOUR;
    }
    dockDay(state, ctx);
    ctx.events.length = 0;
  }
  const dayMs = (performance.now() - t0) / days;

  const failures: string[] = [];
  if (outcomeMs > FESTIVAL_OUTCOME_BUDGET_MS) failures.push(`festival outcome ${outcomeMs.toFixed(3)} ms`);
  if (dayMs > FESTIVAL_DAY_BUDGET_MS)
    failures.push(`renown, commissions and dock day ${dayMs.toFixed(3)} ms`);
  return {
    lines: [
      `festivals       ${state.residents.length} residents: ${outcomeMs.toFixed(3)} ms a festival's outcome ` +
        `(budget ${FESTIVAL_OUTCOME_BUDGET_MS} ms), ${dayMs.toFixed(3)} ms a day of renown, commissions and the dock ` +
        `(budget ${FESTIVAL_DAY_BUDGET_MS} ms)  ` +
        (failures.length ? 'OVER BUDGET' : 'ok'),
    ],
    failures,
    report: { residents: state.residents.length, outcomeMs, dayMs },
  };
}
