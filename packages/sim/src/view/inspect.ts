// Inspect request builders (C3.0 contract): full detail on demand for the inspectors and the
// while-you-were-away letter. Baselines here; C3A enriches residents, C3C buildings, C3B the letter.
import { content } from '@qoti/content';
import type { BuildingDef } from '@qoti/content';
import { BuildingStatus, DAYS_PER_YEAR, NEED_IDS, NEED_WEIGHTS, TICKS_PER_DAY } from '../constants';
import type {
  AwayLetter,
  Building,
  BuildingDetail,
  EntityId,
  ResidentDetail,
  SeatId,
  WorldState,
} from '../contracts';
import { findById } from '../state/entities';
import { buildingView, noteView } from './index';
import { WORN_CONDITION } from '../systems/production/produce';
import { dailyRates } from '../systems/production/rates';
import { chronicleView, goodPairs, nameOf, residentView, wishView } from './hamlet';

export type InspectKind = 'resident' | 'building' | 'away';
export type InspectResult = ResidentDetail | BuildingDetail | AwayLetter | null;

export function inspect(state: WorldState, kind: InspectKind, id: number): InspectResult {
  switch (kind) {
    case 'resident':
      return residentDetail(state, id);
    case 'building':
      return buildingDetail(state, id);
    case 'away':
      return awayLetter(state, id as SeatId);
  }
}

const ACTIVITY_TEXT: Record<string, string> = {
  arrive: 'Arriving in the valley',
  home: 'At home',
  sleep: 'Asleep',
  commute: 'On the way to work',
  work: 'At work',
  shop: 'Out shopping',
  leisure: 'Out enjoying the valley',
  visit: 'Visiting a friend',
  play: 'Playing',
  stroll: 'Out for a stroll',
  goHome: 'Walking home',
  stuck: 'Lost, and too proud to ask',
  leave: 'Leaving the valley',
  task: 'On an errand for the town',
};

export function residentDetail(state: WorldState, id: EntityId): ResidentDetail | null {
  const r = findById(state.residents, id);
  if (!r) return null;
  const h = findById(state.households, r.householdId);
  const ageDays = Math.floor(state.tick / TICKS_PER_DAY) - r.bornDay;
  const wish = r.wishId ? state.wishes.find((w) => w.id === r.wishId) : undefined;
  const sp = content.speciesById.get(r.species);
  const traits = r.traits.map((t) => content.traitById.get(t)?.name.toLowerCase() ?? t);
  const detail: ResidentDetail = {
    r: residentView(state, r),
    mood: r.mood,
    needs: NEED_IDS.map((n, i) => [n, r.needs[i] ?? 0]),
    moodLines: NEED_IDS.map((n, i) => ({
      label: n,
      value: Math.round(((r.needs[i] ?? 0) * NEED_WEIGHTS[i]!) / 100),
    })),
    friends: r.friends.map((f) => ({ id: f.id, name: nameOf(state, f.id), level: f.level })),
    householdMembers: (h?.members ?? [])
      .filter((m) => m !== r.id)
      .map((m) => ({ id: m, name: nameOf(state, m) })),
    doing: ACTIVITY_TEXT[r.activity.kind] ?? 'Pottering about',
    bio: `A ${traits.join(' and ')} ${sp?.name.toLowerCase() ?? 'resident'}.`,
    history: r.history.map((item) => ({ ...item, text: item.kind })),
    age: { years: Math.max(0, Math.floor(ageDays / DAYS_PER_YEAR)), stage: r.stage },
  };
  if (wish) detail.wish = wishView(state, wish);
  return detail;
}

/** Readable lines for each status bit; some name what is missing. */
function statusLines(b: Building, def: BuildingDef | undefined): string[] {
  const rt = b.rt;
  if (!rt) return [];
  const s = rt.status;
  const out: string[] = [];
  const method = def?.methods?.[rt.method];
  const has = (bit: number) => (s & bit) !== 0;
  if (has(BuildingStatus.paused)) out.push('Paused by the Ledger');
  if (b.stage === 'construction' && rt.construction) {
    const due = goodsText(rt.construction.needs);
    if (has(BuildingStatus.waitingMaterials)) out.push(due ? `Waiting for ${due}` : 'Waiting for materials');
    else if (due) out.push(`Still to come: ${due}`);
    if (has(BuildingStatus.waitingBuilders)) out.push('Waiting for a builder to come by');
    if (rt.construction.priority) out.push('Raised to the front of the queue');
  }
  if (has(BuildingStatus.noWorkers)) out.push('Nobody works here yet');
  if (has(BuildingStatus.missingInput) && method) {
    const short = method.inputs.filter(([g, q]) => (rt.input[content.goodIndex.get(g) ?? -1] ?? 0) < q);
    out.push(`Waiting for ${short.map(([g]) => goodName(g)).join(' and ') || 'inputs'}`);
  }
  if (has(BuildingStatus.outputFull)) out.push('Output is piling up, waiting for a porter');
  if (has(BuildingStatus.noTrees)) out.push(`No mature trees within ${method?.range ?? 8} tiles`);
  if (has(BuildingStatus.noFields)) out.push('No fields painted yet');
  if (has(BuildingStatus.noRoad)) out.push('No road at the door');
  if (has(BuildingStatus.noPorters)) out.push('No porters within 20 tiles');
  if (has(BuildingStatus.disrepair)) out.push(`In disrepair (${rt.condition}%)`);
  else if (rt.condition < WORN_CONDITION) out.push(`A little worn (${rt.condition}%)`);
  return out;
}

function goodName(id: string): string {
  return content.goodById.get(id)?.name.toLowerCase() ?? id;
}

/** "12 planks and 4 stone" from a per-good array; '' when empty. */
function goodsText(values: readonly number[]): string {
  const parts = goodPairs(values).map(([g, n]) => `${n} ${goodName(g)}`);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Residents whose home lies within a coverage radius of the building (straight line). */
function residentsWithin(state: WorldState, b: Building, radius: number): number {
  let n = 0;
  for (const h of state.households) {
    const home = findById(state.buildings, h.homeId);
    if (!home) continue;
    const dx = home.x - b.x;
    const dz = home.z - b.z;
    if (dx * dx + dz * dz <= radius * radius) n += h.members.length;
  }
  return n;
}

export function buildingDetail(state: WorldState, id: EntityId): BuildingDetail | null {
  const b = findById(state.buildings, id);
  if (!b) return null;
  const def = content.buildingById.get(b.def);
  const rt = b.rt;
  const detail: BuildingDetail = {
    b: buildingView(b),
    workers: (rt?.workers ?? []).map((w) => {
      const r = findById(state.residents, w);
      // Porters and builders out on a task for their workplace count as at work.
      const present = !!r && (r.inside === b.id || (r.activity.kind === 'task' && r.jobId === b.id));
      return { id: w, name: nameOf(state, w), present };
    }),
    status: statusLines(b, def),
  };
  const method = def?.methods?.[rt?.method ?? 0];
  if (method) detail.method = { name: method.name, hours: method.hours };
  const h = state.households.find((x) => x.homeId === b.id);
  if (h) {
    detail.household = {
      id: h.id,
      family: h.family,
      members: h.members.map((m) => ({ id: m, name: nameOf(state, m) })),
    };
  }
  const cover = def?.coverage?.find((c) => c.kind === 'water' || c.kind === 'food');
  if (cover && b.stage === 'built') {
    const residents = residentsWithin(state, b, cover.radius);
    detail.served = { residents, capacity: cover.capacity ?? residents };
  }
  if (def && rt && b.stage === 'built') {
    const rates = dailyRates(state, b, def);
    if (rates && (rates.inputs.length > 0 || rates.outputs.length > 0)) detail.rates = rates;
    const made = goodPairs(rt.producedToday);
    if (method) detail.producedToday = made;
  }
  return detail;
}

export function awayLetter(state: WorldState, seat: SeatId): AwayLetter | null {
  const s = state.seats.find((x) => x.seat === seat);
  if (!s) return null;
  const since = s.seen?.tick ?? s.lastSeenTick;
  const seen = s.seen;
  return {
    seat,
    since,
    days: Math.floor((state.tick - since) / TICKS_PER_DAY),
    entries: state.chronicle.filter((c) => c.tick > since).map(chronicleView),
    stats: seen
      ? [
          ['Residents', seen.population, state.residents.length],
          ['Coins', Math.floor(seen.treasury / 100), Math.floor(state.economy.treasury / 100)],
          ['Patterns', seen.patterns, state.hearth.discovered.length],
          ['Wishes granted', seen.wishesGranted, state.stats.wishesGranted],
        ]
      : [],
    notes: state.notes.filter((n) => n.tick > since && n.by !== seat).map(noteView),
  };
}
