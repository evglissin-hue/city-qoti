// What the innovations measure (docs/spec/15-progression.md, Innovations; C4C): the named code
// predicates their conditions use, the counters behind them and the progress bars in the
// inventor's notebook. Counters live in InnovationState.counter so they save and load with the
// valley:
//
//   quarryDays       days a quarry with hands at work cut stone (counted at the last pass of the day,
//                    23:00, while the day's output is still on the books)
//   portersBusyDays  streak * 1000 + today's sum of hourly samples (0 to 100 each) of the busiest
//                    storehouse's share of porters out on a trip, nine samples a work day
//   timberRate, stoneRate  read yesterday's books; no counter
//   waterWheel       days a Forester's Lodge by the river felled a tree (timber or firewood),
//                    counted at 23:00; the story step fills the bar outright
import { content, type Condition, type InnovationDef } from '@qoti/content';
import { MAP_SIZE, RANKS, WORK_HOURS } from '../../constants';
import type { Building, InnovationState, WorldState } from '../../contracts';
import { footprintSize } from '../../rules/footprint';
import { hourOf } from '../economy/time';
import { defOf, isStorehouse } from '../logistics/stores';
import { findById } from '../../state/entities';
import { Water } from '../../map/layers';

const S = MAP_SIZE;
const WORK_SAMPLES = WORK_HOURS[1] - WORK_HOURS[0];
const STREAK = 1000;
/** The hour of the last pass of a day: producedToday is cleared at midnight, just after it. */
const LAST_HOUR = 23;

type Params = readonly [string, number][];

function param(params: Params, name: string, fallback: number): number {
  for (const [k, v] of params) if (k === name) return v;
  return fallback;
}

/** The params a condition gives a named predicate (searching all/any/not), or null. */
export function predicateParams(cond: Condition, code: string): Params | null {
  if ('all' in cond || 'any' in cond) {
    for (const c of 'all' in cond ? cond.all : cond.any) {
      const p = predicateParams(c, code);
      if (p) return p;
    }
    return null;
  }
  if ('not' in cond) return predicateParams(cond.not, code);
  if ('code' in cond && cond.code === code) return cond.params ?? [];
  return null;
}

/** The `ref` a condition gives a named predicate (searching all/any/not), or undefined (C5.0). */
export function predicateRef(cond: Condition, code: string): string | undefined {
  if ('all' in cond || 'any' in cond) {
    for (const c of 'all' in cond ? cond.all : cond.any) {
      const r = predicateRef(c, code);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if ('not' in cond) return predicateRef(cond.not, code);
  if ('code' in cond && cond.code === code) return cond.ref;
  return undefined;
}

/** The counter of the innovation measured by `measure`, or 0. */
function counterOf(state: WorldState, measure: string): number {
  for (const s of state.innovations)
    if (content.innovationById.get(s.id)?.measure === measure) return s.counter;
  return 0;
}

function yesterday(state: WorldState, good: string): number {
  const g = content.goodIndex.get(good);
  return g === undefined ? 0 : (state.economy.yesterday.produced[g] ?? 0);
}

// --- Predicates (registered in conditions/code.ts) --------------------------------------------

/** A quarry has cut stone on `days` days (the Brick Kiln). */
export function quarryWorked(state: WorldState, _bind: unknown, params: Params): boolean {
  return counterOf(state, 'quarryDays') >= param(params, 'days', 2);
}

/** Timber made yesterday (Carts). */
export function timberRate(state: WorldState, _bind: unknown, params: Params): boolean {
  return yesterday(state, 'timber') >= param(params, 'perDay', 20);
}

export function stoneRate(state: WorldState, _bind: unknown, params: Params): boolean {
  return yesterday(state, 'stone') >= param(params, 'perDay', 20);
}

/** `rank` is an index into RANKS (1 = Village). */
export function rankAtLeastCode(state: WorldState, _bind: unknown, params: Params): boolean {
  return RANKS.indexOf(state.charter.rank) >= param(params, 'rank', 0);
}

export function portersBusy(state: WorldState, _bind: unknown, params: Params): boolean {
  return Math.floor(counterOf(state, 'portersBusyDays') / STREAK) >= param(params, 'days', 3);
}

/** River water within `within` tiles of a building's footprint. */
function riverWithin(state: WorldState, b: Building, within: number): boolean {
  const def = defOf(b)!;
  const [w, d] = footprintSize(def, b.rot);
  for (let z = Math.max(0, b.z - within); z <= Math.min(S - 1, b.z + d - 1 + within); z++) {
    for (let x = Math.max(0, b.x - within); x <= Math.min(S - 1, b.x + w - 1 + within); x++) {
      const water = state.map.water[z * S + x];
      if (water === Water.river || water === Water.riverDeep) return true;
    }
  }
  return false;
}

/** A built Forester's Lodge with river water within `within` tiles of its footprint. */
export function lodgeNearRiver(state: WorldState, within: number): boolean {
  for (const b of state.buildings) {
    if (b.def === 'foresters-lodge' && b.stage === 'built' && riverWithin(state, b, within)) return true;
  }
  return false;
}

/** Units of a good a building made today (its runtime is cleared at midnight). */
function madeToday(b: Building, good: string): number {
  const g = content.goodIndex.get(good);
  return g === undefined ? 0 : (b.rt?.producedToday[g] ?? 0);
}

/** A built quarry with hands at work that cut stone today. */
export function quarryWorkedToday(state: WorldState): boolean {
  return state.buildings.some(
    (b) =>
      b.def === 'quarry' &&
      b.stage === 'built' &&
      !!b.rt &&
      b.rt.workers.length > 0 &&
      madeToday(b, 'stone') > 0,
  );
}

/** A lodge by the river (within `within` tiles) felled at least once today (timber or firewood). */
export function riverLodgeWorkedToday(state: WorldState, within: number): boolean {
  return state.buildings.some(
    (b) =>
      b.def === 'foresters-lodge' &&
      b.stage === 'built' &&
      madeToday(b, 'timber') + madeToday(b, 'firewood') > 0 &&
      riverWithin(state, b, within),
  );
}

/** A Forester's Lodge by the river (within `within` tiles) that has worked `days` days (the Water Wheel). */
export function lodgeByRiver(state: WorldState, _bind: unknown, params: Params): boolean {
  return (
    counterOf(state, 'waterWheel') >= param(params, 'days', 3) &&
    lodgeNearRiver(state, param(params, 'within', 12))
  );
}

/**
 * The story arc `ref` (C5.0; or, for older conditions, the arc at index `arc` of content.stories)
 * has reached `step` with its character here.
 */
export function storyStep(state: WorldState, _bind: unknown, params: Params, ref?: string): boolean {
  const arc = ref ? content.storyById.get(ref) : content.stories[param(params, 'arc', 0)];
  const s = arc ? state.stories.find((x) => x.arc === arc.id) : undefined;
  return !!s && s.residentId !== 0 && s.step >= param(params, 'step', 0);
}

// --- Counters and progress ---------------------------------------------------------------------

/** The busiest storehouse's share of its porters out on a trip right now, 0 to 100. */
export function porterBusyPercent(state: WorldState): number {
  let best = 0;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || !isStorehouse(defOf(b)) || b.rt.workers.length === 0) continue;
    let busy = 0;
    for (const id of b.rt.workers) {
      const r = findById(state.residents, id);
      if (r && r.activity.kind === 'task') busy++;
    }
    best = Math.max(best, Math.floor((busy * 100) / b.rt.workers.length));
  }
  return best;
}

/** Updates a measure's counter for this hourly pass. Returns nothing; progress is read after. */
export function tickMeasure(state: WorldState, def: InnovationDef, s: InnovationState): void {
  const hour = hourOf(state.tick);
  switch (def.measure) {
    case 'quarryDays':
      if (hour === LAST_HOUR && quarryWorkedToday(state)) s.counter++;
      return;
    case 'waterWheel': {
      // A simple counter: days a lodge by the river felled a tree.
      const within = param(predicateParams(def.condition, 'lodgeByRiver') ?? [], 'within', 12);
      if (hour === LAST_HOUR && riverLodgeWorkedToday(state, within)) s.counter++;
      return;
    }
    case 'portersBusyDays': {
      const streak = Math.floor(s.counter / STREAK);
      const sum = s.counter % STREAK;
      if (hour >= WORK_HOURS[0] && hour < WORK_HOURS[1]) {
        s.counter = streak * STREAK + sum + porterBusyPercent(state);
      } else if (hour === WORK_HOURS[1]) {
        const percent = param(predicateParams(def.condition, 'portersBusy') ?? [], 'percent', 80);
        s.counter = (sum >= percent * WORK_SAMPLES ? streak + 1 : 0) * STREAK;
      }
      return;
    }
    default:
      return;
  }
}

function share(value: number, target: number): number {
  return target <= 0 ? 100 : Math.max(0, Math.min(100, Math.floor((value * 100) / target)));
}

/** The notebook bar for an innovation, 0 to 100 (100 only once it is in). */
export function measureProgress(state: WorldState, def: InnovationDef, s: InnovationState): number {
  if (s.unlockedTick >= 0) return 100;
  const p = (code: string, name: string, fallback: number) =>
    param(predicateParams(def.condition, code) ?? [], name, fallback);
  let v: number;
  switch (def.measure) {
    case 'quarryDays':
      v = share(s.counter, p('quarryWorked', 'days', 2));
      break;
    case 'timberRate':
      v = share(yesterday(state, 'timber'), p('timberRate', 'perDay', 20));
      break;
    case 'stoneRate':
      v = share(yesterday(state, 'stone'), p('stoneRate', 'perDay', 20));
      break;
    case 'portersBusyDays': {
      const days = p('portersBusy', 'days', 3);
      const today = (s.counter % STREAK) / (p('portersBusy', 'percent', 80) * WORK_SAMPLES);
      v = share(Math.floor(s.counter / STREAK) + Math.min(0.99, today), days);
      break;
    }
    case 'waterWheel': {
      const story = predicateParams(def.condition, 'storyStep') ?? [];
      const arc = predicateRef(def.condition, 'storyStep');
      const days = share(s.counter, p('lodgeByRiver', 'days', 3));
      v = storyStep(state, null, story, arc) ? 100 : days;
      break;
    }
    default:
      v = 0;
  }
  // The bar fills when the condition holds; the unlock lands on the same pass.
  return Math.min(99, v);
}
