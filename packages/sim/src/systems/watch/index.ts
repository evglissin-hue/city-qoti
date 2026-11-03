// The Watch (C5D): at 05:30 the roster. docs/spec/14-challenge.md, The Watch.
// - Adults with bond 2 or more volunteer once a Watch House stands, up to the Ledger's target
//   (most bond first, then by id); if the target falls, the newest go back to civilian life.
// - Members spend one day in four on duty at the Watch House (away from their job): the day when
//   (day + id) % 4 is 0. On a raid day they all turn out (systems/watch/overrides).
// - The budget pays members a stipend with pay(), so the coins stay in the valley; a stipend of
//   half a coin a member raises training a point a day, a coin and a half two (100 to 160).
// - Morale: the town's average mood, festivals (festivalMorale), friendships among members, and
//   the last three raids.
// - Between raids, masons mend walls a quarter of their hit points a day, and the Watch resets
//   sprung traps.
import { content } from '@qoti/content';
import { TICKS_PER_DAY, WATCH_TRAINING } from '../../constants';
import type { Building, Resident, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { watchView } from '../../view/seasons';
import { dailyOffset, dayIndex } from '../economy/time';
import { pay } from '../economy/money';
import { festivalMorale } from '../festivals/api';
import { hpOf, maxHp, raidDay } from '../threats/api';

/** One day in this many on duty. */
export const DUTY_EVERY = 4;
/** Bond hearts a volunteer needs. */
export const VOLUNTEER_BOND = 2;
/** Stipend per member a day (pennies) for one and two points of training. */
export const TRAIN_STIPEND = [50, 150] as const;

export function watchHouses(state: WorldState): Building[] {
  return state.buildings.filter((b) => b.stage === 'built' && b.def === 'watch-house');
}

/** True when a resident may serve: an adult who lives here and is not on the way out. */
export function canServe(r: Resident): boolean {
  return r.stage === 'adult' && r.activity.kind !== 'leave' && !r.retired;
}

/** The day a member is next on duty, from `day` on. */
export function nextDuty(id: number, day: number): number {
  let d = day;
  while ((d + id) % DUTY_EVERY !== 0) d++;
  return d;
}

function leave(state: WorldState, id: number): void {
  const r = findById(state.residents, id);
  if (r) delete r.watch;
}

/** Watch morale, 0 to 100 (wave notes: mood, festivals, friends among members, victories). */
export function watchMorale(state: WorldState): number {
  let sum = 0;
  for (const r of state.residents) sum += r.mood;
  const mood = state.residents.length > 0 ? Math.floor(sum / state.residents.length) : 50;
  let friends = 0;
  const members = state.watch.members;
  for (const id of members) {
    const r = findById(state.residents, id);
    if (!r) continue;
    for (const f of r.friends) if (f.id > id && f.level >= 1 && members.includes(f.id)) friends++;
  }
  let wins = 0;
  for (const h of state.threats.history.slice(-3)) wins += h.repelled ? 4 : -4;
  const m = mood + festivalMorale(state) + Math.min(15, friends * 3) + wins;
  return Math.max(0, Math.min(100, m));
}

export function rosterDay(state: WorldState, ctx: TickCtx): void {
  const w = state.watch;
  const today = dayIndex(state.tick);
  const houses = watchHouses(state);
  if (houses.length === 0) {
    if (w.members.length > 0 || w.duty.length > 0) {
      for (const id of w.members) leave(state, id);
      w.members = [];
      w.duty = [];
      ctx.events.push({ e: 'watch.updated', w: watchView(state) });
    }
    return;
  }
  // Who serves: still here and able, up to the target.
  const members = w.members.filter((id) => {
    const r = findById(state.residents, id);
    return !!r && canServe(r);
  });
  for (const id of w.members) if (!members.includes(id)) leave(state, id);
  while (members.length > w.target) leave(state, members.pop()!);
  if (members.length < w.target) {
    const want = state.residents
      .filter((r) => canServe(r) && r.bond >= VOLUNTEER_BOND && !members.includes(r.id))
      .sort((a, b) => b.bond - a.bond || a.id - b.id)
      .slice(0, w.target - members.length);
    for (const r of want) members.push(r.id);
    members.sort((a, b) => a - b);
  }
  w.members = members;
  for (const id of members) {
    const r = findById(state.residents, id)!;
    r.watch = { dutyDay: nextDuty(id, today), shakenUntil: r.watch?.shakenUntil ?? 0 };
  }
  // Today's duty (on a raid day everyone turns out instead).
  const raidToday = state.threats.scheduled !== null && raidDay(state.threats.scheduled) === today;
  w.duty = raidToday
    ? []
    : members.filter(
        (id) =>
          (today + id) % DUTY_EVERY === 0 && findById(state.residents, id)!.watch!.shakenUntil <= state.tick,
      );
  for (const id of w.duty) findById(state.residents, id)!.watch!.dutyDay = nextDuty(id, today + 1);

  // The stipend and training.
  if (w.budget > 0 && members.length > 0 && state.economy.treasury >= w.budget && !state.economy.leanTimes) {
    const each = Math.floor(w.budget / members.length);
    for (const id of members) {
      const r = findById(state.residents, id)!;
      pay(state, 'treasury', { household: r.householdId }, each, 'watch');
    }
    const gain = each >= TRAIN_STIPEND[1] ? 2 : each >= TRAIN_STIPEND[0] ? 1 : 0;
    w.training = Math.min(WATCH_TRAINING[1], Math.max(WATCH_TRAINING[0], w.training + gain));
  }
  w.morale = watchMorale(state);

  // Between raids: mend walls, reset traps.
  if (!state.raid) {
    for (const b of state.buildings) {
      if (b.stage !== 'built' || !b.rt) continue;
      const def = content.buildingById.get(b.def);
      if (def?.defense?.trap) {
        if (b.rt.hp === 0) delete b.rt.hp;
        continue;
      }
      const max = maxHp(b);
      if (max > 0 && hpOf(b) < max) {
        const was = hpOf(b);
        b.rt.hp = Math.min(max, was + Math.ceil(max / 4));
        if (was <= 0) state.networkVersion += 1;
      }
    }
  }
  ctx.events.push({ e: 'watch.updated', w: watchView(state) });
}

export const watch: System = {
  id: 'watch',
  order: 82,
  every: TICKS_PER_DAY,
  offset: dailyOffset(5, 100),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    rosterDay(state, ctx);
  },
};
