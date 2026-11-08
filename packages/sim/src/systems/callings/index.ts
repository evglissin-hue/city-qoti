// Garden Village's day visitors (docs/spec/15-progression.md, Callings). Each afternoon at 15:00
// they spend in the town in proportion to its charm (the average at the doors of homes) and its
// renown, a few coins for a small village, capped. Booked as 'visitors' income, with one notice a
// week at most. The other callings have no daily system: their effects are read where they apply.
import { callingPhrases, callingTuning } from '@qoti/content';
import { MAP_SIZE, PENNIES_PER_COIN, TICKS_PER_DAY } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { book } from '../economy/api';
import { dayIndex, dailyOffset } from '../economy/time';
import { renownLevel } from '../renown/api';
import { doorOf } from '../residents/places';
import { fillText } from '../../view/hamlet';
import { chosenCalling } from './chosen';

export const callings: System = {
  id: 'callings',
  order: 88,
  every: TICKS_PER_DAY,
  offset: dailyOffset(callingTuning.visitors.hour),
  tick(state, ctx) {
    if (chosenCalling(state)?.visitors) visit(state, ctx);
  },
};

/** The average charm (0 to 100) at the door of every home, rounded down; 0 with no homes. */
export function doorCharm(state: WorldState): number {
  let sum = 0;
  let n = 0;
  for (const h of state.households) {
    const door = doorOf(state, h.homeId);
    if (door < 0 || door >= MAP_SIZE * MAP_SIZE) continue;
    sum += state.map.charm[door]!;
    n++;
  }
  return n === 0 ? 0 : Math.floor(sum / n);
}

/** Pennies the day's visitors spend: charm and renown, capped. */
export function visitorPennies(state: WorldState): number {
  const t = callingTuning.visitors;
  if (state.households.length === 0) return 0;
  return Math.min(t.cap, doorCharm(state) * t.perCharm + renownLevel(state) * t.perRenown);
}

function visit(state: WorldState, ctx: TickCtx): void {
  const calling = state.calling!;
  const pennies = visitorPennies(state);
  if (pennies > 0) {
    book(state, 'visitors', pennies);
    calling.weekPennies = (calling.weekPennies ?? 0) + pennies;
  }
  // One word a week: on the seventh day of the count, and only if anyone came.
  const t = callingTuning.visitors;
  if (dayIndex(state.tick) % t.noticeEveryDays === 0 && (calling.weekPennies ?? 0) > 0) {
    const coins = Math.max(1, Math.round(calling.weekPennies! / PENNIES_PER_COIN));
    ctx.events.push({
      e: 'notify',
      kind: 'visitors',
      text: fillText(callingPhrases.visitors, [
        ['town', state.settings.townName],
        ['coins', `${coins} ${coins === 1 ? 'coin' : 'coins'}`],
      ]),
    });
    calling.weekPennies = 0;
  }
}
