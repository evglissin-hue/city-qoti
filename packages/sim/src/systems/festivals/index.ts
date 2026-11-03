// Festivals (C5B; docs/spec/12-hearth.md, Festivals). Two passes:
// - `festivals` (75, 04:00 daily): the morning after a festival (day 1 of the next season) its
//   temporary pieces are taken down unless kept, and a stale plan from an earlier season is put
//   away (anything still put by goes back to the storehouses).
// - `festivalEvening` (77, hourly on the hour): on the festival day (day 6) the menu is put by at
//   noon (with the Generous residents' gifts), the guests set off at 18:00 (the schedule override in
//   ./override.ts walks them to the site), the closing dance comes at 21:00 when both seats are
//   here, and at 22:00 the festival is scored and rewarded and everyone goes home. Every evening it
//   also looks for the other together moments (fireworks, the stroll). An unplanned day 6 is a
//   quiet evening and costs nothing. The same pass carries C5B's other hourly beats: market day's
//   fees and charm (./levers.ts) and a resident opening a shop (systems/residents/shops.ts).
import { content } from '@qoti/content';
import { FESTIVAL, MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR, TILE_FP } from '../../constants';
import type { Rect, System, TickCtx, WorldState } from '../../contracts';
import { removeById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { worldIndex } from '../../state/worldIndex';
import { festivalResultView, festivalView } from '../../view/seasons';
import { emitMoney } from '../economy/emit';
import { dailyOffset, hourOf } from '../economy/time';
import { markCharmDirty, markCharmSoon } from '../hearth/charm/dirty';
import { seasonNow, weatherToday } from '../seasons/api';
import {
  chooseGuests,
  currentPlan,
  festivalTuningNow,
  generousDonations,
  inReach,
  isFestivalDay,
  RESERVE_HOUR,
  reserveMenu,
  returnReserved,
} from './api';
import { shopsHour } from '../residents/shops';
import { rankAtLeast } from '../../state/village';
import { isMarketDay, marketFees, recharm } from './levers';
import { grantFestival } from './rewards';
import { scoreFestival } from './score';
import { rectCenter, siteRect } from './site';
import { celebrationDue, togetherMoment } from './together';

/** The hour of the closing dance and the fireworks. */
export const DANCE_HOUR = 21;
/** The evening stroll: day and hour. */
export const STROLL = { day: 3, hour: 20 } as const;

/** Takes down a festival piece (as decor.remove does). */
function takeDown(state: WorldState, ctx: TickCtx, id: number): void {
  const d = removeById(state.decor, id);
  if (!d) return;
  worldIndex(state).decorGrid.remove(d);
  ctx.events.push({ e: 'decor.removed', id });
  const x = Math.floor(d.fx / TILE_FP);
  const z = Math.floor(d.fz / TILE_FP);
  if (content.decorById.get(d.def)?.blocksWalking) state.networkVersion += 1;
  markCharmDirty(state, [x - 1, z - 1, x + 1, z + 1]);
  markCharmSoon(state);
}

/** The 04:00 tidy. */
export function tidyFestival(state: WorldState, ctx: TickCtx): void {
  const f = state.festival;
  // Pieces removed by hand or kept leave the list.
  f.pieces = f.pieces.filter((id) => state.decor.some((d) => d.id === id && d.festival && !d.festival.kept));
  const stale = f.plan !== null && currentPlan(state) === null;
  if (seasonNow(state).day !== 1 && !stale) return;
  let changed = false;
  if (f.pieces.length > 0) {
    for (const id of f.pieces) takeDown(state, ctx, id);
    f.pieces = [];
    changed = true;
  }
  if (stale) {
    const p = f.plan!;
    const rect = siteRect(state, p.site);
    const [cx, cz] = rect ? rectCenter(rect) : [MAP_SIZE >> 1, MAP_SIZE >> 1];
    returnReserved(state, p.reserved, cz * MAP_SIZE + cx);
    f.plan = null;
    changed = true;
  }
  if (f.live) {
    f.live = false;
    delete f.guests;
  }
  if (changed) ctx.events.push({ e: 'festival.updated', f: festivalView(state) });
}

export const festivals: System = {
  id: 'festivals',
  order: 75,
  every: TICKS_PER_DAY,
  offset: dailyOffset(4),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    tidyFestival(state, ctx);
  },
};

/** 18:00: the guests set off. */
export function startFestival(state: WorldState, ctx: TickCtx): boolean {
  const f = state.festival;
  const p = currentPlan(state);
  const rect = p ? siteRect(state, p.site) : null;
  if (!p || !rect || f.live) return false;
  f.live = true;
  f.outcome = null;
  f.guests = chooseGuests(state, rect);
  ctx.events.push({ e: 'festival.started', f: festivalView(state) });
  return true;
}

/** 22:00: scored, eaten, rewarded; everyone goes home. */
export function endFestival(state: WorldState, ctx: TickCtx): boolean {
  const f = state.festival;
  const p = currentPlan(state);
  if (!f.live || !p) {
    f.live = false;
    delete f.guests;
    return false;
  }
  const rect: Rect | null = siteRect(state, p.site);
  const guests = f.guests ?? [];
  f.live = false;
  delete f.guests;
  if (!rect) return false;
  const outcome = scoreFestival(state, p, rect, guests.length, inReach(state, rect).length);
  // The table is cleared: guests eat up to their share each, and what is left goes back to store.
  let appetite = guests.length * festivalTuningNow().perGuest;
  const left: [number, number][] = [];
  let eaten = 0;
  for (const line of p.reserved) {
    const n = Math.min(line[1], appetite);
    appetite -= n;
    eaten += n;
    state.economy.today.consumed[line[0]]! += n;
    if (line[1] > n) left.push([line[0], line[1] - n]);
  }
  outcome.eaten = eaten;
  const [cx, cz] = rectCenter(rect);
  returnReserved(state, left, cz * MAP_SIZE + cx);
  p.reserved = [];
  grantFestival(state, ctx, p, rect, outcome, guests);
  const r = festivalResultView(state);
  if (r) ctx.events.push({ e: 'festival.ended', r });
  ctx.events.push({ e: 'festival.updated', f: festivalView(state) });
  return true;
}

/** One hour of the festival evening pass. */
export function festivalHour(state: WorldState, ctx: TickCtx): void {
  const hour = hourOf(state.tick);
  if (isFestivalDay(state)) {
    if (hour === RESERVE_HOUR && currentPlan(state)) {
      generousDonations(state);
      reserveMenu(state, ctx);
    } else if (hour === FESTIVAL.from) {
      startFestival(state, ctx);
    } else if (hour === DANCE_HOUR && state.festival.live) {
      togetherMoment(state, ctx, 'dance');
    } else if (hour === FESTIVAL.to) {
      endFestival(state, ctx);
    }
  }
  if (hour === DANCE_HOUR && celebrationDue(state)) togetherMoment(state, ctx, 'fireworks');
  // Opening a shop (systems/residents/shops.ts), once a season at 10:00.
  if (rankAtLeast(state, 'village')) shopsHour(state, ctx, hour);
  // Market day: the outlets' charm comes and goes at midnight, and the stall fees at 18:00.
  if (state.levers.marketDay) {
    if (hour === 0) recharm(state);
    if (hour === FESTIVAL.from && isMarketDay(state) && marketFees(state) > 0) emitMoney(state, ctx);
  }
  if (hour === STROLL.hour && seasonNow(state).day === STROLL.day) {
    const w = weatherToday(state);
    if (w === 'clear' || w === 'cloudy') togetherMoment(state, ctx, 'stroll');
  }
}

export const festivalEvening: System = {
  id: 'festivalEvening',
  order: 77,
  every: TICKS_PER_HOUR,
  offset: 0,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    festivalHour(state, ctx);
  },
};
