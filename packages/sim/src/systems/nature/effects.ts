// What nature does (C5C; docs/spec/12-hearth.md, Nature and the Field Guide), through the yield hook
// only, never by editing production: the pollinator score of a crop grower's chunk raises its yield
// by up to POLLINATOR_BONUS, an apiary's honey follows the flowers around it, and in summer pests
// take up to PEST_MAX of a crop grower's yield, cut by the songbirds, frogs and friends (species with
// a 'pests' effect) that are in the Field Guide and whose habitat the farm's chunk still offers.
import { content, type BuildingDef, type ProductionMethod, type WildlifeDef } from '@qoti/content';
import { HABITAT_IDS } from '../../constants';
import type { Building, EntityId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { seasonAt } from '../../state/seasons';
import { rankAtLeast } from '../../state/village';
import { buildingChunk, scoreAt } from './habitats';

/** Pollinator score at which the bonus is full. */
export const POLLINATOR_FULL = 200;
/** Most a crop grower gains from pollinators, permille. */
export const POLLINATOR_BONUS = 200;
/** An apiary with no flowers about still makes this share of its honey, permille. */
export const HIVE_FLOOR = 250;
/** Most summer pests take from a crop grower, permille. */
export const PEST_MAX = 150;
export const SUMMER = 1;

const CROP_GOODS: ReadonlySet<string> = new Set(['apples', 'herbs', 'vegetables', 'wheat']);

/** Farms, orchards, plots and herb gardens: anything whose yield bees and pests care about. */
export function isCropMethod(method: ProductionMethod | undefined): boolean {
  if (!method) return false;
  if (method.kind === 'farm') return true;
  return method.kind === 'gather' && method.outputs.some(([g]) => CROP_GOODS.has(g));
}

export function isCropGrower(def: BuildingDef | undefined): boolean {
  return !!def?.methods?.some(isCropMethod);
}

export function isHive(def: BuildingDef | undefined): boolean {
  return !!def?.tags?.includes('hive');
}

const POLLINATOR = (HABITAT_IDS as readonly string[]).indexOf('pollinator');

function pollinatorScore(state: WorldState, b: Building): number {
  return Math.min(POLLINATOR_FULL, scoreAt(state, POLLINATOR, buildingChunk(b)));
}

/**
 * Permille on a building's crop or honey yield from the bees about (1000 = no effect). From Village
 * rank, like the pests: a Hamlet's handful of plots is too small for either to notice (and the I2
 * Hamlet's pace stays as tuned; with bees from the first day the autoplayer reached Village a season
 * later on five seeds of eight).
 */
export function pollinatorPermille(state: WorldState, b: Building, def: BuildingDef | undefined): number {
  if (!rankAtLeast(state, 'village')) return 1000;
  if (isHive(def))
    return HIVE_FLOOR + Math.floor(((1000 - HIVE_FLOOR) * pollinatorScore(state, b)) / POLLINATOR_FULL);
  if (!isCropGrower(def)) return 1000;
  return 1000 + Math.floor((POLLINATOR_BONUS * pollinatorScore(state, b)) / POLLINATOR_FULL);
}

/** Yield hook: pollinators. */
export function pollinators(
  state: WorldState,
  b: Building,
  def: BuildingDef,
  method: ProductionMethod,
): number {
  if (isHive(def)) return pollinatorPermille(state, b, def);
  return isCropMethod(method) ? pollinatorPermille(state, b, def) : 1000;
}

/** Yield hook: summer pests (computed each morning into nature.pests). */
export function pests(state: WorldState, b: Building, _def: BuildingDef, method: ProductionMethod): number {
  if (!isCropMethod(method)) return 1000;
  const loss = state.nature.pests.find(([id]) => id === b.id)?.[1] ?? 0;
  return 1000 - loss;
}

/** The species' habitat needs are met in chunk c. */
export function habitatMet(state: WorldState, def: WildlifeDef, c: number): boolean {
  for (const [h, min] of def.habitats) {
    if (scoreAt(state, (HABITAT_IDS as readonly string[]).indexOf(h), c) < min) return false;
  }
  return true;
}

function effectOf(def: WildlifeDef, name: string): number {
  return def.effect?.find(([n]) => n === name)?.[1] ?? 0;
}

/** Pests on one crop grower today, permille of its yield. */
export function pestLossFor(state: WorldState, b: Building): number {
  const c = buildingChunk(b);
  let cut = 0;
  for (const e of state.nature.guide) {
    const def = content.wildlifeById.get(e.species);
    if (!def) continue;
    const n = effectOf(def, 'pests');
    if (n > 0 && habitatMet(state, def, c)) cut += n;
  }
  return Math.floor((PEST_MAX * (1000 - Math.min(1000, cut))) / 1000);
}

/**
 * Each morning: pests per crop grower in summer, none otherwise. A Hamlet's few plots are beneath a
 * pest's notice: they come from Village rank on, when the habitats that keep them down can be built.
 */
export function updatePests(state: WorldState): void {
  if (seasonAt(state.tick).season !== SUMMER || !rankAtLeast(state, 'village')) {
    state.nature.pests = [];
    return;
  }
  const out: [EntityId, number][] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt) continue;
    if (!isCropGrower(content.buildingById.get(b.def))) continue;
    out.push([b.id, pestLossFor(state, b)]);
  }
  out.sort((a, b) => a[0] - b[0]);
  state.nature.pests = out;
}

/** API: permille factor from pollinators on a building (1000 = none). */
export function pollinatorFactorOf(state: WorldState, buildingId: number): number {
  const b = findById(state.buildings, buildingId);
  return b ? pollinatorPermille(state, b, content.buildingById.get(b.def)) : 1000;
}
