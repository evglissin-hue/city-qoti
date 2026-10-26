// Arrival and departure (docs/spec/11-residents.md): attractiveness each morning, households
// walking in from the valley gate at 08:00 to the home that suits their species best, departures
// at 09:00 after three low-mood days, and rehousing when a home disappears. Ages and bonds tick
// over in the 06:00 pass.
import { content } from '@qoti/content';
import { DAYS_PER_SEASON, DAYS_PER_YEAR, MAP_SIZE, NEED_IDS, ResidentFlags } from '../../constants';
import type { Building, Household, LifeStage, Resident, Rng, TickCtx, WorldState } from '../../contracts';
import { findById, removeById } from '../../state/entities';
import { moodBand, townStock } from '../../view/hamlet';
import { chronicle } from '../chronicle/api';
import { pay } from '../economy/money';
import { moveResident, setInside } from '../movement/api';
import { averageAround, describeHome, homeDesirability } from './desirability';
import { removeFriend } from './friends';
import { createHousehold, pickMakeup, pickSpecies, stageForAge, stagesFor } from './generate';
import { assignJobs, openJobCount, release } from './jobs';
import { foodIndexes, pantryFood } from './needs';
import { doorOf, tileX, tileZ, vacantHomes, type Vacancy } from './places';
import { announceHousehold, announceResident, announceTown, forgetResident, pushHistory } from './records';
import { dayIndex } from './time';

/** Attractiveness needed for daily arrivals (tune). */
export const ARRIVAL_THRESHOLD = 40;
export const MAX_ARRIVALS_PER_DAY = 3;
/** Consecutive low-mood days before a household leaves. */
export const LOW_MOOD_DAYS = 3;

/** Departure threshold by economy dial (docs/spec/14-challenge.md, Difficulty dials). */
export function departureThreshold(state: WorldState): number {
  const e = state.settings.economy;
  return e === 'gentle' ? 15 : e === 'thoughtful' ? 35 : 25;
}

export function gateTile(state: WorldState): number {
  const [x, z] = state.meta.valleyGate;
  return z * MAP_SIZE + x;
}

/** Town attractiveness 0 to 100: vacant homes 30, food cover 20, open jobs 20, charm 15, mood 15. */
export function attractiveness(state: WorldState, vac: readonly Vacancy[] = vacantHomes(state)): number {
  const pop = state.residents.length;
  const stock = townStock(state);
  let food = 0;
  for (const g of foodIndexes()) food += stock[g] ?? 0;
  for (const h of state.households) food += pantryFood(h);
  const days = pop > 0 ? food / pop : 5;
  let charm = 0;
  for (const v of vac) {
    const door = doorOf(state, v.building.id);
    charm += averageAround(state.map.charm, tileX(door), tileZ(door), 3);
  }
  charm = vac.length > 0 ? charm / vac.length : 0;
  let mood = 60;
  if (pop > 0) {
    mood = 0;
    for (const r of state.residents) mood += r.mood;
    mood /= pop;
  }
  const a =
    30 * Math.min(1, vac.length / 2) +
    20 * Math.min(1, days / 5) +
    20 * Math.min(1, openJobCount(state) / 4) +
    15 * Math.min(1, charm / 30) +
    (15 * mood) / 100;
  return Math.round(a);
}

function speciesOf(state: WorldState, h: Household): string {
  return findById(state.residents, h.members[0] ?? 0)?.species ?? '';
}

/** The best vacant home for a species, ties by building id. */
function bestHome(
  state: WorldState,
  vac: readonly Vacancy[],
  species: string,
  memo?: Map<string, number>,
): [Vacancy | null, number] {
  let best: Vacancy | null = null;
  let bestScore = -Infinity;
  for (const v of vac) {
    const key = `${species}|${v.building.id}`;
    let s = memo?.get(key);
    if (s === undefined) {
      s = homeDesirability(state, v.building, species);
      memo?.set(key, s);
    }
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return [best, bestScore];
}

/** 08:00: households walk in from the valley gate and claim homes in order of desirability. */
export function arrivals(state: WorldState, ctx: TickCtx, rng: Rng): number {
  const vac = vacantHomes(state);
  if (vac.length === 0) return 0;
  const founding = state.stats.arrivals === 0 && state.residents.length === 0;
  if (founding) state.stats.attractiveness = attractiveness(state, vac);
  else if (state.stats.attractiveness < ARRIVAL_THRESHOLD) return 0;
  const k = founding
    ? Math.min(MAX_ARRIVALS_PER_DAY, vac.length)
    : Math.min(MAX_ARRIVALS_PER_DAY, 1 + Math.floor(vac.length / 4), vac.length);
  const gate = gateTile(state);
  const present = new Set(state.residents.map((r) => r.species));
  // Arrivals do not change what a home is worth to a species, so each is scored once.
  const memo = new Map<string, number>();
  for (let i = 0; i < k && vac.length > 0; i++) {
    // Every species is welcome; the best home on offer tips the scales, and a valley full of
    // one kind of folk is less likely to draw more of them (the founders are always mixed).
    const weights: [string, number][] = [];
    for (const sp of content.species) {
      if (founding && present.has(sp.id)) continue;
      const [, score] = bestHome(state, vac, sp.id, memo);
      const same = state.households.filter((h) => speciesOf(state, h) === sp.id).length;
      weights.push([sp.id, ((6 + Math.max(0, score)) * 2) / (2 + same)]);
    }
    const species = pickSpecies(rng, weights);
    const [home] = bestHome(state, vac, species, memo);
    if (!home) break;
    vac.splice(vac.indexOf(home), 1);
    present.add(species);
    // The founders are two working families; later arrivals follow the makeup table.
    const stages: LifeStage[] = founding
      ? (['adult', 'adult', 'young', 'child'] as LifeStage[]).slice(0, Math.max(1, home.residents))
      : stagesFor(pickMakeup(rng), rng, home.residents);
    const { household, members } = createHousehold(state, rng, {
      species,
      stages,
      homeId: home.building.id,
      tile: gate,
      inside: 0,
      activity: { kind: 'arrive' },
    });
    const door = doorOf(state, home.building.id);
    // The first of the family sets off at once; the rest follow on their next thought.
    if (members[0]) moveResident(state, members[0], door, 'arrive');
    for (const r of members) announceResident(state, ctx, r);
    announceHousehold(state, ctx, household.id, true);
    chronicle(state, ctx, 'household-arrived', {
      text: [
        ['family', household.family],
        ['place', describeHome(state, home.building)],
      ],
      refs: [household.id, home.building.id],
    });
    state.stats.arrivals += 1;
  }
  announceTown(state, ctx);
  return k;
}

/** 06:00: attractiveness, birthdays, bonds and the low-mood count behind departures. */
export function morningPass(state: WorldState): void {
  const today = dayIndex(state.tick);
  state.stats.attractiveness = attractiveness(state);
  const seasonStart = today % DAYS_PER_SEASON === 0;
  for (const r of state.residents) {
    const stage = stageForAge(today - r.bornDay);
    if (stage !== r.stage) {
      r.stage = stage;
      pushHistory(state, r, `grew-${stage}`);
    }
    const h = findById(state.households, r.householdId);
    // Bonds: lost slowly while Miserable; long residence earns a heart every two years.
    if (seasonStart && moodBand(r.mood) === 0 && r.bond > 0) r.bond -= 1;
    const stay = h ? today - h.arrivedDay : 0;
    if (stay > 0 && stay % (2 * DAYS_PER_YEAR) === 0 && r.bond < 5) r.bond += 1;
  }
  const base = departureThreshold(state);
  for (const h of state.households) {
    if (!h.homeId) continue;
    let mood = 0;
    let bond = 0;
    let n = 0;
    for (const id of h.members) {
      const r = findById(state.residents, id);
      if (!r) continue;
      mood += r.mood;
      bond += r.bond;
      n++;
    }
    if (n === 0) continue;
    const tolerant = state.economy.leanTimes && bond / n >= 3;
    const threshold = base - (tolerant ? 10 : 0);
    h.lowMoodDays = mood / n < threshold ? h.lowMoodDays + 1 : 0;
    if (h.lowMoodDays >= LOW_MOOD_DAYS) {
      for (const id of h.members) {
        const r = findById(state.residents, id);
        if (r) r.flags |= ResidentFlags.leaving;
      }
    }
  }
}

/** Farewell notes by the household's sorest need (NEED_IDS order). */
const FAREWELLS: readonly string[] = [
  'The views were lovely. We could not eat them, though.',
  'We will miss the neighbors. We will not miss walking half a day for a bucket of water.',
  'A roof would have been nice. Just a small one.',
  'Nobody ever stopped to say hello. We waved. Twice.',
  'We hoped for somewhere pretty. It was mostly mud, with ambitions.',
];

/** 09:00: households marked as leaving say goodbye and walk out through the gate. */
export function departures(state: WorldState, ctx: TickCtx): void {
  const leaving = state.households.filter((h) =>
    h.members.some((id) => (findById(state.residents, id)?.flags ?? 0) & ResidentFlags.leaving),
  );
  for (const h of leaving) setOffForGood(state, ctx, h, null);
  if (leaving.length > 0) announceTown(state, ctx);
}

/** The household leaves the valley: Chronicle line, farewell note, everyone heads for the gate. */
export function setOffForGood(state: WorldState, ctx: TickCtx, h: Household, note: string | null): void {
  const sums = NEED_IDS.map(() => 0);
  for (const id of h.members) {
    const r = findById(state.residents, id);
    if (!r) continue;
    for (let i = 0; i < sums.length; i++) sums[i]! += r.needs[i] ?? 0;
  }
  let sore = 0;
  for (let i = 1; i < sums.length; i++) if (sums[i]! < sums[sore]!) sore = i;
  chronicle(state, ctx, 'household-left', {
    text: [['family', h.family]],
    refs: [h.id],
  });
  ctx.events.push({
    e: 'notify',
    kind: 'letter',
    text: `The ${h.family} family left a note: "${note ?? FAREWELLS[sore]}"`,
  });
  state.stats.departures += 1;
  const gate = gateTile(state);
  const members = [...h.members];
  h.homeId = 0;
  for (const id of members) {
    const r = findById(state.residents, id);
    if (!r) continue;
    release(state, r);
    r.flags |= ResidentFlags.leaving;
    r.activity = { kind: 'leave' };
    r.carry = null;
    if (moveResident(state, r, gate, 'leave') !== 'walking') removeResident(state, ctx, r);
  }
  if (findById(state.households, h.id)) announceHousehold(state, ctx, h.id);
}

/** Someone on their way out: gone once they reach the gate. */
export function thinkLeaving(state: WorldState, ctx: TickCtx, r: Resident): void {
  if (r.move) return;
  const gate = gateTile(state);
  if (r.tile === gate || moveResident(state, r, gate, 'leave') !== 'walking') removeResident(state, ctx, r);
}

/** Takes a resident out of the valley: job, friends, household, events. */
export function removeResident(state: WorldState, ctx: TickCtx, r: Resident): void {
  release(state, r);
  setInside(state, r, 0);
  for (const f of [...r.friends]) {
    const other = findById(state.residents, f.id);
    if (other) removeFriend(other, r.id);
  }
  removeById(state.residents, r.id);
  forgetResident(state, ctx, r.id);
  const h = findById(state.households, r.householdId);
  if (!h) return;
  const i = h.members.indexOf(r.id);
  if (i >= 0) h.members.splice(i, 1);
  if (h.members.length === 0) {
    // I2 (C4A): the last one out takes the household's purse along (money leaving the valley).
    if (h.savings > 0) pay(state, { household: h.id }, 'outside', h.savings, null);
    removeById(state.households, h.id);
    ctx.events.push({ e: 'household.removed', id: h.id });
    announceTown(state, ctx);
  }
}

/**
 * Every few ticks: households whose home vanished move to the best vacant home for their species
 * or leave the valley; residents inside a vanished building step outside.
 */
export function rehouse(state: WorldState, ctx: TickCtx): void {
  for (const r of state.residents) {
    if (r.inside && !findById(state.buildings, r.inside)) setInside(state, r, 0);
  }
  for (const h of [...state.households]) {
    if (!h.homeId || findById(state.buildings, h.homeId)) continue;
    const first = findById(state.residents, h.members[0] ?? 0);
    const [home] = bestHome(state, vacantHomes(state), first?.species ?? 'rabbit');
    if (home) {
      h.homeId = home.building.id;
      for (const id of h.members) {
        const r = findById(state.residents, id);
        if (!r) continue;
        pushHistory(state, r, 'moved', home.building.id);
        if (r.activity.kind === 'home' || r.activity.kind === 'sleep') r.activity = { kind: 'goHome' };
      }
      announceHousehold(state, ctx, h.id);
    } else {
      setOffForGood(
        state,
        ctx,
        h,
        'Our house was there this morning. We are choosing not to take it personally.',
      );
      announceTown(state, ctx);
    }
  }
}

/** The building a household lives in, if any. */
export function homeOf(state: WorldState, h: Household): Building | undefined {
  return findById(state.buildings, h.homeId);
}

/**
 * Moves a new household straight into a home, skipping the gate and the Chronicle: for benches,
 * tools and tests that need a populated town at once. Jobs are assigned as usual.
 */
export function settleHousehold(
  state: WorldState,
  ctx: TickCtx,
  homeId: number,
  species: string,
  stages: LifeStage[],
): Household {
  const door = doorOf(state, homeId);
  const { household, members } = createHousehold(state, ctx.rng('residents'), {
    species,
    stages,
    homeId,
    tile: door,
    inside: homeId,
    activity: { kind: 'home' },
  });
  for (const r of members) {
    announceResident(state, ctx, r);
    assignJobs(state, ctx, r);
  }
  announceHousehold(state, ctx, household.id, true);
  return household;
}
