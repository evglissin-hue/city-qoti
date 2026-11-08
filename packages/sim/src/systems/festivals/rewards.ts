// What a festival gives (C5B; docs/spec/12-hearth.md, Festivals, Rewards). By stars, from content:
// town mood for two days, a bond heart for each guest (once a season), renown, the Watch's morale
// (festivalMorale reads the history), a Chronicle entry marked for a snapshot, unlocks the first
// time the town reaches 3, 4 and 5 stars, and Five Stars through state.seasons.bestStars. A poor
// festival only yields less; nothing is ever taken away.
import { content } from '@qoti/content';
import { FESTIVAL_HISTORY_MAX, TICKS_PER_DAY } from '../../constants';
import type { EntityId, FestivalOutcome, FestivalPlan, Rect, TickCtx, WorldState } from '../../contracts';
import { chosenCalling } from '../callings/chosen';
import { chronicle } from '../chronicle/api';
import { addRenown } from '../renown/api';
import { addBond, addMoodModifier } from '../residents/api';
import { festivalTuningNow } from './api';
import { rectCenter } from './site';

export function grantFestival(
  state: WorldState,
  ctx: TickCtx,
  plan: FestivalPlan,
  rect: Rect,
  outcome: FestivalOutcome,
  guests: readonly EntityId[],
): void {
  const t = festivalTuningNow();
  const stars = outcome.stars;
  const mood = t.mood[stars] ?? 0;
  if (mood > 0) {
    for (const id of guests) {
      addMoodModifier(state, id, { kind: 'festival', value: mood, ticks: t.moodDays * TICKS_PER_DAY });
    }
  }
  // One bond heart a guest: there is one festival a season, so this is the season's cap.
  for (const id of guests) addBond(state, id, 1, 'other');
  addRenown(state, ctx, t.renown[stars] ?? 0, 'festival');
  // P1: Pilgrims' Rest earns one more renown from a festival of 2 stars or better.
  const pilgrims = chosenCalling(state)?.festival;
  if (pilgrims && stars >= pilgrims.minStars) addRenown(state, ctx, pilgrims.renown, 'calling');

  const before = state.seasons.bestStars;
  for (const [at, ids] of t.unlocks) {
    if (before >= at || stars < at) continue;
    for (const id of ids) if (!state.hearth.unlocked.includes(id)) state.hearth.unlocked.push(id);
  }
  state.seasons.bestStars = Math.max(before, stars);

  const f = state.festival;
  f.outcome = outcome;
  f.history.push({ season: plan.season, year: plan.year, festival: plan.festival, stars, twist: plan.twist });
  if (f.history.length > FESTIVAL_HISTORY_MAX) f.history.splice(0, f.history.length - FESTIVAL_HISTORY_MAX);

  const [cx, cz] = rectCenter(rect);
  const pattern =
    plan.site && 'pattern' in plan.site ? content.patternById.get(plan.site.pattern) : undefined;
  const place = pattern ? `the ${pattern.name.toLowerCase()}` : 'the festival ground';
  chronicle(state, ctx, 'festival', {
    text: [
      ['festival', content.festivalById.get(plan.festival)?.name ?? 'festival'],
      ['stars', String(stars)],
      ['guests', `${outcome.attendance} ${outcome.attendance === 1 ? 'resident' : 'residents'}`],
      ['place', place],
    ],
    seats: [...state.time.connected],
    snapshot: { focus: [cx, cz], radius: Math.max(6, (rect[2] - rect[0] + 1) >> 1) + 2 },
  });
}
