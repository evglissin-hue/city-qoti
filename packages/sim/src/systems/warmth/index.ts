// Warmth (C5A; docs/spec/14-challenge.md, Seasons; 11-residents.md, Needs). Daily at 07:30:
//   autumn  households put firewood by: their pantries are topped up to AUTUMN_STOCK days
//   winter  each household burns WARMTH_PER_HOUSEHOLD firewood (twice in a cold snap) from its
//           pantry, fetching what it lacks first. A household that could not burn enough is cold:
//           Household.warmth says so, its members get the `cold` mood modifier and a shiver
//           (AgentFlags.cold), and the town counts cold household-days for the winter trial and
//           Warm Hearths.
// This is the winter basket's firewood line for every tier: a Hamlet (no market yet) takes it free
// from the storehouses, a Village buys it at the till with buy() (so demand reaches the price), and
// a household on the slate (newcomers, nobody in work) takes what it cannot pay for, as at breakfast.
// A Bath House within reach (and the herbalist's health cover) softens the cold; the bath house
// takes a small fee from each household it serves (pay, category `fees`). Nobody is ever hurt
// (P3): the worst of winter is a cold, cross household that may move away.
import { content } from '@qoti/content';
import { HOURS_PER_DAY, MAP_SIZE, TICKS_PER_DAY, WARMTH_PER_HOUSEHOLD } from '../../constants';
import type { EntityId, Household, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { pay } from '../economy/money';
import { dailyOffset, dayIndex } from '../economy/time';
import { defOf, isStorage } from '../logistics/stores';
import { buy, marketOpen } from '../market/api';
import { onTheSlate } from '../market/baskets';
import { doorTile } from '../movement/api';
import { consume } from '../production/produce';
import { announceHousehold } from '../residents/records';
import { addMoodModifier, removeMoodModifier } from '../residents/api';
import { serviceCoverage } from '../services/coverage';
import { eventEffect } from '../weather/effects';
import { seasonNow } from '../seasons/api';

/** Days of firewood a household keeps by once the leaves turn. */
export const AUTUMN_STOCK = 4;
/** The cold mood modifier, softened by a Bath House in reach and by the herbalist's cover. */
export const COLD_MOOD = -15;
export const BATH_SOFTENS = 8;
export const HERBALIST_SOFTENS = 3;
/** The bath house fee per household served per day, pennies. */
export const BATH_FEE = 50;
/** Days of grace before a household that arrived this winter counts as cold for the trial. */
export const COLD_GRACE_DAYS = 1;
export const COLD_MODIFIER = 'cold';
/** 07:30 */
export const WARMTH_OFFSET = dailyOffset(7, 100);

export const warmth: System = {
  id: 'warmth',
  order: 59,
  every: TICKS_PER_DAY,
  offset: WARMTH_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const { season } = seasonNow(state);
    const baths = bathReach(state);
    if (season === 3) burnDay(state, ctx, baths);
    else if (season === 2) stockUp(state, ctx);
    bathFees(state, baths);
  },
};

function firewoodIndex(): number {
  return content.goodIndex.get('firewood') ?? -1;
}

/** Firewood a household burns today: doubled by a cold snap. */
export function firewoodToday(state: WorldState): number {
  const snap = eventEffect(state, 'cold-snap', 'warmth');
  return Math.max(1, Math.round((WARMTH_PER_HOUSEHOLD * snap) / 1000));
}

/** Takes up to `qty` firewood free from the storehouses (a Hamlet's way), in id order. */
function takeFree(state: WorldState, good: number, qty: number): number {
  let got = 0;
  for (const b of state.buildings) {
    if (got >= qty) break;
    const rt = b.rt;
    if (b.stage !== 'built' || !rt || !isStorage(defOf(b))) continue;
    const free = (rt.store[good] ?? 0) - (rt.reservedOut[good] ?? 0);
    const n = Math.min(qty - got, free);
    if (n <= 0) continue;
    rt.store[good]! -= n;
    got += n;
  }
  return got;
}

/** Brings a household's pantry firewood up to `to`: bought at the till, or free before the market. */
export function fetchFirewood(state: WorldState, h: Household, to: number): number {
  const g = firewoodIndex();
  if (g < 0) return 0;
  const want = to - (h.pantry[g] ?? 0);
  if (want <= 0) return 0;
  let got = 0;
  if (marketOpen(state)) {
    got = buy(state, h.id, g, want);
    // On the slate, as with breakfast: newcomers and households with nobody in work are not left
    // cold for want of a coin, for the days the winter is on (not to stock up in autumn).
    if (got >= want || !onTheSlate(state, h) || seasonNow(state).season !== 3) return got;
  }
  const free = takeFree(state, g, want - got);
  got += free;
  if (free > 0) h.pantry[g] = (h.pantry[g] ?? 0) + free;
  return got;
}

/** Autumn: every housed household puts firewood by for the winter. */
export function stockUp(state: WorldState, ctx: TickCtx): void {
  for (const h of state.households) {
    if (!h.homeId) continue;
    if (fetchFirewood(state, h, AUTUMN_STOCK) > 0) announceHousehold(state, ctx, h.id);
  }
}

/** Households within reach of a working Bath House (built, open and staffed). */
export function bathReach(state: WorldState): Set<EntityId> {
  const out = new Set<EntityId>();
  const baths: { x: number; z: number; r2: number }[] = [];
  for (const b of state.buildings) {
    const rt = b.rt;
    if (b.stage !== 'built' || !rt || rt.paused || rt.workers.length === 0) continue;
    const def = defOf(b);
    if (!def?.tags?.includes('bath-house')) continue;
    const r = def.coverage?.find((c) => c.kind === 'health')?.radius ?? 12;
    const door = doorTile(b, def);
    baths.push({ x: door % MAP_SIZE, z: Math.floor(door / MAP_SIZE), r2: r * r });
  }
  if (baths.length === 0) return out;
  for (const h of state.households) {
    const home = h.homeId ? findById(state.buildings, h.homeId) : undefined;
    if (!home || home.stage !== 'built') continue;
    const door = doorTile(home);
    const x = door % MAP_SIZE;
    const z = Math.floor(door / MAP_SIZE);
    for (const b of baths) {
      const dx = b.x - x;
      const dz = b.z - z;
      if (dx * dx + dz * dz <= b.r2) {
        out.add(h.id);
        break;
      }
    }
  }
  return out;
}

/** Every day, each household a Bath House serves pays its small fee to the town. */
export function bathFees(state: WorldState, baths: Set<EntityId>): void {
  for (const h of state.households) {
    if (baths.has(h.id) && h.savings >= BATH_FEE)
      pay(state, { household: h.id }, 'treasury', BATH_FEE, 'fees');
  }
}

/** The cold modifier for a household: softened by a bath house and the herbalist's cover. */
export function coldMood(bath: boolean, health: boolean): number {
  return COLD_MOOD + (bath ? BATH_SOFTENS : 0) + (health ? HERBALIST_SOFTENS : 0);
}

/** Winter: each household burns its firewood for the day; the cold are counted. */
export function burnDay(state: WorldState, ctx: TickCtx, baths: Set<EntityId> = bathReach(state)): void {
  const g = firewoodIndex();
  if (g < 0) return;
  const need = firewoodToday(state);
  const today = dayIndex(state.tick);
  const health = serviceCoverage(state, 'health').quality;
  const w = state.warmth;
  if (w.winter !== seasonNow(state).year) {
    w.winter = seasonNow(state).year;
    w.coldHouseholdDays = 0;
    w.coldHouseholds = [];
  }
  for (const h of state.households) {
    if (!h.homeId) continue;
    fetchFirewood(state, h, need);
    const burned = Math.min(need, h.pantry[g] ?? 0);
    if (burned > 0) {
      h.pantry[g]! -= burned;
      consume(state, g, burned);
    }
    const prev = h.warmth;
    const short = need - burned;
    const coldHours = short <= 0 ? 0 : burned === 0 ? HOURS_PER_DAY : HOURS_PER_DAY / 2;
    const wholeDay = burned === 0;
    h.warmth = {
      burnedToday: burned,
      coldHours,
      coldDays: (prev?.coldDays ?? 0) + (wholeDay ? 1 : 0),
    };
    const bath = baths.has(h.id);
    for (const id of h.members) {
      if (coldHours > 0) {
        addMoodModifier(state, id, {
          kind: COLD_MODIFIER,
          value: coldMood(bath, health.has(h.id)),
          ticks: 0,
        });
      } else {
        removeMoodModifier(state, id, COLD_MODIFIER);
      }
    }
    // Newcomers who arrived this winter get a day's grace before the town's count holds it.
    const graced = today - h.arrivedDay < COLD_GRACE_DAYS;
    if (coldHours > 0 && !graced) {
      w.coldHouseholdDays += 1;
      if (wholeDay && !w.coldHouseholds.includes(h.id)) {
        w.coldHouseholds.push(h.id);
        w.coldHouseholds.sort((a, b) => a - b);
      }
    }
    announceHousehold(state, ctx, h.id);
  }
}

/** Spring: the winter is over; the cold modifiers go with it. */
export function endWinter(state: WorldState): void {
  for (const h of state.households) {
    delete h.warmth;
    for (const id of h.members) removeMoodModifier(state, id, COLD_MODIFIER);
  }
}
