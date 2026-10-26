// Achievements (docs/spec/15-progression.md): conditions on the Condition DSL, checked each
// in-game hour (offset 150, after the patterns pass). An unlock credits the seats behind the
// underlying event (the seat credited with a pattern discovery, both seats for Built Together),
// or the seats connected at the time; it writes a Chronicle line and notifies both seats.
import { type AchievementDef, chroniclePhrases, type Condition, content } from '@qoti/content';
import { TICKS_PER_HOUR } from '../../constants';
import type { SeatId, System, TickCtx, WorldState } from '../../contracts';
import { evaluate } from '../../conditions';
import { isStandard } from '../../state/hamlet';
import { achievementView } from '../../view/hamlet';
import { chronicle } from '../chronicle/api';
import { creditText, fill, pick } from '../chronicle/text';

export const ACHIEVEMENTS_OFFSET = 150;

export const achievements: System = {
  id: 'achievements',
  order: 90,
  every: TICKS_PER_HOUR,
  offset: ACHIEVEMENTS_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    checkAchievements(state, ctx);
  },
};

/** Unlocks every achievement whose condition now holds. Returns the ids unlocked. */
export function checkAchievements(state: WorldState, ctx: TickCtx): string[] {
  const out: string[] = [];
  for (const def of content.achievements) {
    if (state.achievements.some((a) => a.id === def.id)) continue;
    if (!evaluate(state, def.condition)) continue;
    unlock(state, ctx, def);
    out.push(def.id);
  }
  return out;
}

function unlock(state: WorldState, ctx: TickCtx, def: AchievementDef): void {
  const seats = creditFor(state, def.condition);
  state.achievements.push({ id: def.id, tick: state.tick, seats });
  chronicle(state, ctx, 'achievement', {
    text: [
      ['achievement', def.name],
      ['description', def.description],
      ['credit', creditText(state, ctx, seats)],
    ],
    seats: [...seats],
  });
  ctx.events.push({ e: 'achievement.unlocked', a: achievementView(state, def.id) });
  ctx.events.push({
    e: 'notify',
    kind: 'achievement',
    text: fill(pick(ctx, chroniclePhrases.achievementNotice), [['achievement', def.name]]),
  });
}

function sortedUnique(seats: readonly SeatId[]): SeatId[] {
  return [...new Set(seats)].sort((a, b) => a - b);
}

/** The seats behind a condition's event, else the connected seats (else every seat). */
export function creditFor(state: WorldState, cond: Condition): SeatId[] {
  const event = eventSeats(state, cond);
  if (event && event.length > 0) return sortedUnique(event);
  if (state.time.connected.length > 0) return [...state.time.connected];
  return state.seats.map((s) => s.seat);
}

function eventSeats(state: WorldState, cond: Condition): SeatId[] | null {
  if ('all' in cond || 'any' in cond) {
    for (const c of 'all' in cond ? cond.all : cond.any) {
      const s = eventSeats(state, c);
      if (s) return s;
    }
    return null;
  }
  if (!('count' in cond)) return null;
  const h = state.hearth;
  const discoverySeats = (pattern?: string): SeatId[] | null => {
    const d = pattern ? h.discovered.find((x) => x.pattern === pattern) : h.discovered[0];
    if (!d) return null;
    if (!d.together) return [d.seat];
    const site = h.sites.find((s) => s.pattern === d.pattern && s.anchor === d.anchor);
    return site && site.seats.length >= 2 ? site.seats : [d.seat];
  };
  switch (cond.count.what) {
    case 'pattern':
      return discoverySeats(cond.count.ref);
    case 'patternsDiscovered':
      return discoverySeats();
    case 'builtTogether':
    case 'togetherSites': {
      const together = h.discovered.find((d) => d.together);
      if (together) return discoverySeats(together.pattern);
      const site = h.sites.find((s) => s.seats.length >= 2);
      return site ? site.seats : null;
    }
    default:
      return null;
  }
}
