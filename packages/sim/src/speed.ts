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

/** Playtest round five: true from 22:00 to 06:00, when each turn runs NIGHT_HURRY times the ticks. */
export function isHurriedNight(tick: number): boolean {
  const hour = Math.floor(((tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY) / TICKS_PER_HOUR);
  return hour >= NIGHT_HOURS[0] || hour < NIGHT_HOURS[1];
}

/** Ticks one turn runs: the effective speed, times NIGHT_HURRY while the town sleeps. */
export function ticksThisTurn(state: WorldState): number {
  const speed = effectiveSpeed(state);
  return hurry && isHurriedNight(state.tick) ? speed * NIGHT_HURRY : speed;
}

let hurry = true;

/**
 * Tests only: runs `fn` with the night unhurried, one tick per turn per speed step, for tests that
 * count turns as ticks. Never used by the game; nothing in saved state depends on it.
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
