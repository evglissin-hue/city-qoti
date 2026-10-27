// Seasons, weather, warmth and trials API (C5.0 contract; C5A owns them). docs/spec/14-challenge.md,
// Seasons and Weather. Every track reads the season through these, never the calendar directly.
import type { TickCtx, TrialState, WeatherKind, WeatherDay, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';

/** Season index (0 spring to 3 winter), year index (0 = year 1) and day of the season (1 to 6). */
export function seasonNow(state: WorldState): { season: number; year: number; day: number } {
  return seasonAt(state.tick);
}

export function weatherToday(state: WorldState): WeatherKind {
  return state.weather.today;
}

export function forecast(state: WorldState): readonly WeatherDay[] {
  return state.weather.forecast;
}

/** The river is frozen (no fishing, no water wheels, no boats; skating). */
export function isFrozen(state: WorldState): boolean {
  return state.weather.river.frozen;
}

/** A building stands under flood water right now. */
export function isFlooded(state: WorldState, buildingId: number): boolean {
  const b = state.buildings.find((x) => x.id === buildingId);
  return !!b?.rt?.flooded && b.rt.flooded > state.tick;
}

/** A household is cold right now (C5A: winter, and not enough firewood burned today). */
export function isCold(state: WorldState, householdId: number): boolean {
  const h = state.households.find((x) => x.id === householdId);
  return !!h?.warmth && h.warmth.coldHours > 0;
}

/** This winter so far: households cold now and household-days cold. */
export function warmthReport(state: WorldState): { cold: number; householdDays: number } {
  let cold = 0;
  for (const h of state.households) if (h.warmth && h.warmth.coldHours > 0) cold++;
  return { cold, householdDays: state.warmth.coldHouseholdDays };
}

/** C5A: opens a trial for a Charter. Baseline: records it as upcoming. */
export function startTrial(
  state: WorldState,
  ctx: TickCtx | null,
  trial: Omit<TrialState, 'status' | 'measured'>,
): void {
  state.trial = { ...trial, status: 'upcoming', measured: [] };
  void ctx;
}

/** The trial's outcome so far: null while none is on, else its status. */
export function trialOutcome(state: WorldState): TrialState['status'] | null {
  return state.trial?.status ?? null;
}
