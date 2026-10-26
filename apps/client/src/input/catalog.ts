// What the build and decor pickers offer in this valley: buildings its mode allows (grouped for the
// picker), decor with its Pattern Book lock, and the client-side cost check that explains a refusal
// before the sim has to.
import { content, type BuildingDef, type Cost, type DecorDef, type ValleyMode } from '@qoti/content';
import { PENNIES_PER_COIN, type Lens, type RejectReason } from '@qoti/sim';
import type { Mirror } from '../state/mirror';

export type BuildingGroup = 'homes' | 'food' | 'materials' | 'services';

export const GROUP_LABEL: Record<BuildingGroup, string> = {
  homes: 'Homes',
  food: 'Food',
  materials: 'Materials',
  services: 'Services',
};

const GROUP_ORDER: BuildingGroup[] = ['homes', 'food', 'materials', 'services'];

export function buildingGroup(def: BuildingDef): BuildingGroup {
  if (def.category === 'home') return 'homes';
  const method = def.methods?.[0];
  const goods = [...(method?.outputs ?? []), ...(method?.inputs ?? [])].map(([g]) => g);
  const foodish = goods.some((g) => content.goodById.get(g)?.food || g === 'wheat' || g === 'flour');
  if (foodish || def.tags?.includes('outlet') || def.tags?.includes('farm')) return 'food';
  if (method) return 'materials';
  return 'services';
}

/** Buildings the picker offers: the valley mode's, and in the Hearth lens only the homely ones. */
export function buildingChoices(mode: ValleyMode, lens: Lens): BuildingDef[] {
  return content.buildings
    .filter((d) => !d.modes || d.modes.includes(mode))
    .filter((d) => lens === 'ledger' || d.lane !== 'ledger')
    .sort(
      (a, b) =>
        GROUP_ORDER.indexOf(buildingGroup(a)) - GROUP_ORDER.indexOf(buildingGroup(b)) ||
        (a.cost?.coins ?? 0) - (b.cost?.coins ?? 0) ||
        a.name.localeCompare(b.name),
    );
}

export function groupsOf(defs: readonly BuildingDef[]): BuildingGroup[] {
  return GROUP_ORDER.filter((g) => defs.some((d) => buildingGroup(d) === g));
}

/** Unlocked content ids (town view), plus everything when the valley is creative. */
export function unlockedIds(m: Mirror): ReadonlySet<string> {
  return new Set(m.town.value?.unlocked ?? []);
}

export type DecorGroup = 'seats' | 'lights' | 'greenery' | 'water' | 'odds';

export const DECOR_GROUP_LABEL: Record<DecorGroup, string> = {
  seats: 'Seats',
  lights: 'Lights',
  greenery: 'Greenery',
  water: 'By the water',
  odds: 'Odds and ends',
};

const DECOR_GROUP_ORDER: DecorGroup[] = ['seats', 'lights', 'greenery', 'water', 'odds'];

export function decorGroup(def: DecorDef): DecorGroup {
  const t = def.tags;
  if (t.includes('seat') && !t.includes('wall')) return 'seats';
  if (t.includes('light')) return 'lights';
  if (t.includes('water-feature') || t.includes('mooring')) return 'water';
  if (['tree', 'flower', 'planter', 'hedge', 'verge', 'herb'].some((x) => t.includes(x))) return 'greenery';
  return 'odds';
}

export function decorGroupsOf(choices: readonly DecorChoice[]): DecorGroup[] {
  return DECOR_GROUP_ORDER.filter((g) => choices.some((c) => decorGroup(c.def) === g));
}

export interface DecorChoice {
  def: DecorDef;
  locked: boolean;
  /** Why it is locked: the hint of the pattern that unlocks it, when that hint is showing. */
  hint: string;
}

/** Decor the picker offers: Pattern Book pieces stay locked in standard valleys until found. */
export function decorChoices(m: Mirror, lens: Lens, linear: boolean): DecorChoice[] {
  const standard = m.settings.value.mode === 'standard';
  const unlocked = unlockedIds(m);
  return content.decor
    .filter((d) => !!d.linear === linear)
    .filter((d) => lens === 'hearth' || d.lane !== 'hearth' || linear)
    .map((def) => {
      const locked = standard && !!def.locked && !unlocked.has(def.id);
      return { def, locked, hint: locked ? lockHint(m, def.id) : '' };
    })
    .sort((a, b) => Number(a.locked) - Number(b.locked));
}

/** "Found in the Pattern Book: <hint>" for a locked piece. */
export function lockHint(m: Mirror, id: string): string {
  const pattern = content.patterns.find((p) => p.unlocks.includes(id));
  if (!pattern) return 'Unlocked by something in the valley, in time.';
  const view = m.patterns.get(pattern.id);
  if (view?.hinted) return `Unlocks with a page of the Pattern Book. Hint: ${pattern.hint}`;
  return 'Unlocks with a page of the Pattern Book nobody has a hint for yet.';
}

/**
 * Standard valleys only: LEAN_TIMES while the treasury is below zero, CANNOT_AFFORD when the coins
 * are not there. Materials are requested after placement, so they never block it.
 */
export function costBlock(m: Mirror, cost: Cost | undefined): RejectReason | null {
  if (m.settings.value.mode !== 'standard') return null;
  const treasury = m.budget.value?.treasury ?? m.town.value?.treasury;
  if (treasury === undefined) return null;
  if (treasury < 0 || m.budget.value?.leanTimes) return 'LEAN_TIMES';
  if ((cost?.coins ?? 0) * PENNIES_PER_COIN > treasury) return 'CANNOT_AFFORD';
  return null;
}
