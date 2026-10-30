// What the build and decor pickers offer in this valley: buildings its mode allows (grouped for the
// picker), decor with its Pattern Book lock, and the client-side cost check that explains a refusal
// before the sim has to.
import { content, type BuildingDef, type Cost, type DecorDef, type ValleyMode } from '@qoti/content';
import { PENNIES_PER_COIN, type Lens, type RejectReason } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { RANK_WORD, rankAtLeast } from '../ui/village';

export type BuildingGroup = 'homes' | 'food' | 'materials' | 'services';

export const GROUP_LABEL: Record<BuildingGroup, string> = {
  homes: 'Homes',
  food: 'Food',
  materials: 'Materials',
  services: 'Services',
};

const GROUP_ORDER: BuildingGroup[] = ['homes', 'food', 'materials', 'services'];

/** Makes goods (or plants the trees others fell): a link in some production chain. */
function isProducer(def: BuildingDef): boolean {
  return (def.methods ?? []).some(
    (m) => m.kind === 'plant' || m.outputs.some(([g]) => content.goodIndex.has(g)),
  );
}

/** Serves the town rather than making goods: water, selling, schooling, a pint, a remedy. */
function isService(def: BuildingDef): boolean {
  return (def.coverage ?? []).some((c) => c.kind !== 'logistics') || !isProducer(def);
}

let chainGroups: Map<string, BuildingGroup> | null = null;

/**
 * Playtest round six: producers are grouped by the chain they belong to, so a chain is never split
 * across tabs: one that ends in something folk eat is Food (bread, cider, cheese), the rest are
 * Materials (timber, bricks, cloth).
 */
function groupOfChain(def: BuildingDef): BuildingGroup {
  if (!chainGroups) {
    chainGroups = new Map();
    const producers = content.buildings.filter(
      (d) => d.category !== 'home' && !isService(d) && (!d.grows || !!d.grows.handPlaced),
    );
    for (const chain of chainsOf(producers)) {
      const all = chain.columns.flat();
      const food = all.some((d) => outputsOf(d).some((g) => content.goodById.get(g)?.food));
      for (const d of all) chainGroups.set(d.id, food ? 'food' : 'materials');
    }
  }
  return chainGroups.get(def.id) ?? 'materials';
}

export function buildingGroup(def: BuildingDef): BuildingGroup {
  if (def.category === 'home') return 'homes';
  if (isService(def)) return 'services';
  return groupOfChain(def);
}

/** Buildings the picker offers: the valley mode's, and in the Hearth lens only the homely ones. */
export function buildingChoices(mode: ValleyMode, lens: Lens): BuildingDef[] {
  return (
    content.buildings
      .filter((d) => !d.modes || d.modes.includes(mode))
      // I2 (C4C): grown-only defs (shops, workshops, farmsteads, townhouses) come up on lots.
      .filter((d) => mode !== 'standard' || !d.grows || !!d.grows.handPlaced)
      .filter((d) => lens === 'ledger' || d.lane !== 'ledger')
      .sort(
        (a, b) =>
          GROUP_ORDER.indexOf(buildingGroup(a)) - GROUP_ORDER.indexOf(buildingGroup(b)) ||
          (a.cost?.coins ?? 0) - (b.cost?.coins ?? 0) ||
          a.name.localeCompare(b.name),
      )
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

/**
 * Playtest round six: why a building cannot be placed yet, or null when it can. `rank` locks hide
 * the building from the picker (it waits for a later rank); `built` and `innovation` locks show it
 * greyed with the reason, so the next step of a chain is in sight.
 */
export interface BuildingLock {
  kind: 'rank' | 'innovation' | 'built';
  text: string;
}

/** Built buildings of a def in the valley (sites do not count). */
export function builtCount(m: Mirror, def: string): number {
  let n = 0;
  for (const b of m.buildings.values()) if (b.def === def && b.stage === 'built') n++;
  return n;
}

export function buildingLock(m: Mirror, def: BuildingDef): BuildingLock | null {
  const req = def.requires;
  if (!req || m.settings.value.mode !== 'standard') return null;
  const rank = m.town.value?.rank;
  if (req.rank && !rankAtLeast(rank, req.rank))
    return { kind: 'rank', text: `At ${RANK_WORD[req.rank]} rank` };
  if (req.innovation && !m.innovations.get(req.innovation)?.unlocked && !unlockedIds(m).has(def.id)) {
    const name = m.innovations.get(req.innovation)?.name ?? content.innovationById.get(req.innovation)?.name;
    return { kind: 'innovation', text: `Needs the ${name ?? req.innovation} innovation` };
  }
  const missing: string[] = [];
  for (const [id, count] of req.built ?? []) {
    const have = builtCount(m, id);
    if (have >= count) continue;
    const name = (content.buildingById.get(id)?.name ?? id).toLowerCase();
    missing.push(count === 1 ? `a ${name}` : `${count} ${name}s (${have} so far)`);
  }
  return missing.length ? { kind: 'built', text: `After ${missing.join(' and ')}` } : null;
}

/**
 * Playtest round six: a group's buildings as production chains. Buildings that hand goods to each
 * other (one's output is another's input) share a chain; within it, columns run from the
 * buildings that start from nothing to the ones that finish the goods. Each step names the goods
 * that flow on to the next column.
 */
export interface Chain {
  /** Columns, first to last; each is the buildings at that step. */
  columns: BuildingDef[][];
  /** Goods flowing from column i to column i + 1. */
  flows: string[][];
  /** What the chain ends in, for its label: the goods its last column makes. */
  makes: string[];
}

function outputsOf(d: BuildingDef): string[] {
  return (d.methods ?? []).flatMap((m) => m.outputs.map(([g]) => g));
}

export function inputsOf(d: BuildingDef): string[] {
  return (d.methods ?? []).flatMap((m) => m.inputs.map(([g]) => g));
}

export function chainsOf(defs: readonly BuildingDef[]): Chain[] {
  // A forester feeds the woodcutters (it plants what they fell), though no goods change hands.
  const plants = (d: BuildingDef) => (d.methods ?? []).some((m) => m.kind === 'plant');
  const fells = (d: BuildingDef) => (d.methods ?? []).some((m) => m.kind === 'fell');
  const supplies = (a: BuildingDef, b: BuildingDef) =>
    a !== b && outputsOf(a).some((g) => inputsOf(b).includes(g));
  const feeds = (a: BuildingDef, b: BuildingDef) => supplies(a, b) || (a !== b && plants(a) && fells(b));
  // Connected groups, in the order their first building comes.
  const seen = new Set<BuildingDef>();
  const groups: BuildingDef[][] = [];
  for (const d of defs) {
    if (seen.has(d)) continue;
    const group: BuildingDef[] = [];
    const stack = [d];
    seen.add(d);
    while (stack.length) {
      const x = stack.pop()!;
      group.push(x);
      for (const y of defs) {
        if (seen.has(y) || !(feeds(x, y) || feeds(y, x))) continue;
        seen.add(y);
        stack.push(y);
      }
    }
    groups.push(defs.filter((x) => group.includes(x)));
  }
  return groups.map((group) => {
    // Step: the longest run of suppliers before a building (cycles are cut by the visit guard).
    const depth = new Map<BuildingDef, number>();
    const step = (d: BuildingDef, guard: Set<BuildingDef>): number => {
      const known = depth.get(d);
      if (known !== undefined) return known;
      if (guard.has(d)) return 0;
      guard.add(d);
      let n = 0;
      for (const s of group) if (supplies(s, d)) n = Math.max(n, step(s, guard) + 1);
      // A forester stands beside the woodcutters it plants for.
      if (plants(d)) for (const w of group) if (fells(w)) n = Math.max(n, step(w, guard));
      guard.delete(d);
      depth.set(d, n);
      return n;
    };
    for (const d of group) step(d, new Set());
    const last = Math.max(...group.map((d) => depth.get(d)!));
    const columns: BuildingDef[][] = [];
    for (let i = 0; i <= last; i++) columns.push(group.filter((d) => depth.get(d) === i));
    const flows: string[][] = [];
    for (let i = 0; i < last; i++) {
      const goods = new Set<string>();
      for (const a of columns[i]!)
        for (const b of columns[i + 1]!)
          for (const g of outputsOf(a)) if (inputsOf(b).includes(g)) goods.add(g);
      flows.push([...goods]);
    }
    return { columns, flows, makes: [...new Set(columns[last]!.flatMap(outputsOf))] };
  });
}
