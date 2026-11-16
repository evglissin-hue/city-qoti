// The day table (docs/spec/11-residents.md, Schedules and activities), one resident at a time.
// Each resident thinks every THINK_EVERY ticks (staggered by id): the schedule clock says which
// block of the day it is, the block and the resident's role say what they want, and they walk
// there. Free time is spent in outings of about an hour, re-chosen at the resident's own slot
// boundary (phase from the look seed), so the town drifts about instead of moving in lockstep.
// Residents on a 'task' belong to C3C until it hands them back.
import { content } from '@qoti/content';
import { BUILD_HOURS, ResidentFlags, RoundFlags, TICKS_PER_DAY } from '../../constants';
import type { Activity, Household, Resident, Rng, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { hourOf } from '../economy/time';
import { atFestival } from '../festivals/override';
import { moveResident, setInside } from '../movement/api';
import { STOP_TICKS, stopNow } from '../places/occupancy';
import { addMoodModifier } from './api';
import { assignJobs } from './jobs';
import { chooseLeisure, choosePlay, chooseStroll, chooseVisit } from './outings';
import { scheduleOverride, scheduleOverrideExcept } from './overrides';
import { doorOf, householdOf, isWorkingAge } from './places';
import { loggedToday, pushHistory } from './records';
import {
  arriveAt,
  arriveAtShop,
  currentStop,
  homeTick,
  hostInside,
  makePlan,
  noteFestival,
  planIfDue,
  planned,
  planTick,
  type RoundWindow,
  roundWindow,
  visitHome,
} from './round';
import { buyAtOutlet, needsShopping, someoneShopping, startShopping, unpack } from './shopping';
import {
  Block,
  type BlockId,
  HOUR,
  at,
  blockOf,
  dayIndex,
  scheduleClock,
  slotPhase,
  tickOfDay,
} from './time';
import { hasTrait, traitPercent } from './traits';

export const THINK_EVERY = 10;
/** A resident who cannot get home finds their way in after this long. */
export const STUCK_TICKS = HOUR;

type Goal = 'sleep' | 'home' | 'work' | 'outing' | 'ramble';

/** True when the tick crosses one of the resident's own outing slot boundaries. */
export function slotTurned(r: Resident, tick: number): boolean {
  const p = slotPhase(r);
  return Math.floor((tick + p) / HOUR) !== Math.floor((tick - THINK_EVERY + p) / HOUR);
}

/** Hedgehogs, and only on some nights, take a ramble round the hedges after dark. */
function rambles(r: Resident, clock: number, tick: number): boolean {
  if (r.species !== 'hedgehog' || r.stage === 'child' || hasTrait(r, 'early-bird')) return false;
  if (clock < at(22) || clock >= at(23.5)) return false;
  return (r.look + dayIndex(tick)) % 3 !== 0;
}

function hasWork(state: WorldState, r: Resident): boolean {
  return r.jobId !== 0 && isWorkingAge(r) && doorOf(state, r.jobId) >= 0;
}

const LONG_DAY_END = at(BUILD_HOURS[1]);

/** Playtest round five: builders and porters stay on into the evening (BUILD_HOURS). */
function keepsLongHours(state: WorldState, r: Resident): boolean {
  const job = findById(state.buildings, r.jobId);
  const role = job ? content.buildingById.get(job.def)?.jobs?.role : undefined;
  return role === 'builder' || role === 'porter';
}

/** What the resident wants in this block of their day. */
export function goalFor(state: WorldState, r: Resident, block: BlockId, clock: number): Goal {
  switch (block) {
    case Block.night:
      return rambles(r, clock, state.tick) ? 'ramble' : 'sleep';
    case Block.morning:
      return 'home';
    case Block.commute:
      if (hasWork(state, r)) return 'work';
      return 'outing';
    case Block.day:
      return hasWork(state, r) ? 'work' : 'outing';
    case Block.evening:
      return hasWork(state, r) && clock < LONG_DAY_END && keepsLongHours(state, r) ? 'work' : 'outing';
    default:
      return 'home';
  }
}

const OUTINGS = new Set<Activity['kind']>(['leisure', 'visit', 'play', 'stroll', 'shop', 'goHome', 'home']);

/** Overrides the round weighs for itself (round.ts: the rain-shy plan shelter; the ice is a place). */
const ROUND_SKIPS: readonly string[] = ['rain', 'skating'];

export function think(state: WorldState, ctx: TickCtx, rng: Rng, r: Resident): void {
  const kind = r.activity.kind;
  if (kind === 'task' || kind === 'arrive' || kind === 'leave') return;
  const h = householdOf(state, r);
  if (!h) return;
  const homeDoor = doorOf(state, h.homeId);
  if (homeDoor < 0) return; // Homeless for the moment: the upkeep pass rehouses them.
  const t = state.tick;
  // I3 (C5.0): the festival evening, the bell, Watch duty, storms and skating come first. R2 (R2A):
  // on the round, rain and the ice are the plan's to weigh.
  const window = roundWindow(state, r, hasWork(state, r));
  if (window === 'evening')
    planIfDue(state, ctx, r, h, homeDoor, hasWork(state, r) && keepsLongHours(state, r));
  const o = window
    ? scheduleOverrideExcept(state, r, hourOf(t), ROUND_SKIPS)
    : scheduleOverride(state, r, hourOf(t));
  if (o && followOverride(state, ctx, r, h, homeDoor, o)) return;
  const clock = scheduleClock(r, t);
  const block = blockOf(clock);
  const turned = slotTurned(r, t);
  let goal = goalFor(state, r, block, clock);
  // After failing to get somewhere, stay home until the next slot rather than trying every think.
  if (r.flags & ResidentFlags.stuck && (goal === 'work' || goal === 'outing') && !turned) goal = 'home';
  // Shopping finishes what it started, except at night.
  if (r.activity.kind === 'shop' && goal !== 'sleep' && goal !== 'ramble') {
    arriveAtShop(state, r);
    shop(state, ctx, r, h, homeDoor);
    return;
  }
  switch (goal) {
    case 'sleep':
    case 'home':
      stayHome(state, ctx, r, h, homeDoor, goal === 'sleep' ? 'sleep' : 'home');
      return;
    case 'work':
      goToWork(state, ctx, r, h, homeDoor);
      return;
    case 'ramble':
      if (r.activity.kind === 'stroll' && !turned) return;
      if (rng.chance(0.35)) {
        stayHome(state, ctx, r, h, homeDoor, 'sleep');
        return;
      }
      stroll(state, ctx, rng, r, h, homeDoor, homeDoor, 5);
      return;
    case 'outing':
      if (window && followRound(state, ctx, r, h, homeDoor, window, true)) return;
      if (OUTINGS.has(r.activity.kind) && !turned) {
        carryOn(state, ctx, rng, r, h, homeDoor);
        return;
      }
      chooseOuting(state, ctx, rng, r, h, homeDoor, block);
  }
}

/**
 * Acts on an override's activity: home and sleep go home, work goes in at `at`, leisure walks to
 * `tile` and stays there. Returns false for kinds it does not act on (the day table carries on).
 */
function followOverride(
  state: WorldState,
  ctx: TickCtx,
  r: Resident,
  h: Household,
  homeDoor: number,
  o: Activity,
): boolean {
  switch (o.kind) {
    case 'home':
    case 'sleep':
      stayHome(state, ctx, r, h, homeDoor, o.kind);
      return true;
    case 'work': {
      if (r.inside === o.at) {
        if (r.activity.kind !== 'work' || r.activity.at !== o.at) r.activity = { kind: 'work', at: o.at };
        return true;
      }
      const door = doorOf(state, o.at);
      if (door < 0) return false;
      if (r.move && r.move.target === door) return true;
      if (!r.move && r.tile === door) {
        r.move = null;
        setInside(state, r, o.at);
        r.activity = { kind: 'work', at: o.at };
        return true;
      }
      if (moveResident(state, r, door, 'schedule') === 'unreachable') return false;
      r.activity = { kind: 'commute', to: o.at };
      return true;
    }
    case 'leisure':
      if (r.activity.kind === 'leisure' && r.activity.tile === o.tile) {
        // R2 (R2A): a festival guest on the site has the festival on their round.
        if (!r.move && r.tile === o.tile && state.festival.live && atFestival(state, r))
          noteFestival(state, r);
        return true;
      }
      return setOff(state, ctx, r, h, homeDoor, o.tile, o);
    default:
      return false;
  }
}

/** Home, and in: walks there first if needed. */
function stayHome(
  state: WorldState,
  ctx: TickCtx,
  r: Resident,
  h: Household,
  homeDoor: number,
  kind: 'home' | 'sleep',
): void {
  if (r.inside === h.homeId) {
    if (r.activity.kind !== kind) r.activity = { kind };
    return;
  }
  if (r.move && r.move.target === homeDoor) return;
  if (!r.move && r.tile === homeDoor) {
    enterHome(state, ctx, r, h, kind);
    return;
  }
  const res = moveResident(state, r, homeDoor, 'schedule');
  if (res === 'walking') {
    r.activity = { kind: 'goHome' };
  } else if (res === 'arrived') {
    enterHome(state, ctx, r, h, kind);
  } else {
    lost(state, r, h, homeDoor);
  }
}

function enterHome(state: WorldState, ctx: TickCtx, r: Resident, h: Household, kind: 'home' | 'sleep'): void {
  if (r.carry) unpack(state, ctx, r, h);
  r.move = null;
  setInside(state, r, h.homeId);
  r.activity = { kind };
  r.flags &= ~ResidentFlags.stuck;
}

/** No way home: stand about looking lost for a while, then find the way in regardless. */
function lost(state: WorldState, r: Resident, h: Household, homeDoor: number): void {
  const t = state.tick;
  if (r.activity.kind !== 'stuck') {
    r.activity = { kind: 'stuck', since: t };
    markStuck(state, r);
    return;
  }
  if (t - r.activity.since >= STUCK_TICKS) {
    r.move = null;
    r.tile = homeDoor;
    setInside(state, r, h.homeId);
    r.activity = { kind: 'home' };
    r.flags &= ~ResidentFlags.stuck;
  }
}

function markStuck(state: WorldState, r: Resident): void {
  r.flags |= ResidentFlags.stuck;
  if (!loggedToday(state, r, 'stuck')) {
    pushHistory(state, r, 'stuck');
    addMoodModifier(state, r.id, { kind: 'lost', value: -5, ticks: TICKS_PER_DAY });
  }
}

/** Sets off for somewhere; on failure marks them stuck and heads home. */
function setOff(
  state: WorldState,
  ctx: TickCtx,
  r: Resident,
  h: Household,
  homeDoor: number,
  target: number,
  activity: Activity,
): boolean {
  const res = moveResident(state, r, target, activity.kind === 'shop' ? 'shop' : 'leisure');
  if (res === 'unreachable') {
    markStuck(state, r);
    stayHome(state, ctx, r, h, homeDoor, 'home');
    return false;
  }
  r.activity = activity;
  r.flags &= ~ResidentFlags.stuck;
  return true;
}

function goToWork(state: WorldState, ctx: TickCtx, r: Resident, h: Household, homeDoor: number): void {
  const job = r.jobId;
  const door = doorOf(state, job);
  if (r.inside === job) {
    if (r.activity.kind !== 'work') r.activity = { kind: 'work', at: job };
    return;
  }
  if (r.move && r.move.target === door) return;
  if (!r.move && r.tile === door) {
    if (r.carry) {
      // Groceries go home first.
      stayHome(state, ctx, r, h, homeDoor, 'home');
      return;
    }
    setInside(state, r, job);
    r.activity = { kind: 'work', at: job };
    return;
  }
  const res = moveResident(state, r, door, 'schedule');
  if (res === 'walking') {
    r.activity = { kind: 'commute', to: job };
  } else if (res === 'arrived') {
    setInside(state, r, job);
    r.activity = { kind: 'work', at: job };
  } else {
    markStuck(state, r);
    stayHome(state, ctx, r, h, homeDoor, 'home');
  }
}

/** Continues the current outing: arrivals at a friend's door go in; children scamper about. */
function carryOn(
  state: WorldState,
  ctx: TickCtx,
  rng: Rng,
  r: Resident,
  h: Household,
  homeDoor: number,
): void {
  const a = r.activity;
  if (r.move) return;
  switch (a.kind) {
    case 'goHome':
    case 'home':
      if (r.inside !== h.homeId) stayHome(state, ctx, r, h, homeDoor, 'home');
      return;
    case 'visit': {
      const friend = findById(state.residents, a.friend);
      const home = friend ? (householdOf(state, friend)?.homeId ?? 0) : 0;
      if (!home) {
        stayHome(state, ctx, r, h, homeDoor, 'home');
        return;
      }
      if (r.inside !== home && r.tile === doorOf(state, home)) setInside(state, r, home);
      return;
    }
    case 'play':
      if (rng.chance(0.3)) {
        const tile = choosePlay(state, rng, r);
        if (tile !== r.tile) setOff(state, ctx, r, h, homeDoor, tile, { kind: 'play', tile });
      }
      return;
    default:
      return;
  }
}

function stroll(
  state: WorldState,
  ctx: TickCtx,
  rng: Rng,
  r: Resident,
  h: Household,
  homeDoor: number,
  around: number,
  far: number,
): void {
  const tile = chooseStroll(state, rng, around, far);
  if (tile < 0) {
    stayHome(state, ctx, r, h, homeDoor, 'home');
    return;
  }
  setOff(state, ctx, r, h, homeDoor, tile, { kind: 'stroll', tile });
}

/** Picks what to do with the next hour of free time. */
function chooseOuting(
  state: WorldState,
  ctx: TickCtx,
  rng: Rng,
  r: Resident,
  h: Household,
  homeDoor: number,
  block: BlockId,
): void {
  if (r.carry) {
    stayHome(state, ctx, r, h, homeDoor, 'home');
    return;
  }
  if (r.stage === 'child') {
    if (rng.chance(block === Block.evening ? 0.55 : 0.7)) {
      const tile = choosePlay(state, rng, r);
      setOff(state, ctx, r, h, homeDoor, tile, { kind: 'play', tile });
    } else {
      stayHome(state, ctx, r, h, homeDoor, 'home');
    }
    return;
  }
  if (needsShopping(h) && !someoneShopping(state, h) && startShopping(state, r, h)) return;
  // Weights: home, leisure, visit, stroll. Elders stay in a little more; Homebodies a lot more.
  const evening = block === Block.evening;
  let home = r.stage === 'elder' ? 40 : 28;
  const homeTime = traitPercent(r, 'homeTime');
  if (homeTime < 100) home = 100 - homeTime + home * 0.5;
  const leisure = 36;
  const [friend, friendDoor] = chooseVisit(state, r);
  const visit = friend ? 16 : 0;
  const strollW = evening ? 22 : 14;
  const roll = rng.float() * (home + leisure + visit + strollW);
  if (roll < home) {
    stayHome(state, ctx, r, h, homeDoor, 'home');
    return;
  }
  if (roll < home + leisure) {
    const spot = chooseLeisure(state, rng, r, evening);
    if (spot) {
      setOff(state, ctx, r, h, homeDoor, spot.stand, { kind: 'leisure', tile: spot.feature });
      return;
    }
  } else if (roll < home + leisure + visit && friend) {
    setOff(state, ctx, r, h, homeDoor, friendDoor, { kind: 'visit', friend });
    return;
  }
  stroll(state, ctx, rng, r, h, homeDoor, homeDoor, evening ? 9 : 7);
}

/**
 * R2 (R2A): the round (docs/spec/19-evenings.md, The round). Plans at the resident's own minute, then
 * walks to each stop the pleasant way, takes a seat or standing room (round.ts arriveAt), stays an
 * hour, and goes on to the next or home. Returns false to leave the resident to the day table (an
 * afternoon before its round is planned, or after it is over).
 */
function followRound(
  state: WorldState,
  ctx: TickCtx,
  r: Resident,
  h: Household,
  homeDoor: number,
  window: RoundWindow,
  again: boolean,
): boolean {
  if (r.carry) {
    stayHome(state, ctx, r, h, homeDoor, 'home');
    return true;
  }
  const tod = tickOfDay(state.tick);
  if (!planned(state, r, window)) {
    const late = window === 'evening' && hasWork(state, r) && keepsLongHours(state, r);
    if (tod < planTick(r, window, late)) {
      if (window === 'afternoon') return false;
      // Their minute has not come: they finish an afternoon stop, or wait at home.
      if (stopNow(state, r)) return true;
      stayHome(state, ctx, r, h, homeDoor, 'home');
      return true;
    }
    makePlan(state, ctx, r, h, homeDoor, window);
  }
  const round = r.round!;
  const k = currentStop(state, r, window);
  if (k < 0) {
    if (window === 'afternoon') return false;
    stayHome(state, ctx, r, h, homeDoor, 'home');
    return true;
  }
  const s = round[k]!;
  if (s.arrived >= 0) return true;
  // Too late to make a stop worth the walk: home (or the rest of the afternoon as built).
  const end = window === 'evening' ? homeTick(state) : content.places.eveningHour * HOUR;
  if (tod > end - (STOP_TICKS >> 1)) {
    if (window === 'afternoon') return false;
    stayHome(state, ctx, r, h, homeDoor, 'home');
    return true;
  }
  if (s.kind === 'shop') {
    if (needsShopping(h) && !someoneShopping(state, h) && startShopping(state, r, h)) {
      if (r.activity.kind === 'shop') {
        s.place = `shop:${r.activity.outlet}`;
        s.tile = doorOf(state, r.activity.outlet);
      }
      return true;
    }
    // Nothing to fetch after all, or nowhere to fetch it from: on to the next stop.
    round.splice(k, 1);
    return again ? followRound(state, ctx, r, h, homeDoor, window, false) : true;
  }
  if (r.move && r.move.target === s.tile) return true;
  const res =
    r.tile === s.tile && !r.move
      ? 'arrived'
      : moveResident(state, r, s.tile, window === 'evening' ? 'round' : 'leisure');
  if (res === 'walking') {
    r.activity = visitActivity(state, r, s) ?? { kind: 'leisure', tile: s.tile };
    r.flags &= ~ResidentFlags.stuck;
    return true;
  }
  if (res === 'unreachable') {
    s.flags |= RoundFlags.turnedAway;
    return true;
  }
  if (!arriveAt(state, r, k, window)) return true;
  r.move = null;
  r.flags &= ~ResidentFlags.stuck;
  const home = visitHome(state, s);
  if (home) {
    setInside(state, r, home);
    r.activity = visitActivity(state, r, s) ?? { kind: 'home' };
    return true;
  }
  const inside = hostInside(state, s);
  if (inside && inside !== r.jobId) setInside(state, r, inside);
  r.activity = { kind: 'leisure', tile: s.tile };
  return true;
}

/** The activity for a visit stop: visiting a friend of theirs in that household (or its first member). */
function visitActivity(state: WorldState, r: Resident, s: { kind: string; place: string }): Activity | null {
  if (s.kind !== 'visit') return null;
  const fh = findById(state.households, Number(s.place.slice(5)));
  if (!fh || fh.members.length === 0) return null;
  const friend = fh.members.find((id) => r.friends.some((f) => f.id === id)) ?? fh.members[0]!;
  return { kind: 'visit', friend };
}

function shop(state: WorldState, ctx: TickCtx, r: Resident, h: Household, homeDoor: number): void {
  const a = r.activity;
  if (a.kind !== 'shop' || r.move) return;
  const outletDoor = doorOf(state, a.outlet);
  if (a.carrying === 0 && outletDoor >= 0 && r.tile === outletDoor) {
    buyAtOutlet(state, r, h);
    if (!r.move) stayHome(state, ctx, r, h, homeDoor, 'home');
    return;
  }
  if (r.tile === homeDoor) {
    const again = unpack(state, ctx, r, h);
    const evening = blockOf(scheduleClock(r, state.tick)) !== Block.windDown;
    if (again && evening && startShopping(state, r, h)) return;
    enterHome(state, ctx, r, h, 'home');
    return;
  }
  // Somewhere in between (a replanned walk ended early): head for whichever end makes sense.
  const target = a.carrying > 0 || outletDoor < 0 ? homeDoor : outletDoor;
  if (moveResident(state, r, target, 'shop') === 'unreachable') {
    markStuck(state, r);
    stayHome(state, ctx, r, h, homeDoor, 'home');
  }
}

/** A newcomer walking in from the gate: on reaching their door they move in and look for work. */
export function thinkArrival(state: WorldState, ctx: TickCtx, r: Resident): void {
  if (r.move) return;
  const h = householdOf(state, r);
  const door = h ? doorOf(state, h.homeId) : -1;
  if (!h || door < 0) return;
  if (r.tile !== door && moveResident(state, r, door, 'arrive') === 'walking') return;
  // At the door, or there is no way in from the gate: either way, they find their way home.
  r.tile = door;
  setInside(state, r, h.homeId);
  r.activity = { kind: 'home' };
  pushHistory(state, r, 'moved-in', h.homeId);
  assignJobs(state, ctx, r);
}
