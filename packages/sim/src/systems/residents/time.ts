// Clock arithmetic for the residents system. Tick 0 is 06:00 on day 0 (START_HOUR); "tick of day"
// counts from midnight. A resident's schedule clock is the tick of day shifted by Early Bird or
// Night Owl and by a few minutes of personal jitter, so the whole town never leaves the door on the
// same tick.
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';
import type { Resident } from '../../contracts';
import { traitSum } from './traits';

export const DAY = TICKS_PER_DAY;
export const HOUR = TICKS_PER_HOUR;
const OFFSET = START_HOUR * TICKS_PER_HOUR;

/** Ticks since midnight, 0 to TICKS_PER_DAY - 1. */
export function tickOfDay(tick: number): number {
  return (tick + OFFSET) % DAY;
}

/** Absolute day index (day 0 is the first day; days change at midnight). */
export function dayIndex(tick: number): number {
  return Math.floor((tick + OFFSET) / DAY);
}

/** Ticks after midnight for an hour of the day (may be fractional hours: 7.5 is 07:30). */
export function at(hour: number): number {
  return Math.round(hour * HOUR);
}

/** Personal jitter in ticks, about plus or minus twelve minutes, from the look seed. */
export function jitter(r: Resident): number {
  return ((r.look >>> 3) % 81) - 40;
}

/** A per-resident phase for outing slots, 0 to HOUR - 1. */
export function slotPhase(r: Resident): number {
  return (r.look >>> 11) % HOUR;
}

interface Offset {
  traits: string[];
  count: number;
  ticks: number;
}
/** Shift plus jitter per resident, derived from traits and look (re-derived if traits change). */
const offsets = new WeakMap<Resident, Offset>();

function scheduleOffset(r: Resident): number {
  const o = offsets.get(r);
  if (o && o.traits === r.traits && o.count === r.traits.length) return o.ticks;
  const ticks = traitSum(r, 'scheduleShift') * HOUR + jitter(r);
  offsets.set(r, { traits: r.traits, count: r.traits.length, ticks });
  return ticks;
}

/** The resident's schedule clock: tick of day minus their shift and jitter, wrapped to a day. */
export function scheduleClock(r: Resident, tick: number): number {
  return (((tickOfDay(tick) - scheduleOffset(r)) % DAY) + DAY) % DAY;
}

/** Schedule blocks (docs/spec/11-residents.md, Schedules), on the schedule clock. */
export const Block = { night: 0, morning: 1, commute: 2, day: 3, evening: 4, windDown: 5 } as const;
export type BlockId = (typeof Block)[keyof typeof Block];

const MORNING = at(6);
const COMMUTE = at(7.5);
const WORK = at(8);
const EVENING = at(17);
const WIND_DOWN = at(21);
const NIGHT = at(22);

export function blockOf(clock: number): BlockId {
  if (clock < MORNING || clock >= NIGHT) return Block.night;
  if (clock < COMMUTE) return Block.morning;
  if (clock < WORK) return Block.commute;
  if (clock < EVENING) return Block.day;
  if (clock < WIND_DOWN) return Block.evening;
  return Block.windDown;
}
