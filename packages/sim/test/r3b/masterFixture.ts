// Shared fixture for the R3B masters tests: the hamlet's bakery as a level 2 business with a crew
// of adults, and a way to run the 23:45 masters step on its own (the other systems stay out of it:
// the step reads the crews, not the clock's other passes).
import { MASTERY } from '@qoti/content';
import { TICKS_PER_DAY } from '../../src/constants';
import type { Building, EntityId, Resident, SimEvent, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { masters } from '../../src/systems/masters';
import { dayIndex } from '../../src/systems/economy/time';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { building, hire } from '../ledger/helpers';

/** The day the fixtures start on: Summer, so nothing is out of season. */
export const START_DAY = 8;

export interface MasterWorld {
  state: WorldState;
  /** The bakery, level 2, trade 'baker', with `extra` more adults on its crew. */
  bakery: Building;
  /** Resident ids on the bakery's crew (hamlet's Hazel first). */
  crew: EntityId[];
  windmill: Building;
}

/** The hamlet with its bakery at level 2 and `extra` more adults on the crew. */
export function masterWorld(extra = 2): MasterWorld {
  const { state, b } = hamletFixture();
  state.tick = START_DAY * TICKS_PER_DAY;
  const bakery = building(state, b.bakery);
  bakery.level = 2;
  hire(state, bakery.id, extra);
  return { state, bakery, crew: [...bakery.rt!.workers], windmill: building(state, b.windmill) };
}

export function res(state: WorldState, id: EntityId): Resident {
  return findById(state.residents, id)!;
}

/** Gives a resident the rule's hearts and `days` working days in a trade. */
export function qualify(
  r: Resident,
  key: string,
  days: number = MASTERY.days,
  hearts: number = MASTERY.hearts,
): void {
  r.bond = hearts;
  r.craft = [[key, days]];
}

/** Runs the masters step at 23:45 of today and returns the events; the day then turns over. */
export function mastersDay(state: WorldState, advance = true): SimEvent[] {
  const ctx = createTickCtx(state);
  masters.tick(state, ctx);
  if (advance) state.tick += TICKS_PER_DAY;
  return ctx.events;
}

export function today(state: WorldState): number {
  return dayIndex(state.tick);
}

export function craftOf(r: Resident, key: string): number {
  return r.craft?.find(([t]) => t === key)?.[1] ?? 0;
}
