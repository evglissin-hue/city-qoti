// Labor for the autoplayer (C4X): how many hands the town has and how many jobs its buildings
// already ask for, so the players only open a new workplace when someone can work it. Without this
// the Ledger kept answering "too little food" with another fishers' hut nobody could staff, which
// only spread the same hands thinner (a Village run had 46 food jobs for 67 workers).
// R1.0: labor needs no lever (docs/spec/13-ledger.md, Labor): the autoplayer never pauses a
// building to move hands about. It only reads the jobs here before opening a new one; a business's
// jobs are its trade's crew at its level (`jobsOf`).
import { content } from '@qoti/content';
import { BuildingStatus, jobsOf, townStock, type Building, type WorldState } from '@qoti/sim';

/**
 * The labor budget's reserve (C5.0, the planner's): a new workplace opens only while free hands
 * exceed core jobs by this many, unless the want is pressing.
 */
export const LABOR_RESERVE = 1;

/** Residents who can take a job: young and adult, not retired. */
export function hands(w: WorldState): number {
  let n = 0;
  for (const r of w.residents) if ((r.stage === 'young' || r.stage === 'adult') && !r.retired) n++;
  return n;
}

/** A building that hires nobody as things stand (the sim ranks its jobs last). */
const STUCK = BuildingStatus.noTrees | BuildingStatus.noFields | BuildingStatus.missingInput;

/**
 * Jobs that matter, for every building standing or going up: a porter or builder crew counts its
 * first two (the rest are spare hands the sim fills last), every other job counts in full. A
 * paused building, or an empty one that is stuck (no inputs, trees or fields), asks for nobody.
 */
export function coreJobs(w: WorldState): number {
  let n = 0;
  for (const b of w.buildings) if (asks(b)) n += core(b);
  return n;
}

function asks(b: Building): boolean {
  const rt = b.rt;
  if (b.stage !== 'built' || !rt) return true;
  if (rt.paused) return false;
  return rt.workers.length > 0 || (rt.status & STUCK) === 0;
}

/** Hands left over once every core job is filled (negative when the town is short of workers). */
export function spareHands(w: WorldState): number {
  return hands(w) - coreJobs(w);
}

/** Core jobs of a def, or of a standing building (a business by its trade's crew; see coreJobs). */
function core(b: string | Pick<Building, 'def' | 'trade' | 'level'>): number {
  const def = typeof b === 'string' ? b : b.def;
  const role = content.buildingById.get(def)?.jobs?.role;
  if (!role) return 0;
  const count = typeof b === 'string' ? jobsOf({ def: b }) : jobsOf(b);
  return role === 'porter' || role === 'builder' ? Math.min(2, count) : count;
}

/**
 * Open core jobs at standing buildings of a def: no point building another while these sit empty
 * (a stuck one does not count: a Forester's Lodge that has felled its wood must be replaced).
 */
export function vacancies(w: WorldState, def: string): number {
  let n = 0;
  for (const b of w.buildings)
    if (b.def === def && b.stage === 'built' && b.rt && asks(b))
      n += Math.max(0, core(b) - b.rt.workers.length);
  return n;
}

/**
 * Building materials the town is short of make their producers pressing too: without timber and
 * stone nothing else gets built, so a lodge or quarry may draw hands the way a food building does.
 */
export function materialsPressing(w: WorldState, def: string): boolean {
  const stock = townStock(w);
  const g = (id: string) => stock[content.goodIndex.get(id)!]!;
  if (def === 'quarry') return g('stone') < 30;
  if (def === 'foresters-lodge') return g('timber') < 30;
  return false;
}

/**
 * Whether a new `def` can be staffed: it has no jobs, it is the first of its kind, or the town has
 * the hands for its first job and the ones already standing are full.
 */
export function canStaff(w: WorldState, def: string, pressing = false): boolean {
  const jobs = content.buildingById.get(def)?.jobs;
  if (!jobs) return true;
  // Porters come first: without them nothing reaches a shelf, a site or a workshop.
  if (jobs.role === 'porter') return true;
  if (!w.buildings.some((b) => b.def === def)) return true;
  if (vacancies(w, def) > 0) return false;
  // Pressing needs (food the town is short of) may draw a hand from spare porters: the sim gives a
  // workplace's first job before a storehouse's third porter.
  return pressing || spareHands(w) >= LABOR_RESERVE;
}
