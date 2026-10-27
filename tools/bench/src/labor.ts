// Labor for the autoplayer (C4X): how many hands the town has and how many jobs its buildings
// already ask for, so the players only open a new workplace when someone can work it. Without this
// the Ledger kept answering "too little food" with another fishers' hut nobody could staff, which
// only spread the same hands thinner (a Village run had 46 food jobs for 67 workers).
import { content } from '@qoti/content';
import { BuildingStatus, townStock, type Building, type WorldState } from '@qoti/sim';

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
  for (const b of w.buildings) if (asks(b)) n += core(b.def);
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

/** Core jobs of a def (see coreJobs). */
function core(def: string): number {
  const jobs = content.buildingById.get(def)?.jobs;
  if (!jobs) return 0;
  return jobs.role === 'porter' || jobs.role === 'builder' ? Math.min(2, jobs.count) : jobs.count;
}

/** Open core jobs at standing buildings of a def: no point building another while these sit empty. */
export function vacancies(w: WorldState, def: string): number {
  const n0 = core(def);
  let n = 0;
  for (const b of w.buildings)
    if (b.def === def && b.stage === 'built' && b.rt) n += Math.max(0, n0 - b.rt.workers.length);
  return n;
}

/**
 * Building materials the town is short of make their producers pressing too: without stone and
 * planks nothing else gets built, so a quarry may draw hands the way a food building does.
 */
export function materialsPressing(w: WorldState, def: string): boolean {
  const stock = townStock(w);
  const g = (id: string) => stock[content.goodIndex.get(id)!]!;
  if (def === 'quarry') return g('stone') < 30;
  if (def === 'sawpit') return g('planks') < 30;
  if (def === 'woodcutter') return g('logs') < 20;
  return false;
}

/**
 * Whether a new `def` can be staffed: it has no jobs, it is the first of its kind (a clay pit must
 * dig once to invent the kiln), or the town has the hands for its first job and the ones already
 * standing are full.
 */
export function canStaff(w: WorldState, def: string, pressing = false): boolean {
  const jobs = content.buildingById.get(def)?.jobs;
  if (!jobs) return true;
  // Porters come first: without them nothing reaches a shelf, a site or a sawpit.
  if (jobs.role === 'porter') return true;
  if (!w.buildings.some((b) => b.def === def)) return true;
  if (vacancies(w, def) > 0) return false;
  // Pressing needs (food the town is short of) may draw a hand from spare porters: the sim gives a
  // workplace's first job before a storehouse's third porter.
  return pressing || spareHands(w) >= 1;
}
