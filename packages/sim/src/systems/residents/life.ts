// Lives (docs/spec/11-residents.md, Ages and life events; C4D). In the residents' 06:00 pass,
// after birthdays: elders retire, apprentices finish, young folk with a school in town start an
// apprenticeship at a workshop, close friends become couples (and move in together when a home
// fits), married couples with a spare bed may have a child, and elders past SEASIDE_YEARS may go
// to live by the sea with family. At 18:00 couples marry: at the season's festival, or on a day of
// their own choosing when one of them is Romantic. Nobody dies in City Qoti.
//
// Every draw comes from the 'residents' stream. Chronicle and notice lines rotate through their
// variants (rotation) so the same words never come round twice in a row.
import { content, lifePhrases } from '@qoti/content';
import {
  APPRENTICE_DAYS,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  FESTIVAL,
  NEED_IDS,
  ResidentFlags,
  SEASIDE_YEARS,
  TICKS_PER_DAY,
} from '../../constants';
import type {
  Building,
  EntityId,
  Household,
  LifeEventKind,
  Resident,
  Rng,
  TickCtx,
  WorldState,
} from '../../contracts';
import { cyrb128 } from '../../rng/cyrb128';
import { findById, removeById } from '../../state/entities';
import { goodsArray } from '../../state/hamlet';
import { fillText, residentName } from '../../view/hamlet';
import { chronicle } from '../chronicle/api';
import { pay } from '../economy/money';
import { moveResident, setInside } from '../movement/api';
import { addMoodModifier } from './api';
import { describeHome, homeDesirability } from './desirability';
import { pickGiven, pickTraits } from './generate';
import { hire, openJobs, release } from './jobs';
import { gateTile, removeResident } from './lifecycle';
import { doorOf, manhattan, vacantHomes } from './places';
import { announceHousehold, announceResident, announceTown, pushHistory, syncResident } from './records';
import { compatibility, hasTrait, traitsCompatible } from './traits';
import { dayIndex } from './time';

/** Friendship level two residents need before they become a couple (5 without a Romantic). */
export const COUPLE_LEVEL = 4;
/** Chance each morning that an eligible pair becomes a couple, and the most couples a day. */
export const COUPLE_CHANCE = 0.5;
export const MAX_COUPLES_PER_DAY = 2;
/** Days a couple waits before the wedding (a Romantic couple's chosen day). */
export const WEDDING_WAIT_DAYS = 2;
/** Chance each morning that a married couple with a spare bed and mood 60+ has a child. */
export const BIRTH_CHANCE = 0.06;
export const BIRTH_MOOD = 60;
/** Days after a child before the next. */
export const BIRTH_GAP_DAYS = 2 * DAYS_PER_SEASON;
/** Chance each morning that an elder past SEASIDE_YEARS moves to the seaside (one a day). */
export const SEASIDE_CHANCE = 0.12;
/** Education satisfaction a young resident needs to start an apprenticeship, and starts a day. */
export const EDUCATION_MIN = 50;
export const MAX_APPRENTICES_PER_DAY = 2;

const EDUCATION = NEED_IDS.indexOf('education');
const STRIDES = [5, 3, 7, 2, 1];

/** The n-th variant of a list of `len`: every variant comes round once before any repeats. */
export function rotation(state: WorldState, n: number, len: number): number {
  if (len <= 1) return 0;
  const stride = STRIDES.find((s) => s < len && gcd(s, len) === 1) ?? 1;
  return ((cyrb128(state.seed)[0]! % len) + n * stride) % len;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function line(state: WorldState, list: readonly string[], n: number, params: [string, string][]): string {
  const text = list[rotation(state, n, list.length)] ?? '';
  return fillText(text, [...params, ['town', state.settings.townName]]);
}

function emit(ctx: TickCtx, kind: LifeEventKind, residents: EntityId[], text: string): void {
  ctx.events.push({ e: 'life.event', kind, residents, text });
}

function placeName(b: Building | undefined): string {
  return (b ? content.buildingById.get(b.def)?.name : undefined)?.toLowerCase() ?? 'workshop';
}

/** "Clover and Basil Thistledown", or "Clover Thistledown and Basil Underbough". */
export function pairName(a: Resident, b: Resident): string {
  return a.family === b.family
    ? `${a.given} and ${b.given} ${a.family}`
    : `${residentName(a)} and ${residentName(b)}`;
}

function busy(r: Resident): boolean {
  const k = r.activity.kind;
  return k === 'arrive' || k === 'leave' || (r.flags & ResidentFlags.leaving) !== 0;
}

function grown(r: Resident): boolean {
  return r.stage === 'young' || r.stage === 'adult';
}

/** A finished apprenticeship: the resident may take skilled (Craftsfolk) jobs. */
export function isTrained(state: WorldState, r: Resident): boolean {
  return !!r.apprentice && r.apprentice.untilDay <= dayIndex(state.tick);
}

/** True while an apprenticeship is under way (the job rebalance leaves apprentices be). */
export function isApprentice(state: WorldState, r: Resident): boolean {
  return !!r.apprentice && r.apprentice.untilDay > dayIndex(state.tick);
}

/** The 06:00 life pass, after birthdays. */
export function lifeMorning(state: WorldState, ctx: TickCtx): void {
  const today = dayIndex(state.tick);
  const rng = ctx.rng('residents');
  forgetGonePartners(state);
  retire(state, ctx);
  graduate(state, ctx, today);
  apprentices(state, ctx, today);
  couples(state, ctx, rng, today);
  settleCouples(state, ctx, today);
  births(state, ctx, rng, today);
  seaside(state, ctx, rng, today);
}

/** The 18:00 pass: weddings. */
export function lifeEvening(state: WorldState, ctx: TickCtx): void {
  const today = dayIndex(state.tick);
  const festival = today % DAYS_PER_SEASON === FESTIVAL.day - 1;
  for (const r of state.residents) {
    if (!r.partner || r.marriedDay || r.id > r.partner || busy(r)) continue;
    const o = findById(state.residents, r.partner);
    if (!o || busy(o)) continue;
    if (today - coupleDay(r) < WEDDING_WAIT_DAYS) continue;
    const romantic = hasTrait(r, 'romantic') || hasTrait(o, 'romantic');
    if (!festival && !romantic) continue;
    marry(state, ctx, r, o, today, festival);
  }
}

// --- Partners ------------------------------------------------------------------------------------

/** A partner who left the valley (a household moving away) is no longer a partner. */
function forgetGonePartners(state: WorldState): void {
  for (const r of state.residents) {
    if (r.partner && !findById(state.residents, r.partner)) {
      delete r.partner;
      delete r.marriedDay;
    }
  }
}

/** The day the pair became a couple, from the history (long ago when it has scrolled away). */
function coupleDay(r: Resident): number {
  for (let i = r.history.length - 1; i >= 0; i--)
    if (r.history[i]!.kind === 'couple') return r.history[i]!.day;
  return -DAYS_PER_YEAR;
}

/** Parent and child, or siblings: never a couple. */
function related(a: Resident, b: Resident): boolean {
  if (a.parents?.includes(b.id) || b.parents?.includes(a.id)) return true;
  return !!a.parents && !!b.parents && a.parents.some((p) => b.parents!.includes(p));
}

function friendLevel(a: Resident, b: Resident): number {
  const ab = a.friends.find((f) => f.id === b.id)?.level ?? 0;
  const ba = b.friends.find((f) => f.id === a.id)?.level ?? 0;
  return Math.min(ab, ba);
}

/** Can these two become a couple? Grown, free, close friends, compatible, not family. */
export function canCouple(a: Resident, b: Resident): boolean {
  if (a.id === b.id || a.partner || b.partner || !grown(a) || !grown(b) || busy(a) || busy(b)) return false;
  if (a.householdId === b.householdId || related(a, b)) return false;
  const level = friendLevel(a, b);
  if (level < COUPLE_LEVEL || compatibility(a, b) <= 50) return false;
  return level >= 5 || hasTrait(a, 'romantic') || hasTrait(b, 'romantic');
}

function couples(state: WorldState, ctx: TickCtx, rng: Rng, today: number): void {
  let made = 0;
  for (const r of state.residents) {
    if (made >= MAX_COUPLES_PER_DAY) return;
    if (r.partner || !grown(r) || busy(r)) continue;
    for (const f of r.friends) {
      if (f.level < COUPLE_LEVEL) continue;
      const o = findById(state.residents, f.id);
      if (!o || !canCouple(r, o) || !rng.chance(COUPLE_CHANCE)) continue;
      makeCouple(state, ctx, r, o, today);
      made++;
      break;
    }
  }
}

function makeCouple(state: WorldState, ctx: TickCtx, a: Resident, b: Resident, _today: number): void {
  a.partner = b.id;
  b.partner = a.id;
  pushHistory(state, a, 'couple', b.id);
  pushHistory(state, b, 'couple', a.id);
  for (const r of [a, b])
    addMoodModifier(state, r.id, { kind: 'in-love', value: 10, ticks: 6 * TICKS_PER_DAY });
  const n = state.village.couples++;
  const names: [string, string][] = [
    ['a', residentName(a)],
    ['b', residentName(b)],
  ];
  let text = line(state, lifePhrases.couple, n, names);
  const home = moveInTogether(state, ctx, a, b);
  if (home) text += ` ${line(state, lifePhrases.movedIn, n, [['place', describeHome(state, home)]])}`;
  emit(ctx, 'couple', [a.id, b.id], text);
  syncResident(state, ctx, a);
  syncResident(state, ctx, b);
}

/** Couples still living apart move in together once a home fits. */
function settleCouples(state: WorldState, ctx: TickCtx, today: number): void {
  for (const r of state.residents) {
    if (!r.partner || r.id > r.partner || busy(r)) continue;
    const o = findById(state.residents, r.partner);
    if (!o || o.householdId === r.householdId || busy(o)) continue;
    const home = moveInTogether(state, ctx, r, o);
    if (!home) continue;
    const text = line(state, lifePhrases.together, today + r.id, [
      ['a', residentName(r)],
      ['b', residentName(o)],
      ['place', describeHome(state, home)],
    ]);
    emit(ctx, 'couple', [r.id, o.id], text);
  }
}

function capacityOf(state: WorldState, h: Household): number {
  const b = findById(state.buildings, h.homeId);
  return b ? (content.buildingById.get(b.def)?.housing?.residents ?? 0) : 0;
}

/**
 * Brings a couple under one roof: one who lives alone joins the other's home when there is a bed,
 * else both take a vacant home together. Returns the home, or null when nothing fits yet.
 */
export function moveInTogether(state: WorldState, ctx: TickCtx, a: Resident, b: Resident): Building | null {
  const ha = findById(state.households, a.householdId);
  const hb = findById(state.households, b.householdId);
  if (!ha || !hb || !ha.homeId || !hb.homeId) return null;
  if (ha === hb) return findById(state.buildings, ha.homeId) ?? null;
  if (ha.members.length === 1 && capacityOf(state, hb) > hb.members.length) {
    joinHousehold(state, ctx, a, hb);
    return findById(state.buildings, hb.homeId) ?? null;
  }
  if (hb.members.length === 1 && capacityOf(state, ha) > ha.members.length) {
    joinHousehold(state, ctx, b, ha);
    return findById(state.buildings, ha.homeId) ?? null;
  }
  let best: Building | null = null;
  let bestScore = -Infinity;
  for (const v of vacantHomes(state)) {
    if (v.residents < 2) continue;
    const s = homeDesirability(state, v.building, a.species);
    if (s > bestScore) {
      bestScore = s;
      best = v.building;
    }
  }
  if (!best) return null;
  const h: Household = {
    id: state.nextId++,
    family: a.family === b.family ? a.family : `${a.family}-${b.family}`,
    members: [],
    homeId: best.id,
    pantry: goodsArray(),
    recentFoods: [],
    savings: 0,
    tier: best.rt?.tier ?? 'settler',
    arrivedDay: dayIndex(state.tick),
    lowMoodDays: 0,
  };
  state.households.push(h);
  announceHousehold(state, ctx, h.id, true);
  joinHousehold(state, ctx, a, h);
  joinHousehold(state, ctx, b, h);
  return best;
}

/**
 * Moves a resident into another household: their share of the old household's savings goes with
 * them (all of it, and the pantry, when they were the last one), and they walk to the new home.
 */
export function joinHousehold(state: WorldState, ctx: TickCtx, r: Resident, to: Household): void {
  const from = findById(state.households, r.householdId);
  if (from === to) return;
  if (from) {
    const share = Math.floor(from.savings / Math.max(1, from.members.length));
    const last = from.members.length <= 1;
    pay(state, { household: from.id }, { household: to.id }, last ? from.savings : share, null);
    from.members = from.members.filter((id) => id !== r.id);
    if (last) {
      for (let g = 0; g < from.pantry.length; g++) to.pantry[g] = (to.pantry[g] ?? 0) + (from.pantry[g] ?? 0);
      removeById(state.households, from.id);
      ctx.events.push({ e: 'household.removed', id: from.id });
    } else announceHousehold(state, ctx, from.id);
  }
  let i = to.members.length;
  while (i > 0 && to.members[i - 1]! > r.id) i--;
  to.members.splice(i, 0, r.id);
  r.householdId = to.id;
  r.tier = to.tier;
  pushHistory(state, r, 'moved', to.homeId);
  if (r.inside && r.inside !== to.homeId && r.inside === from?.homeId) setInside(state, r, 0);
  const k = r.activity.kind;
  if (k === 'home' || k === 'sleep' || k === 'goHome') r.activity = { kind: 'goHome' };
  announceHousehold(state, ctx, to.id);
  syncResident(state, ctx, r);
  announceTown(state, ctx);
}

function marry(
  state: WorldState,
  ctx: TickCtx,
  a: Resident,
  b: Resident,
  today: number,
  festival: boolean,
): void {
  const day = Math.max(1, today);
  a.marriedDay = day;
  b.marriedDay = day;
  const n = state.village.weddings++;
  for (const r of [a, b]) {
    addMoodModifier(state, r.id, { kind: 'wedding', value: 15, ticks: 3 * TICKS_PER_DAY });
    r.flags |= ResidentFlags.hop;
    pushHistory(state, r, 'married', r === a ? b.id : a.id);
  }
  // Friends of either come along and go home in a good mood.
  const guests = new Set<EntityId>();
  for (const r of [a, b]) for (const f of r.friends) if (f.level >= 2) guests.add(f.id);
  for (const id of [...guests].sort((x, y) => x - y)) {
    if (id !== a.id && id !== b.id)
      addMoodModifier(state, id, { kind: 'a-wedding', value: 5, ticks: TICKS_PER_DAY });
  }
  const params: [string, string][] = [
    ['a', residentName(a)],
    ['b', residentName(b)],
    ['when', festival ? lifePhrases.atFestival : lifePhrases.onTheirDay],
  ];
  const count = content.chronicleByKind.get('wedding')?.text.length ?? 1;
  const variant = rotation(state, n, count);
  chronicle(state, ctx, 'wedding', { text: params, refs: [a.id, b.id], variant });
  const text = state.chronicle[state.chronicle.length - 1]?.text ?? '';
  emit(ctx, 'wedding', [a.id, b.id], text);
  syncResident(state, ctx, a);
  syncResident(state, ctx, b);
}

// --- Births -------------------------------------------------------------------------------------

function births(state: WorldState, ctx: TickCtx, rng: Rng, today: number): void {
  for (const h of [...state.households]) {
    if (!h.homeId || capacityOf(state, h) <= h.members.length) continue;
    const pair = marriedPair(state, h);
    if (!pair) continue;
    const [a, b] = pair;
    if (a.mood < BIRTH_MOOD || b.mood < BIRTH_MOOD) continue;
    let youngest = -Infinity;
    for (const r of state.residents) if (r.parents?.includes(a.id)) youngest = Math.max(youngest, r.bornDay);
    if (today - youngest < BIRTH_GAP_DAYS) continue;
    if (!rng.chance(BIRTH_CHANCE)) continue;
    bear(state, ctx, rng, h, a, b, today);
  }
}

/** The first married couple in a household (both grown, not elders, both at home in the valley). */
function marriedPair(state: WorldState, h: Household): [Resident, Resident] | null {
  for (const id of h.members) {
    const a = findById(state.residents, id);
    if (!a || !a.partner || !a.marriedDay || a.id > a.partner || !grown(a) || busy(a)) continue;
    const b = findById(state.residents, a.partner);
    if (b && b.householdId === h.id && grown(b) && !busy(b)) return [a, b];
  }
  return null;
}

function bear(
  state: WorldState,
  ctx: TickCtx,
  rng: Rng,
  h: Household,
  a: Resident,
  b: Resident,
  today: number,
): Resident {
  const species = a.species === b.species || rng.chance(0.5) ? a.species : b.species;
  const taken = new Set(state.residents.map((r) => `${r.given} ${r.family}`));
  const family = a.family === b.family ? a.family : h.family;
  const given = pickGiven(rng, species, family, taken);
  // One trait from a parent, one of their own.
  const parentTraits = [...a.traits, ...b.traits];
  const inherited = parentTraits[rng.int(parentTraits.length)]!;
  const own = pickTraits(rng).find((t) => traitsCompatible(inherited, t)) ?? '';
  const home = findById(state.buildings, h.homeId);
  const door = doorOf(state, h.homeId);
  const child: Resident = {
    id: state.nextId++,
    given,
    family,
    species,
    stage: 'child',
    bornDay: today,
    traits: own ? [inherited, own] : [inherited],
    householdId: h.id,
    jobId: 0,
    tier: h.tier,
    mood: 80,
    needs: NEED_IDS.map((_, i) => Math.round(((a.needs[i] ?? 75) + (b.needs[i] ?? 75)) / 2)),
    modifiers: [],
    bond: 1,
    friends: [],
    activity: { kind: 'home' },
    move: null,
    tile: door >= 0 ? door : a.tile,
    inside: home ? home.id : 0,
    carry: null,
    wishId: 0,
    history: [{ day: today, kind: 'born' }],
    flags: 0,
    look: rng.next() >>> 0,
    parents: [a.id, b.id],
  };
  state.residents.push(child);
  h.members.push(child.id);
  for (const p of [a, b]) {
    pushHistory(state, p, 'child', child.id);
    addMoodModifier(state, p.id, { kind: 'new-baby', value: 10, ticks: 3 * TICKS_PER_DAY });
  }
  const n = state.village.births++;
  const count = content.chronicleByKind.get('birth')?.text.length ?? 1;
  chronicle(state, ctx, 'birth', {
    text: [
      ['child', given],
      ['parents', pairName(a, b)],
    ],
    refs: [child.id, a.id, b.id],
    variant: rotation(state, n, count),
  });
  emit(ctx, 'birth', [child.id, a.id, b.id], state.chronicle[state.chronicle.length - 1]?.text ?? '');
  announceResident(state, ctx, child);
  announceHousehold(state, ctx, h.id);
  announceTown(state, ctx);
  return child;
}

// --- Work: apprentices and retiring --------------------------------------------------------------

/** Elders stop working (and arrivals who are already elders count as retired). */
function retire(state: WorldState, ctx: TickCtx): void {
  for (const r of state.residents) {
    if (r.stage !== 'elder' || r.retired) continue;
    r.retired = true;
    if (!r.jobId) continue;
    const b = findById(state.buildings, r.jobId);
    release(state, r);
    pushHistory(state, r, 'retired', b?.id ?? 0);
    const text = line(state, lifePhrases.retired, r.id + dayIndex(state.tick), [
      ['name', residentName(r)],
      ['place', placeName(b)],
    ]);
    emit(ctx, 'retired', [r.id], text);
    syncResident(state, ctx, r);
  }
}

/** A built school (by tag or id) is open in town. */
function schoolOpen(state: WorldState): boolean {
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const def = content.buildingById.get(b.def);
    if (def && (def.id === 'school' || def.tags?.includes('school'))) return true;
  }
  return false;
}

function isWorkshop(b: Building | undefined): b is Building {
  return (
    !!b && b.stage === 'built' && !!b.rt && !!content.buildingById.get(b.def)?.tags?.includes('workshop')
  );
}

/** Young residents with schooling start a season's apprenticeship at a workshop. */
function apprentices(state: WorldState, ctx: TickCtx, today: number): void {
  if (!schoolOpen(state)) return;
  let started = 0;
  for (const r of state.residents) {
    if (started >= MAX_APPRENTICES_PER_DAY) return;
    if (r.stage !== 'young' || r.apprentice || r.story || busy(r)) continue;
    if (EDUCATION >= 0 && (r.needs[EDUCATION] ?? 100) < EDUCATION_MIN) continue;
    const h = findById(state.households, r.householdId);
    if (!h?.homeId) continue;
    let at = r.jobId ? findById(state.buildings, r.jobId) : undefined;
    if (!isWorkshop(at)) {
      at = nearestOpenWorkshop(state, doorOf(state, h.homeId));
      if (!at) continue;
      if (r.jobId) release(state, r);
      hire(state, r, at);
    }
    r.apprentice = { at: at.id, trade: at.def, untilDay: today + APPRENTICE_DAYS };
    pushHistory(state, r, 'apprentice', at.id);
    const text = line(state, lifePhrases.apprentice, r.id + today, [
      ['name', residentName(r)],
      ['place', placeName(at)],
    ]);
    emit(ctx, 'apprentice', [r.id], text);
    syncResident(state, ctx, r);
    started++;
  }
}

function nearestOpenWorkshop(state: WorldState, from: number): Building | undefined {
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of state.buildings) {
    if (!isWorkshop(b) || openJobs(b) <= 0) continue;
    const d = manhattan(from, doorOf(state, b.id));
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Apprenticeships end after a season; the newly trained take an open skilled job if there is one. */
function graduate(state: WorldState, ctx: TickCtx, today: number): void {
  for (const r of state.residents) {
    if (!r.apprentice || r.apprentice.untilDay !== today) continue;
    const at = findById(state.buildings, r.apprentice.at);
    pushHistory(state, r, 'trained', r.apprentice.at);
    addMoodModifier(state, r.id, { kind: 'trained', value: 8, ticks: 3 * TICKS_PER_DAY });
    const skilled = skilledOpening(state, r);
    if (skilled && skilled.id !== r.jobId) {
      release(state, r);
      hire(state, r, skilled);
    }
    const text = line(state, lifePhrases.trained, r.id + today, [
      ['name', residentName(r)],
      [
        'place',
        at ? placeName(at) : (content.buildingById.get(r.apprentice.trade)?.name.toLowerCase() ?? 'workshop'),
      ],
    ]);
    emit(ctx, 'apprentice', [r.id], text);
    syncResident(state, ctx, r);
  }
}

/** The nearest open Craftsfolk (skilled) job, if any. */
function skilledOpening(state: WorldState, r: Resident): Building | undefined {
  const h = findById(state.households, r.householdId);
  const from = h?.homeId ? doorOf(state, h.homeId) : r.tile;
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of state.buildings) {
    if (openJobs(b) <= 0 || content.buildingById.get(b.def)?.jobs?.tier !== 'craftsfolk') continue;
    const d = manhattan(from, doorOf(state, b.id));
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

// --- The seaside ---------------------------------------------------------------------------------

/** Elders past SEASIDE_YEARS may go to live by the sea with family (with an elder partner). */
function seaside(state: WorldState, ctx: TickCtx, rng: Rng, today: number): void {
  const age = SEASIDE_YEARS * DAYS_PER_YEAR;
  for (const r of state.residents) {
    if (r.stage !== 'elder' || today - r.bornDay < age || r.story || busy(r)) continue;
    const partner = r.partner ? findById(state.residents, r.partner) : undefined;
    if (partner && (partner.stage !== 'elder' || partner.story || busy(partner))) continue;
    if (!rng.chance(SEASIDE_CHANCE)) continue;
    goToSeaside(state, ctx, partner ? [r, partner].sort((x, y) => x.id - y.id) : [r]);
    return;
  }
}

/** Waves elders off to the coast: savings go with them, a Chronicle entry, then the walk to the gate. */
export function goToSeaside(state: WorldState, ctx: TickCtx, leavers: Resident[]): void {
  const first = leavers[0]!;
  const h = findById(state.households, first.householdId);
  if (h) {
    const all = h.members.every((id) => leavers.some((l) => l.id === id));
    const share = all ? h.savings : Math.floor((h.savings * leavers.length) / Math.max(1, h.members.length));
    pay(state, { household: h.id }, 'outside', share, null);
    if (all) h.homeId = 0;
  }
  const name = leavers.length === 2 ? pairName(leavers[0]!, leavers[1]!) : residentName(first);
  const n = state.village.seaside;
  state.village.seaside += leavers.length;
  const count = content.chronicleByKind.get('seaside')?.text.length ?? 1;
  chronicle(state, ctx, 'seaside', {
    text: [['name', name]],
    refs: leavers.map((l) => l.id),
    variant: rotation(state, n, count),
  });
  emit(
    ctx,
    'seaside',
    leavers.map((l) => l.id),
    state.chronicle[state.chronicle.length - 1]?.text ?? '',
  );
  const gate = gateTile(state);
  for (const r of leavers) {
    release(state, r);
    r.carry = null;
    r.activity = { kind: 'leave' };
    pushHistory(state, r, 'seaside');
    if (moveResident(state, r, gate, 'leave') !== 'walking') removeResident(state, ctx, r);
  }
  if (h && findById(state.households, h.id)) announceHousehold(state, ctx, h.id);
  announceTown(state, ctx);
}
