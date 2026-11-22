// Specialized buildings that grow with success (R3H; the master's ruling of 2026-11-17, from the
// owner's playtest of main). A specialized building whose def has `levels` climbs after good days
// running (LEVEL_UP_DAYS, the businesses' own count) and slides back after LEVEL_DOWN_DAYS failing
// days, as businesses do. What a good day is comes from its def (`levels.good`):
//   carried    what it made today was carried off (four fifths of it, a business's steady custom),
//              without running short of its raw good, while the town wants more of what it makes
//              (not in surplus: more in store than SURPLUS_COVER_DAYS of the town's want, the mark at
//              which a business retools; a surplus day is quiet); a Lodge fells only with its woods
//              above its site rule. A Fishery on a frozen river rests: those days count neither way.
//   customers  a Market Stall served STALL_CUSTOMERS[level - 1] households.
//   served     a full house: every place at its level's capacity taken (`capacityOf`, R3B's master
//              room and R3C's calling room included) and every business it serves had its raw good
//              all day (the master's ruling of 2026-11-22). A served business gone short fails the
//              day; an empty place never does. A Sawmill on a frozen river rests.
//   full       its store holds its def's `fullShare` of the level's storage (a third toward level 2,
//              half toward level 3) with every porter it wants. Stores never slide: a granary fills
//              at harvest and empties over winter by design, and a store keeps the room it earned.
// A failing day falls short of the level it stands at (the terms it climbed on): goods left in the
// yard, too few customers, a business it serves short, a store under half of the level below. Any
// other day breaks a run either way. A level is a bigger building with a bigger crew, reach, store
// or room (`atLevel` in state/zones.ts, read where today's numbers are), never a multiplier
// (13-ledger.md, Levels). Nothing new is saved: `Building.level` and `Building.counters` are.
import { content, type BuildingDef, type SpecializedLevelsDef } from '@qoti/content';
import { BUSINESS_LEVEL_MAX } from '../../constants';
import type { Building, BusinessCounters, SpecializedClimbView, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { emptyCounters, jobsOf, levelOf, storageOf } from '../../state/zones';
import { buildingView } from '../../view';
import { businessView } from '../../view/businesses';
import { chronicle } from '../chronicle/api';
import { sum } from '../logistics/stores';
import { invalidatePlaces } from '../places';
import { bumpPlaceInputs } from '../places/inputs';
import { woodsThin } from '../production/forestry';
import { release } from '../residents/jobs';
import { isFrozen } from '../seasons/api';
import { capacityOf, servedIds } from '../specialized/api';
import { SURPLUS_COVER_DAYS } from '../growth/retool';
import { townNeeds, type TownNeeds } from '../growth/trades';
import { LEVEL_DOWN_DAYS, LEVEL_UP_DAYS } from './index';
import { outOfSeason } from './season';

/** Customers a day a Market Stall needs to climb to level 2 and to level 3 (and to hold each after). */
export const STALL_CUSTOMERS: readonly number[] = [8, 12];

/** How a specialized building's day went toward its levels. */
export type SpecializedDay = 'good' | 'failing' | 'quiet' | 'resting';

/** The highest level its def names (the longest of its levels' arrays), 1 without levels. */
export function specializedMaxLevel(def: BuildingDef | undefined): number {
  const l = def?.levels;
  if (!l) return 1;
  const n = Math.max(
    l.crew?.length ?? 0,
    l.reach?.length ?? 0,
    l.storage?.length ?? 0,
    l.capacity?.length ?? 0,
  );
  return Math.min(BUSINESS_LEVEL_MAX, Math.max(1, n));
}

/** True when the building rests today: its good is out of season, or a Sawmill's wheel is frozen. */
function resting(state: WorldState, b: Building, def: BuildingDef): boolean {
  if (outOfSeason(state, b)) return true;
  // A river wheel that serves (the Sawmill) stops while the river is frozen (seasons/river.ts).
  return def.levels?.good === 'served' && !!def.placement?.some((r) => r.kind === 'river') && isFrozen(state);
}

/** Four fifths of what it made was carried off (the businesses' steady custom). */
function carriedOff(c: BusinessCounters): boolean {
  return c.madeToday > 0 && c.soldToday * 5 >= c.madeToday * 4;
}

/** The businesses it serves today: the first `capacityOf` in its reach (by id), built and staffed. */
export function servedToday(state: WorldState, b: Building): Building[] {
  const cap = capacityOf(state, b);
  const out: Building[] = [];
  for (const id of servedIds(state, b)) {
    if (out.length >= cap) break;
    const s = findById(state.buildings, id);
    if (s && s.stage === 'built' && s.rt) out.push(s);
  }
  return out;
}

/** The store's units at 23:30 (for `full`). */
function stored(b: Building): number {
  return b.rt ? sum(b.rt.store) : 0;
}

/** Units a store at `level` holds on a good day toward the next: its def's share of its storage. */
export function fullMark(def: BuildingDef, level: number): number {
  const share = def.levels?.fullShare?.[level - 1] ?? 50;
  return Math.ceil((storageOf({ def: def.id, level }) * share) / 100);
}

/**
 * True when the town holds more of every good the building makes than SURPLUS_COVER_DAYS of its
 * want, with none of them short: it makes what nobody needs (growth/retool.ts's mark).
 */
export function makesSurplus(def: BuildingDef, n: TownNeeds): boolean {
  const outputs = def.methods?.[0]?.outputs ?? [];
  if (outputs.length === 0) return false;
  for (const [id] of outputs) {
    const g = content.goodIndex.get(id);
    if (g === undefined) continue;
    if ((n.short[g] ?? 0) > 0 || (n.stock[g] ?? 0) <= SURPLUS_COVER_DAYS * Math.max(1, n.want[g] ?? 0))
      return false;
  }
  return true;
}

/**
 * The town's needs for the levels pass: worked out once a tick and kept for the pass's other
 * buildings (the specialized day ends run back to back at 23:30 and move no goods). Only the sim's
 * day end reads it; views and the audit work theirs out fresh, so an inspector's look can never feed
 * the sim a number its partner did not see.
 */
const passNeeds = new WeakMap<WorldState, { tick: number; needs: TownNeeds }>();
function needsForPass(state: WorldState): TownNeeds {
  const hit = passNeeds.get(state);
  if (hit && hit.tick === state.tick) return hit.needs;
  const needs = townNeeds(state);
  passNeeds.set(state, { tick: state.tick, needs });
  return needs;
}

/**
 * How the day went for a specialized building with levels, read from its counters before they reset
 * (and, for `served`, the counters of the businesses it serves). Pure: the inspector and the tests
 * read it too. `needs` is the town's (`townNeeds`), worked out here when not given.
 */
export function specializedDay(state: WorldState, b: Building, needs?: TownNeeds): SpecializedDay {
  const def = content.buildingById.get(b.def);
  const levels: SpecializedLevelsDef | undefined = def?.levels;
  if (!def || !levels || !b.rt) return 'quiet';
  if (resting(state, b, def)) return 'resting';
  const c = b.counters ?? emptyCounters();
  const level = levelOf(b);
  switch (levels.good) {
    case 'carried': {
      if (c.shortToday || (c.madeToday > 0 && !carriedOff(c))) return 'failing';
      // Goods the town has no use for make no good day (nor a failing one: demand comes and goes
      // with the sites, and a quarry sliding every time it caught up only made noise).
      if (makesSurplus(def, needs ?? townNeeds(state))) return 'quiet';
      if (!carriedOff(c)) return 'quiet';
      // A Lodge's good day fells with its woods above its site rule (not planting them back).
      const fells = def.methods?.some((m) => m.kind === 'fell') === true;
      return fells && woodsThin(state, b, def) ? 'quiet' : 'good';
    }
    case 'customers': {
      if (level >= 2 && c.customersToday < STALL_CUSTOMERS[level - 2]!) return 'failing';
      const next = STALL_CUSTOMERS[level - 1];
      return next !== undefined && c.customersToday >= next ? 'good' : 'quiet';
    }
    case 'served': {
      const list = servedToday(state, b);
      if (list.some((s) => s.counters?.shortToday)) return 'failing';
      // A full house climbs; fewer served (an empty place) only holds.
      return list.length > 0 && list.length >= capacityOf(state, b) ? 'good' : 'quiet';
    }
    case 'full':
      // Never failing: a store keeps the room it earned through the winter's emptying.
      return stored(b) >= fullMark(def, level) && b.rt.workers.length >= jobsOf(b) ? 'good' : 'quiet';
    default:
      return 'quiet';
  }
}

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

/** A number the way the Chronicle writes it (1,680). */
function count(n: number): string {
  return n >= 1000 ? `${Math.floor(n / 1000)},${String(n % 1000).padStart(3, '0')}` : String(n);
}

/** What a hand at this building is called (a porter at the Granary, a vendor at the Stall). */
function handWord(def: BuildingDef): string {
  const role = def.jobs?.role;
  return role === 'porter' ? 'porter' : role === 'vendor' ? 'vendor' : 'hand';
}

/**
 * What a level brings over the one below, in words: "a fourth hand, and its woods out to 10 tiles",
 * "room for a third baker". Read from the levels data, so the words follow the numbers. Empty when
 * the level adds nothing it can name.
 */
export function levelGains(def: BuildingDef, to: number): string[] {
  const l = def.levels;
  if (!l || to < 2) return [];
  const at = (a: number[] | undefined, lv: number): number | undefined => a?.[Math.min(a.length, lv) - 1];
  const out: string[] = [];
  const crew = at(l.crew, to);
  const crewBefore = at(l.crew, to - 1);
  if (crew !== undefined && crewBefore !== undefined && crew > crewBefore) {
    const word = handWord(def);
    out.push(
      crew - crewBefore === 1 ? `a ${ORDINAL[crew] ?? 'new'} ${word}` : `${crew - crewBefore} more ${word}s`,
    );
  }
  const reach = at(l.reach, to);
  if (reach !== undefined && reach !== at(l.reach, to - 1)) {
    const fells = def.methods?.some((m) => m.kind === 'fell') === true;
    out.push(
      fells
        ? `its woods out to ${reach} tiles`
        : l.good === 'customers'
          ? `customers from ${reach} tiles away`
          : `its reach out to ${reach} tiles`,
    );
  }
  const storage = at(l.storage, to);
  if (storage !== undefined && storage !== at(l.storage, to - 1))
    out.push(`room for ${count(storage)} goods`);
  const cap = at(l.capacity, to);
  const capBefore = at(l.capacity, to - 1);
  if (cap !== undefined && capBefore !== undefined && cap > capBefore) {
    const trade = content.tradeById.get(def.enables?.[0] ?? '');
    const who = trade ? trade.name.toLowerCase() : 'business';
    out.push(`room for a ${ORDINAL[cap] ?? 'new'} ${who}`);
  }
  return out;
}

/** "a, b and c". */
export function joinWords(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Why a level slid, in words, by the def's good day. */
function slideWhy(def: BuildingDef): string {
  switch (def.levels?.good) {
    case 'carried':
      return 'its goods sat in the yard waiting for porters four days running';
    case 'customers':
      return 'four days of too few customers';
    case 'served': {
      const trade = content.tradeById.get(def.enables?.[0] ?? '');
      return `the ${trade ? `${trade.name.toLowerCase()}s` : 'businesses'} it serves went short four days running`;
    }
    case 'full':
      return 'its shelves stood under half full four days running';
    default:
      return 'four poor days running';
  }
}

/** "the forester's lodge", "the granary": the Chronicle's way with a building. */
export function specializedName(def: BuildingDef): string {
  return `the ${def.name.toLowerCase()}`;
}

/** Hands past the level's crew go home, newest first, never mid-task or carrying (as a business). */
function trimCrew(state: WorldState, ctx: TickCtx, b: Building): void {
  const rt = b.rt;
  if (!rt) return;
  const crew = jobsOf(b);
  for (let i = rt.workers.length - 1; i >= 0 && rt.workers.length > crew; i--) {
    const r = findById(state.residents, rt.workers[i]!);
    if (!r || r.activity.kind === 'task' || r.carry) continue;
    release(state, r, false, ctx);
  }
}

/** The level changed: the places, the art and the Chronicle hear of it. */
function changed(state: WorldState, ctx: TickCtx, b: Building, def: BuildingDef, up: boolean): void {
  const level = levelOf(b);
  bumpPlaceInputs(state);
  if (def.host) invalidatePlaces(state);
  ctx.events.push({ e: 'building.updated', b: buildingView(b) });
  const name = specializedName(def);
  chronicle(state, ctx, up ? 'specialized-grew' : 'specialized-shrank', {
    text: [
      ['building', name],
      ['level', String(level)],
      ['more', up ? joinWords(levelGains(def, level)) || 'a little more of everything' : ''],
      ['why', up ? '' : slideWhy(def)],
    ],
    refs: [b.id],
    // Chosen by the building and its level, so the town's dice stay where they were.
    variant: b.id + level,
  });
}

/** One specialized building's day end: count its good day, climb or slide. */
export function specializedDayEnd(state: WorldState, ctx: TickCtx, b: Building): void {
  const def = content.buildingById.get(b.def);
  if (!def?.levels || !b.rt) return;
  const c = (b.counters ??= emptyCounters());
  const daysBefore = c.levelDays;
  const levelBefore = levelOf(b);
  const needs = def.levels.good === 'carried' ? needsForPass(state) : undefined;
  const day = specializedDay(state, b, needs);
  // Resting (a frozen river): neither fails nor counts; the run waits for the thaw.
  if (day !== 'resting') {
    const level = levelOf(b);
    const max = specializedMaxLevel(def);
    if (day === 'good' && level < max) {
      c.levelDays = Math.max(0, c.levelDays) + 1;
      if (c.levelDays >= LEVEL_UP_DAYS) {
        b.level = level + 1;
        c.levelDays = 0;
        changed(state, ctx, b, def, true);
      }
    } else if (day === 'failing' && level >= 2) {
      c.levelDays = Math.min(0, c.levelDays) - 1;
      if (c.levelDays <= -LEVEL_DOWN_DAYS) {
        b.level = level - 1;
        c.levelDays = 0;
        trimCrew(state, ctx, b);
        changed(state, ctx, b, def, false);
      }
    } else {
      c.levelDays = 0;
    }
  }
  c.madeToday = 0;
  c.soldToday = 0;
  c.customersToday = 0;
  c.shortToday = false;
  // The Businesses book hears when its days or its level moved (a City's dozens of mills and stores
  // walking their served lists every night for an unchanged line cost the levels pass its budget).
  if (c.levelDays !== daysBefore || levelOf(b) !== levelBefore)
    ctx.events.push({ e: 'business.updated', b: businessView(state, b) });
}

/**
 * The inspector's view of a specialized building's climb (BuildingDetail.climb): its level, the days
 * so far, what a good day is and how today stands against it, and what the next level brings. Null
 * for a building without levels.
 */
export function specializedClimb(state: WorldState, b: Building): SpecializedClimbView | null {
  const def = content.buildingById.get(b.def);
  const levels = def?.levels;
  if (!def || !levels?.good || !b.rt) return null;
  const level = levelOf(b);
  const max = specializedMaxLevel(def);
  const c = b.counters ?? emptyCounters();
  let today: { have: number; need: number };
  let places: { taken: number; room: number } | undefined;
  switch (levels.good) {
    case 'carried':
      today = { have: c.soldToday, need: c.madeToday };
      break;
    case 'customers': {
      // The mark toward the next level, or at the top the one that holds it.
      const need = STALL_CUSTOMERS[Math.min(level, max - 1) - 1] ?? STALL_CUSTOMERS[0]!;
      today = { have: c.customersToday, need: level >= max ? (STALL_CUSTOMERS[level - 2] ?? need) : need };
      break;
    }
    case 'served': {
      const list = servedToday(state, b);
      today = { have: list.filter((s) => !s.counters?.shortToday).length, need: list.length };
      places = { taken: list.length, room: capacityOf(state, b) };
      break;
    }
    case 'full':
      today = { have: stored(b), need: fullMark(def, level) };
      break;
  }
  const view: SpecializedClimbView = {
    level,
    max,
    days: c.levelDays,
    upDays: LEVEL_UP_DAYS,
    downDays: LEVEL_DOWN_DAYS,
    good: levels.good,
    today,
    next: level < max ? levelGains(def, level + 1) : [],
    lose: level > 1 ? levelGains(def, level) : [],
  };
  if (places) view.places = places;
  if (resting(state, b, def)) view.resting = true;
  if (levels.good === 'carried' && makesSurplus(def, townNeeds(state))) view.surplus = true;
  return view;
}
