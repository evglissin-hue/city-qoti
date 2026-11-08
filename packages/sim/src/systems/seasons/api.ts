// Seasons, weather, warmth and trials API (C5.0 contract; C5A owns them). docs/spec/14-challenge.md,
// Seasons and Weather. Every track reads the season through these, never the calendar directly.
import { DAYS_PER_SEASON, WARMTH_PER_HOUSEHOLD } from '../../constants';
import type { TickCtx, TrialState, WeatherKind, WeatherDay, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { larderWithin, woodpile } from './stores';

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

/**
 * Days of food a town keeps in hand for the thaw (the pantries hold a day or two of the larder, and
 * the first spring breakfast comes before the gardens wake): two through autumn, while the gardens
 * still add to it, three in winter, when a newcomer only eats into it.
 */
export const THAW_DAYS = [2, 3] as const;

/**
 * Days of eating the larder must still hold for the town to see the winter through (C5A): a
 * winter's worth through autumn, the days left of it in winter (today included), each with
 * THAW_DAYS in hand; none in spring and summer, when things grow.
 */
export function winterDaysAhead(state: WorldState): number {
  const { season, day } = seasonAt(state.tick);
  if (season === 2) return DAYS_PER_SEASON + THAW_DAYS[0];
  if (season === 3) return DAYS_PER_SEASON - day + 1 + THAW_DAYS[1];
  return 0;
}

/**
 * C5A: arrivals weigh the winter. From autumn to the thaw a family of `newcomers` moves in only
 * while the larder holds `winterDaysAhead` days of eating for the town, them included, at a unit a
 * resident a day (as the season card counts it): its food, and in autumn its wheat and flour as far
 * as the bakeries can bake them by the thaw (stores.ts, `larderWithin`); in winter families go by
 * what is on the shelves, not what is still in the barn.
 */
export function larderWelcomes(state: WorldState, newcomers: number): boolean {
  const days = winterDaysAhead(state);
  if (days === 0) return true;
  const baking = seasonAt(state.tick).season === 2 ? days : 0;
  return larderWithin(state, baking) >= (state.residents.length + newcomers) * days;
}

/**
 * C5A: from autumn to the thaw, the woodpile (stores and pantries) holds less than the households
 * burn in `winterDaysAhead` days at a firewood a day. The jobs system hires the chopping sheds first
 * then, at every rank (a Village's basket says so too, a Hamlet's has no firewood line).
 */
export function woodpileShort(state: WorldState): boolean {
  const days = winterDaysAhead(state);
  return days > 0 && woodpile(state) < state.households.length * WARMTH_PER_HOUSEHOLD * days;
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
