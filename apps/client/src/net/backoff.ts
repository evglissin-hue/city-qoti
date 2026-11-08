/** Reconnect delays: 0.5 s, 1 s, 2 s, ... capped at 30 s, with jitter so two tabs do not stampede. */
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 30_000;

export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const raw = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(attempt, 16));
  return Math.round(raw * (0.75 + 0.5 * random()));
}
