// The first days guide (C5H; docs/build/cycle-05h-first-days.md). Hourly at offset 190 in standard
// valleys whose guide is open: when the open step's goal holds, the step is done and the next one
// opens with a guide.step event, one step an hour, so a goal met early simply ticks when its turn
// comes. The together step is skipped in a valley only one seat has ever joined. After the last
// step a Chronicle line is written and the surveyor's farewell goes out; on day 6
// (GUIDE_LAST_DAY) the guide closes quietly wherever it stands.
//
// It never pays coins or goods, never draws from an RNG stream and never takes an entity id, so a
// valley plays out exactly as it would without it (the autoplayer's numbers do not move).
import { content } from '@qoti/content';
import { GUIDE_LAST_DAY, TICKS_PER_HOUR } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { evaluate } from '../../conditions';
import { isStandard } from '../../state/hamlet';
import { guideView } from '../../view/seasons';
import { chronicle } from '../chronicle/api';
import { dayIndex } from '../economy/time';

/** The step skipped in a valley with one seat: it needs a partner to answer. */
export const TOGETHER_STEP = 'together';

export const guide: System = {
  id: 'guide',
  order: 99,
  every: TICKS_PER_HOUR,
  offset: 190,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    advanceGuide(state, ctx);
  },
};

/**
 * One check of the open step: closes the guide on day 6, else ticks the open step when its goal
 * holds (or skips the together step for a lone seat) and opens the next. Returns whether it moved.
 */
export function advanceGuide(state: WorldState, ctx: TickCtx): boolean {
  const g = state.guide;
  if (g.over) return false;
  const steps = content.guide.steps;
  if (dayIndex(state.tick) >= GUIDE_LAST_DAY || g.step >= steps.length) {
    g.over = true;
    ctx.events.push({ e: 'guide.step', g: guideView(state) });
    return true;
  }
  if (!stepDone(state, g.step)) return false;
  g.doneTicks.push(state.tick);
  g.step += 1;
  if (g.step >= steps.length) {
    g.over = true;
    farewellLine(state, ctx);
  }
  ctx.events.push({ e: 'guide.step', g: guideView(state) });
  return true;
}

/** Whether the step at `index` counts as done now (its goal holds, or it is skipped). */
export function stepDone(state: WorldState, index: number): boolean {
  const step = content.guide.steps[index];
  if (!step) return false;
  if (step.id === TOGETHER_STEP && soloValley(state)) return true;
  return evaluate(state, step.goal);
}

/** A valley only one seat has ever joined (a solo valley, or a partner who never came). */
export function soloValley(state: WorldState): boolean {
  return state.seats.length < 2;
}

/**
 * The Chronicle line for the guide's end. The variant goes by the day (no RNG draw), and the entry takes the
 * half step below the next id instead of an id of its own: unique (every entity id is whole), in
 * order among the entries (loading sorts them by id), and every id after it is what it would have
 * been without the guide.
 */
function farewellLine(state: WorldState, ctx: TickCtx): void {
  const next = state.nextId;
  const entries = state.chronicle.length;
  const events = ctx.events.length;
  chronicle(state, ctx, 'guide-done', {
    text: [['surveyor', `${content.guide.from.given} ${content.guide.from.family}`]],
    seats: [...state.time.connected],
    variant: dayIndex(state.tick),
  });
  if (state.chronicle.length !== entries + 1 || state.nextId !== next + 1) return;
  const id = next - 0.5;
  state.nextId = next;
  state.chronicle[entries]!.id = id;
  for (let i = events; i < ctx.events.length; i++) {
    const e = ctx.events[i]!;
    if (e.e === 'chronicle.added' && e.c.id === next) e.c = { ...e.c, id };
  }
}
