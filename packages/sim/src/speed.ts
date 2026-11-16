import { content } from '@qoti/content';
import {
  DEFAULT_SPEED,
  NIGHT_HOURS,
  NIGHT_HURRY,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from './constants';
import type { Speed, WorldState } from './contracts';

/**
 * Minimum desired speed over connected seats, so either seat can pause and fast-forward needs
 * both. 0 when nobody is connected, or when a together-only valley has fewer than 2 seats.
 */
export function effectiveSpeed(state: WorldState): Speed {
  const connected = state.time.connected;
  if (connected.length === 0) return 0;
  if (state.settings.togetherOnly && connected.length < 2) return 0;
  let speed = 3;
  for (const seat of connected) speed = Math.min(speed, state.time.desired[seat] ?? DEFAULT_SPEED);
  return speed as Speed;
}

/** The hour of the day (0 to 23) at a tick. */
function hourAt(tick: number): number {
  return Math.floor(((tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY) / TICKS_PER_HOUR);
}

/** Playtest round five: true from 22:00 to 06:00, when each turn runs NIGHT_HURRY times the ticks. */
export function isHurriedNight(tick: number): boolean {
  const hour = hourAt(tick);
  return hour >= NIGHT_HOURS[0] || hour < NIGHT_HOURS[1];
}

/**
 * R2 (R2B): true from `PLACES.eveningHour` to `homeHour` (17:00 to 21:00) when the valley lets the
 * evening linger (`settings.eveningLingers`, absent means on): docs/spec/19-evenings.md, The day in
 * two acts. Read from the tick and the settings alone, so a save mid-evening resumes the same.
 */
export function isLingeringDusk(state: WorldState): boolean {
  if (state.settings.eveningLingers === false) return false;
  const hour = hourAt(state.tick);
  return hour >= content.places.eveningHour && hour < content.places.homeHour;
}

/**
 * Ticks one turn runs: the effective speed, times NIGHT_HURRY while the town sleeps. R2 (R2B): while
 * dusk lingers a turn runs `PLACES.lingerPercent` of the speed's ticks, rounded down on odd turns
 * and up on even ones (`state.lastTurn` is the turn being applied), so at 1x the evening runs a tick
 * every other turn. It depends on turns and ticks only, never on the wall clock.
 */
export function ticksThisTurn(state: WorldState): number {
  const speed = effectiveSpeed(state);
  if (!hurry) return speed;
  if (isHurriedNight(state.tick)) return speed * NIGHT_HURRY;
  if (isLingeringDusk(state)) {
    const hundredths = speed * content.places.lingerPercent;
    return state.lastTurn % 2 === 1 ? Math.floor(hundredths / 100) : Math.ceil(hundredths / 100);
  }
  return speed;
}

let hurry = true;

/**
 * Tests only: runs `fn` with the night unhurried and dusk unlingering, one tick per turn per speed
 * step, for tests that count turns as ticks. Never used by the game; nothing in saved state depends
 * on it.
 */
export function withoutNightHurry<T>(fn: () => T): T {
  const before = hurry;
  hurry = false;
  try {
    return fn();
  } finally {
    hurry = before;
  }
}
