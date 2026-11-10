// What the build and decor pickers offer in this valley: buildings its mode allows (grouped for the
// picker), decor with its Pattern Book lock, and the client-side cost check that explains a refusal
// before the sim has to.
import { content, type BuildingDef, type Cost, type DecorDef, type ValleyMode } from '@qoti/content';
import { countsAsBuilt, PENNIES_PER_COIN, type Lens, type RejectReason } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { currentFestivalPlan } from '../ui/seasons';
import { RANK_WORD, rankAtLeast } from '../ui/village';

export type BuildingGroup = 'homes' | 'workplaces' | 'services';

export const GROUP_LABEL: Record<BuildingGroup, string> = {
  homes: 'Homes',
  workplaces: 'Workplaces',
  services: 'Services',
};

const GROUP_ORDER: BuildingGroup[] = ['homes', 'workplaces', 'services'];

/** Makes goods (or fells the trees): the apiary and the specialized buildings that make something. */
function isProducer(def: BuildingDef): boolean {
  return (def.methods ?? []).some((m) => m.outputs.length > 0 || m.kind === 'fell' || m.kind === 'plant');
}

/**
 * R1.0 stand-in until R1C's three shelves: homes, then the specialized buildings (and the apiary,
 * which makes honey) as Workplaces, then everything that serves the town.
 */
export function buildingGroup(def: BuildingDef): BuildingGroup {
  if (def.category === 'home') return 'homes';
  if (def.specialized || isProducer(def)) return 'workplaces';
  return 'services';
}

/**
 * P1 (playtest): true when a standard valley has lost its town hall (saves from before the hall was
 * kept), so the picker offers a replacement the townsfolk raise at once.
 */
export function lostTownHall(m: Pick<Mirror, 'buildings' | 'settings'>): boolean {
  if (m.settings.value.mode !== 'standard') return false;
  for (const b of m.buildings.values()) if (b.def === 'town-hall') return false;
  return true;
}

/**
 * Buildings the picker offers: the valley mode's, and in the Hearth lens only the homely ones.
 * `raiseHall` adds the town hall to a standard valley that has lost its own (P1).
 */
export function buildingChoices(mode: ValleyMode, lens: Lens, raiseHall = false): BuildingDef[] {
  return (
    content.buildings
      .filter((d) => !d.modes || d.modes.includes(mode) || (raiseHall && d.id === 'town-hall'))
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

/** True while this season's festival has a plan (the sim's currentPlan). */
export function festivalPlanned(m: Mirror): boolean {
  return currentFestivalPlan(m.festival.value, m.tick.value) !== null;
}

/** Unlocked content ids (town view), plus everything when the valley is creative. */
export function unlockedIds(m: Mirror): ReadonlySet<string> {
  return new Set(m.town.value?.unlocked ?? []);
}

export type DecorGroup = 'festival' | 'seats' | 'lights' | 'greenery' | 'water' | 'odds';

export const DECOR_GROUP_LABEL: Record<DecorGroup, string> = {
  festival: 'Festival',
  seats: 'Seats',
  lights: 'Lights',
  greenery: 'Greenery',
  water: 'By the water',
  odds: 'Odds and ends',
};

const DECOR_GROUP_ORDER: DecorGroup[] = ['festival', 'seats', 'lights', 'greenery', 'water', 'odds'];

export function decorGroup(def: DecorDef): DecorGroup {
  const t = def.tags;
  if (t.includes('seat') && !t.includes('wall')) return 'seats';
  if (t.includes('light')) return 'lights';
  if (t.includes('water-feature') || t.includes('mooring')) return 'water';
  if (['tree', 'flower', 'planter', 'hedge', 'verge', 'herb'].some((x) => t.includes(x))) return 'greenery';
  return 'odds';
}

/** The picker group of a choice: festival pieces on offer for this season's plan go in their own. */
export function choiceGroup(c: DecorChoice): DecorGroup {
  return c.festival ? 'festival' : decorGroup(c.def);
}

export function decorGroupsOf(choices: readonly DecorChoice[]): DecorGroup[] {
  return DECOR_GROUP_ORDER.filter((g) => choices.some((c) => choiceGroup(c) === g));
}

export interface DecorChoice {
  def: DecorDef;
  locked: boolean;
  /** Why it is locked: the hint of the pattern that unlocks it, when that hint is showing. */
  hint: string;
  /** A festival piece on offer because this season's festival is planned (the sim's rule). */
  festival?: boolean;
}

/** Decor the picker offers: Pattern Book pieces stay locked in standard valleys until found. */
export function decorChoices(m: Mirror, lens: Lens, linear: boolean): DecorChoice[] {
  const standard = m.settings.value.mode === 'standard';
  const unlocked = unlockedIds(m);
  const planned = festivalPlanned(m);
  return content.decor
    .filter((d) => !!d.linear === linear)
    .filter((d) => lens === 'hearth' || d.lane !== 'hearth' || linear)
    .map((def): DecorChoice => {
      // The sim's rule (commands/decor.ts lockedReason): festival pieces are open while this
      // season's festival is planned.
      const festival = standard && !!def.festival && planned;
      const locked = standard && !!def.locked && !unlocked.has(def.id) && !festival;
      const hint = !locked ? '' : def.festival ? FESTIVAL_LOCK : lockHint(m, def.id);
      return { def, locked, hint, ...(festival && { festival }) };
    })
    .sort((a, b) => Number(a.locked) - Number(b.locked));
}

/** P1 (player's chair): festival pieces come out with a festival plan, not from the Pattern Book. */
export const FESTIVAL_LOCK =
  'Out for festivals: plan one in the Festival book and these come out of the shed.';

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

/** Built buildings of a def in the valley, upgrades included (sites do not count), as the sim counts them. */
export function builtCount(m: Mirror, def: string): number {
  let n = 0;
  for (const b of m.buildings.values()) if (b.stage === 'built' && countsAsBuilt(b.def, def)) n++;
  return n;
}

/**
 * P1 (playtest item 13): the buildings the picker may tease as "At Town rank: ...". A rank whose
 * Charter does not exist in content (Town, for now) is a dead end for players, so it is not teased.
 */
export function teasableLater(defs: readonly BuildingDef[]): BuildingDef[] {
  return defs.filter((d) => d.requires?.rank && content.charters.some((c) => c.rank === d.requires!.rank));
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
  // I3 (C5A): a story's reward (Mother Thornbury's cottage).
  if (req.story && !unlockedIds(m).has(def.id)) return { kind: 'innovation', text: 'A story will unlock it' };
  const missing: string[] = [];
  for (const [id, count] of req.built ?? []) {
    const have = builtCount(m, id);
    if (have >= count) continue;
    const name = (content.buildingById.get(id)?.name ?? id).toLowerCase();
    missing.push(count === 1 ? `a ${name}` : `${count} ${name}s (${have} so far)`);
  }
  return missing.length ? { kind: 'built', text: `After ${missing.join(' and ')}` } : null;
}
