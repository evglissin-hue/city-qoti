import { DEFAULT_SPEED } from './constants';
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
