// I1 view builders (C3.0). Their output never feeds back into state, so floats are fine here.
// Tracks may enrich these (C3A residents, C3B Hearth, C3C Ledger) without changing their shapes.
import { type Condition, content } from '@qoti/content';
import { LEDGER_CATEGORIES, MAP_SIZE, MOOD_BAND_MIN } from '../constants';
import type {
  AchievementView,
  BudgetLine,
  BudgetView,
  Building,
  BuildingRuntime,
  BuildingRuntimeView,
  ChronicleEntry,
  ChronicleEntryView,
  EntityId,
  Household,
  HouseholdView,
  LedgerPeriod,
  MoodBand,
  PatternView,
  Resident,
  ResidentView,
  StocksView,
  TownView,
  Wish,
  WishView,
  WorkforceView,
  WorldState,
} from '../contracts';
import { footprintSize } from '../rules/footprint';
import { findById } from '../state/entities';
import { cycleWork } from '../systems/production/cycle';

export function moodBand(mood: number): MoodBand {
  let band = 0;
  for (let i = 0; i < MOOD_BAND_MIN.length; i++) if (mood >= MOOD_BAND_MIN[i]!) band = i + 1;
  return band as MoodBand;
}

/** "Clover Thistledown". */
export function residentName(r: Pick<Resident, 'given' | 'family'>): string {
  return `${r.given} ${r.family}`;
}

export function residentView(state: WorldState, r: Resident): ResidentView {
  const h = findById(state.households, r.householdId);
  return {
    id: r.id,
    given: r.given,
    family: r.family,
    species: r.species,
    stage: r.stage,
    traits: [...r.traits],
    householdId: r.householdId,
    homeId: h?.homeId ?? 0,
    jobId: r.jobId,
    tier: r.tier,
    wishId: r.wishId,
    moodBand: moodBand(r.mood),
    bond: r.bond,
    look: r.look,
    flags: r.flags,
  };
}

export function householdView(h: Household): HouseholdView {
  let food = 0;
  for (let i = 0; i < content.goods.length; i++) if (content.goods[i]!.food) food += h.pantry[i] ?? 0;
  return {
    id: h.id,
    family: h.family,
    members: [...h.members],
    homeId: h.homeId,
    tier: h.tier,
    pantryFood: food,
  };
}

/** Nonzero entries of a per-good array as [good id, qty]. */
export function goodPairs(values: readonly number[]): [string, number][] {
  const out: [string, number][] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v) out.push([content.goods[i]?.id ?? `good-${i}`, v]);
  }
  return out;
}

/** 0 staked, 1 foundation, 2 frame, 3 roof, from materials delivered and work done. */
export function constructionStage(rt: BuildingRuntime): 0 | 1 | 2 | 3 {
  const c = rt.construction;
  if (!c) return 3;
  const p = constructionProgress(rt);
  return p < 0.15 ? 0 : p < 0.45 ? 1 : p < 0.8 ? 2 : 3;
}

/** 0 to 1: half materials delivered, half work done. */
export function constructionProgress(rt: BuildingRuntime): number {
  const c = rt.construction;
  if (!c) return 1;
  let need = 0;
  let got = 0;
  for (let i = 0; i < c.needs.length; i++) {
    need += c.needs[i]! + c.delivered[i]!;
    got += c.delivered[i]!;
  }
  const mats = need > 0 ? got / need : 1;
  const work = c.work > 0 ? c.workDone / c.work : 1;
  return Math.min(1, 0.5 * mats + 0.5 * work);
}

export function runtimeView(defId: string, rt: BuildingRuntime): BuildingRuntimeView {
  const def = content.buildingById.get(defId);
  const method = def?.methods?.[rt.method];
  // Farms keep the average ripeness of their tended fields (0 to 255) as progress.
  const cycle = !method ? 0 : method.kind === 'farm' ? 255 : cycleWork(method);
  const view: BuildingRuntimeView = {
    jobs: def?.jobs?.count ?? 0,
    workers: rt.workers.length,
    present: rt.present,
    status: rt.status,
    condition: rt.condition,
    paused: rt.paused,
    progress: cycle > 0 ? Math.min(1, rt.progress / cycle) : 0,
    input: goodPairs(rt.input),
    output: goodPairs(rt.output),
    store: goodPairs(rt.store),
  };
  const c = rt.construction;
  if (c) {
    view.construction = {
      stage: constructionStage(rt),
      progress: constructionProgress(rt),
      needs: goodPairs(c.needs),
      delivered: goodPairs(c.delivered),
      priority: c.priority,
    };
  }
  return view;
}

/** Town stock per good: storehouses, stalls and output buffers. */
export function townStock(state: WorldState): number[] {
  const out = new Array<number>(content.goods.length).fill(0);
  for (const b of state.buildings) {
    const rt = b.rt;
    if (!rt || b.stage !== 'built') continue;
    for (let i = 0; i < out.length; i++) out[i]! += (rt.store[i] ?? 0) + (rt.output[i] ?? 0);
  }
  return out;
}

export function stocksView(state: WorldState): StocksView {
  const stock = townStock(state);
  const e = state.economy;
  return {
    lines: content.goods.map((g, i) => ({
      good: g.id,
      stock: stock[i]!,
      producedToday: e.today.produced[i] ?? 0,
      consumedToday: e.today.consumed[i] ?? 0,
      producedYesterday: e.yesterday.produced[i] ?? 0,
      consumedYesterday: e.yesterday.consumed[i] ?? 0,
      history: e.stockHistory.map((day) => day[i] ?? 0),
      forSale: e.forSale[i] ?? false,
    })),
  };
}

/** The Workforce report: every building with jobs, and the town's totals. */
export function workforceView(state: WorldState): WorkforceView {
  const lines: WorkforceView['lines'] = [];
  let jobs = 0;
  let employed = 0;
  for (const b of state.buildings) {
    const def = content.buildingById.get(b.def);
    const count = def?.jobs?.count ?? 0;
    if (!b.rt || count === 0) continue;
    lines.push({
      id: b.id,
      def: b.def,
      role: def!.jobs!.role,
      jobs: count,
      workers: b.rt.workers.length,
      present: b.rt.present,
    });
    if (b.stage === 'built') jobs += count;
    employed += b.rt.workers.length;
  }
  let unemployed = 0;
  for (const r of state.residents) if (!r.jobId && (r.stage === 'adult' || r.stage === 'young')) unemployed++;
  return { lines, jobs, employed, unemployed, vacancies: Math.max(0, jobs - employed) };
}

function budgetLines(p: LedgerPeriod): BudgetLine[] {
  return LEDGER_CATEGORIES.map((c, i) => ({ category: c.id, kind: c.kind, pennies: p.money[i] ?? 0 }));
}

export function budgetView(state: WorldState): BudgetView {
  const e = state.economy;
  return {
    treasury: e.treasury,
    leanTimes: e.leanTimes,
    today: budgetLines(e.today),
    yesterday: budgetLines(e.yesterday),
    season: budgetLines(e.season),
    lastSeason: e.lastSeason ? budgetLines(e.lastSeason) : null,
  };
}

/** Fills {name}, {place} and {species} in a template variant. */
export function fillText(text: string, params: readonly [string, string][]): string {
  let out = text;
  for (const [k, v] of params) out = out.split(`{${k}}`).join(v);
  return out;
}

export function wishView(state: WorldState, w: Wish): WishView {
  const t = content.wishById.get(w.template);
  const r = findById(state.residents, w.residentId);
  const home = findById(state.buildings, w.home);
  const sp = r ? content.speciesById.get(r.species) : undefined;
  const work = findById(state.buildings, w.work);
  const raw = t?.text[w.variant % Math.max(1, t.text.length)] ?? w.template;
  const text = fillText(raw, [
    ['name', r ? r.given : 'Someone'],
    ['family', r ? r.family : 'neighbor'],
    ['place', home ? (content.buildingById.get(home.def)?.name.toLowerCase() ?? 'home') : 'home'],
    ['work', work ? (content.buildingById.get(work.def)?.name.toLowerCase() ?? 'work') : 'work'],
    ['species', sp?.name.toLowerCase() ?? 'resident'],
  ]);
  return {
    id: w.id,
    template: w.template,
    residentId: w.residentId,
    text,
    lane: t?.lane ?? 'hearth',
    homeId: w.home,
    area: wishArea(state, w, t?.target),
    createdTick: w.createdTick,
    expiresTick: w.expiresTick,
  };
}

/** Center and half size of a building's footprint, in tiles. */
function buildingCenter(b: Building): { x: number; z: number; half: number } {
  const def = content.buildingById.get(b.def);
  const [fw, fd] = def ? footprintSize(def, b.rot) : [1, 1];
  return { x: b.x + fw / 2, z: b.z + fd / 2, half: Math.max(fw, fd) / 2 };
}

/**
 * The soft area a wish's target lives in, for the ghost highlight: the reach around home for
 * "near home" wishes, the commute for route wishes, the market for stock wishes.
 */
export function wishArea(state: WorldState, w: Wish, target: Condition | undefined): WishView['area'] {
  const home = findById(state.buildings, w.home);
  if (!home) return null;
  const h = buildingCenter(home);
  const around = (radius: number) => ({ x: h.x, z: h.z, radius: Math.round((h.half + radius) * 10) / 10 });
  const visit = (c: Condition | undefined): WishView['area'] | undefined => {
    if (!c) return undefined;
    if ('all' in c || 'any' in c) {
      for (const child of 'all' in c ? c.all : c.any) {
        const a = visit(child);
        if (a) return a;
      }
      return undefined;
    }
    if ('near' in c && c.near.of === 'home') return around(c.near.within);
    if ('charm' in c && c.charm.of === 'home') return around(Math.max(2, c.charm.radius ?? 0));
    if ('stock' in c && c.stock.at === 'nearestMarket') {
      const m = findById(state.buildings, w.market);
      if (!m) return null;
      const mc = buildingCenter(m);
      return { x: mc.x, z: mc.z, radius: mc.half + 1 };
    }
    if ('code' in c) {
      const job = findById(state.buildings, w.work);
      if (!job) return around(4);
      const j = buildingCenter(job);
      const dx = j.x - h.x;
      const dz = j.z - h.z;
      const half = Math.sqrt(dx * dx + dz * dz) / 2;
      return { x: (h.x + j.x) / 2, z: (h.z + j.z) / 2, radius: Math.round((half + 2) * 10) / 10 };
    }
    return undefined;
  };
  return visit(target) ?? around(4);
}

export function patternView(state: WorldState, id: string): PatternView {
  const d = state.hearth.discovered.find((p) => p.pattern === id);
  const view: PatternView = {
    id,
    discovered: !!d,
    hinted: state.hearth.hints.includes(id),
    sites: state.hearth.sites
      .filter((s) => s.pattern === id)
      .map((s) => ({
        x: s.anchor % MAP_SIZE,
        z: Math.floor(s.anchor / MAP_SIZE),
        members: [...s.members],
        tiles: [...s.tiles],
      })),
  };
  if (d) {
    view.tick = d.tick;
    view.seat = d.seat;
    view.together = d.together;
  }
  return view;
}

export function chronicleView(c: ChronicleEntry): ChronicleEntryView {
  return { id: c.id, tick: c.tick, kind: c.kind, text: c.text, refs: [...c.refs], seats: [...c.seats] };
}

export function achievementView(state: WorldState, id: string): AchievementView {
  const a = state.achievements.find((x) => x.id === id);
  return a ? { id, unlocked: true, tick: a.tick, seats: [...a.seats] } : { id, unlocked: false };
}

export function townView(state: WorldState): TownView {
  return {
    population: state.residents.length,
    households: state.households.length,
    treasury: state.economy.treasury,
    leanTimes: state.economy.leanTimes,
    attractiveness: state.stats.attractiveness,
    unlocked: [...state.hearth.unlocked],
    wishesGranted: state.stats.wishesGranted,
  };
}

/** The resident's display name, or '' when gone. */
export function nameOf(state: WorldState, id: EntityId): string {
  const r = findById(state.residents, id);
  return r ? residentName(r) : '';
}
