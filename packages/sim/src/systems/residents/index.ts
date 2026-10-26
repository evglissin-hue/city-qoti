// The residents system (docs/spec/11-residents.md): arrivals, departures, jobs, schedules, needs,
// mood and friendships. Heavy work is spread out: the daily pass at 06:00, breakfast at 07:00,
// arrivals at 08:00, departures at 09:00, friendships hourly at an offset, each household's needs
// once an hour at its own tick, and each resident's schedule every THINK_EVERY ticks at its own.
import { ResidentFlags } from '../../constants';
import type { Resident, System, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { modifierValue } from './api';
import { dailyFriendships, hourlyFriendships } from './friends';
import { assignJobs, auditJobs } from './jobs';
import { arrivals, departures, morningPass, rehouse, thinkLeaving } from './lifecycle';
import { eatBreakfast, updateHouseholdNeeds } from './needs';
import { syncResident } from './records';
import { THINK_EVERY, think, thinkArrival } from './schedule';
import { HOUR, at, tickOfDay } from './time';

/** Offsets within the hour for hourly work, away from other systems' offsets (50, 100, 150). */
const FRIENDS_OFFSET = 71;
const JOBS_OFFSET = 29;
/** Upkeep (rehousing, job audit and present recount) runs this often. */
const UPKEEP_EVERY = 20;

const MORNING = at(6);
const BREAKFAST = at(7);
const ARRIVALS = at(8);
const DEPARTURES = at(9);

function clearHop(state: WorldState, r: Resident): void {
  if (!(r.flags & ResidentFlags.hop)) return;
  const granted = r.modifiers.find((m) => m.kind === 'wish-granted');
  const since = granted ? state.tick - granted.from : HOUR;
  if (since >= HOUR || (granted && modifierValue(granted, state.tick) === 0)) r.flags &= ~ResidentFlags.hop;
}

export function residentsTick(state: WorldState, ctx: TickCtx): void {
  const t = state.tick;
  const tod = tickOfDay(t);
  const rng = ctx.rng('residents');
  if (tod === MORNING) {
    morningPass(state);
    dailyFriendships(state);
  }
  if (tod === BREAKFAST) eatBreakfast(state, ctx);
  if (tod === ARRIVALS) arrivals(state, ctx, rng);
  if (tod === DEPARTURES) departures(state, ctx);
  if (t % UPKEEP_EVERY === 0) {
    rehouse(state, ctx);
    auditJobs(state);
  }
  if (t % HOUR === JOBS_OFFSET) assignJobs(state, ctx);
  if (t % HOUR === FRIENDS_OFFSET) hourlyFriendships(state);

  const hs = state.households;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i]!;
    if ((h.id + t) % HOUR === 0) updateHouseholdNeeds(state, h);
  }

  const rs = state.residents;
  let gone: Resident[] | null = null;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]!;
    if ((t + r.id) % THINK_EVERY !== 0) continue;
    clearHop(state, r);
    const kind = r.activity.kind;
    if (kind === 'arrive') thinkArrival(state, ctx, r);
    else if (kind === 'leave') (gone ??= []).push(r);
    else think(state, ctx, rng, r);
    syncResident(state, ctx, r);
  }
  if (gone) for (const r of gone) thinkLeaving(state, ctx, r);
}

export const residents: System = {
  id: 'residents',
  order: 50,
  every: 1,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    residentsTick(state, ctx);
  },
};
