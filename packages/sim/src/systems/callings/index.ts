// The callings system (R3C; docs/spec/15-progression.md, Callings), back in its old slot (88). Daily at
// 15:00: Garden Village's day visitors spend in the town (TOWN_BOOK.visitors, booked as visitors), in
// proportion to the charm at the doors of homes and the town's renown, capped. The calling itself is
// earned by the Town Book (systems/townbook) when three pages of a leaning are found; no command picks one.
// One word a week at most, with no saved counter: every noticeEveryDays-th day the notice quotes about
// that many days of today's visit.
import { callingPhrases, content } from '@qoti/content';
import { MAP_SIZE, PENNIES_PER_COIN, TICKS_PER_DAY } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { fillText } from '../../view/hamlet';
import { book } from '../economy/api';
import { dailyOffset, dayIndex } from '../economy/time';
import { renownLevel } from '../renown/api';
import { doorOf } from '../residents/places';

const T = content.townBook.visitors;

export const callings: System = {
  id: 'callings',
  order: 88,
  every: TICKS_PER_DAY,
  offset: dailyOffset(T.hour),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    if (earnsVisitors(state)) visit(state, ctx);
  },
};

function earnsVisitors(state: WorldState): boolean {
  for (const id of state.townBook.callings) if (content.callingById.get(id)?.visitors) return true;
  return false;
}

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
  if (state.households.length === 0) return 0;
  return Math.min(T.cap, doorCharm(state) * T.perCharm + renownLevel(state) * T.perRenown);
}

function visit(state: WorldState, ctx: TickCtx): void {
  const pennies = visitorPennies(state);
  if (pennies > 0) book(state, 'visitors', pennies);
  if (pennies > 0 && dayIndex(state.tick) % T.noticeEveryDays === 0) {
    const coins = Math.max(1, Math.round((pennies * T.noticeEveryDays) / PENNIES_PER_COIN));
    ctx.events.push({
      e: 'notify',
      kind: 'visitors',
      text: fillText(callingPhrases.visitors, [
        ['town', state.settings.townName],
        ['coins', `${coins} ${coins === 1 ? 'coin' : 'coins'}`],
      ]),
    });
  }
}
