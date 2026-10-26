// The day table (docs/spec/11-residents.md, Schedules and activities), one resident at a time.
// Each resident thinks every THINK_EVERY ticks (staggered by id): the schedule clock says which
// block of the day it is, the block and the resident's role say what they want, and they walk
// there. Free time is spent in outings of about an hour, re-chosen at the resident's own slot
// boundary (phase from the look seed), so the town drifts about instead of moving in lockstep.
// Residents on a 'task' belong to C3C until it hands them back.
import { ResidentFlags, TICKS_PER_DAY } from '../../constants';
import type { Activity, Household, Resident, Rng, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { moveResident, setInside } from '../movement/api';
import { addMoodModifier } from './api';
import { assignJobs } from './jobs';
import { chooseLeisure, choosePlay, chooseStroll, chooseVisit } from './outings';
import { doorOf, householdOf, isWorkingAge } from './places';
import { loggedToday, pushHistory } from './records';
import { buyAtOutlet, needsShopping, someoneShopping, startShopping, unpack } from './shopping';
import { Block, type BlockId, HOUR, at, blockOf, dayIndex, scheduleClock, slotPhase } from './time';
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
      return 'outing';
    default:
      return 'home';
  }
}

const OUTINGS = new Set<Activity['kind']>(['leisure', 'visit', 'play', 'stroll', 'shop', 'goHome', 'home']);

export function think(state: WorldState, ctx: TickCtx, rng: Rng, r: Resident): void {
  const kind = r.activity.kind;
  if (kind === 'task' || kind === 'arrive' || kind === 'leave') return;
  const h = householdOf(state, r);
  if (!h) return;
  const homeDoor = doorOf(state, h.homeId);
  if (homeDoor < 0) return; // Homeless for the moment: the upkeep pass rehouses them.
  const t = state.tick;
  const clock = scheduleClock(r, t);
  const block = blockOf(clock);
  const turned = slotTurned(r, t);
  let goal = goalFor(state, r, block, clock);
  // After failing to get somewhere, stay home until the next slot rather than trying every think.
  if (r.flags & ResidentFlags.stuck && (goal === 'work' || goal === 'outing') && !turned) goal = 'home';
  // Shopping finishes what it started, except at night.
  if (r.activity.kind === 'shop' && goal !== 'sleep' && goal !== 'ramble') {
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
      if (OUTINGS.has(r.activity.kind) && !turned) {
        carryOn(state, ctx, rng, r, h, homeDoor);
        return;
      }
      chooseOuting(state, ctx, rng, r, h, homeDoor, block);
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
