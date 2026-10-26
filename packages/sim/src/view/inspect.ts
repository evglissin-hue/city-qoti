// Inspect request builders (C3.0 contract): full detail on demand for the inspectors and the
// while-you-were-away letter. Baselines here; C3A enriches residents, C3C buildings, C3B the letter.
import { chroniclePhrases, content, type BuildingDef } from '@qoti/content';
import { BuildingStatus, TICKS_PER_DAY } from '../constants';
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
import { WORN_CONDITION } from '../systems/production/produce';
import { dailyRates } from '../systems/production/rates';
import { buildingView, noteView } from './index';
import { chronicleView, fillText, goodPairs, nameOf } from './hamlet';
import { residentDetail } from './residentDetail';
import { lotView } from './village';
import { buildingProfit } from '../systems/market/profit';

export { residentDetail };

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
  if (def && rt) addVillageDetail(state, b, def, detail);
  return detail;
}

/**
 * I2 (C4.0): methods to pin, the lot, the tier and an upgrade, and profit per work day: output
 * at market price minus wages, upkeep and inputs at market price (C4A, systems/market/profit.ts).
 */
function addVillageDetail(state: WorldState, b: Building, def: BuildingDef, detail: BuildingDetail): void {
  const rt = b.rt!;
  if ((def.methods?.length ?? 0) > 1) detail.methods = def.methods!.map((m) => ({ id: m.id, name: m.name }));
  if (rt.pinned) detail.pinned = rt.pinned;
  const lot = b.lot ? findById(state.lots, b.lot) : undefined;
  if (lot) detail.lot = lotView(lot);
  if (rt.tier) detail.tier = rt.tier;
  if (rt.upgrade && def.upgradesTo)
    detail.upgrade = { to: def.upgradesTo.def, waiting: goodPairs(rt.upgrade) };
  const profit = buildingProfit(state, b, def);
  if (profit) detail.profit = profit;
}

/** Most recent notable entries the letter lists; older ones are counted in `more`. */
export const AWAY_ENTRIES = 12;

function phrase(list: readonly string[], key: number): string {
  return list[((key % list.length) + list.length) % list.length] ?? '';
}

/** "one household moved in" or "3 households moved in", from a [singular, plural] pair. */
function counted(pair: readonly string[], n: number): string {
  return n === 1 ? pair[0]! : fillText(pair[1]!, [['n', numberWord(n)]]);
}

function numberWord(n: number): string {
  return chroniclePhrases.numbers[n] ?? String(n);
}

function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The while-you-were-away letter (docs/spec/16-coop.md): the notable Chronicle entries since the
 * seat last left (newest AWAY_ENTRIES), stat changes, notes left by others, and an opening that
 * sums it up in a few warm lines. Pure: phrase choices are keyed on the seat and the day count.
 */
export function awayLetter(state: WorldState, seat: SeatId): AwayLetter | null {
  const s = state.seats.find((x) => x.seat === seat);
  if (!s) return null;
  const since = s.seen?.tick ?? s.lastSeenTick;
  const seen = s.seen;
  const days = Math.floor((state.tick - since) / TICKS_PER_DAY);
  const notable = state.chronicle.filter(
    (c) => c.tick > since && content.chronicleByKind.get(c.kind)?.notable,
  );
  const entries = notable.slice(-AWAY_ENTRIES).map(chronicleView);

  const P = chroniclePhrases;
  const key = seat + days;
  const count = (kind: string) => notable.filter((c) => c.kind === kind).length;
  const news: string[] = [];
  const arrived = count('household-arrived');
  const left = count('household-left');
  const patterns = seen ? state.hearth.discovered.length - seen.patterns : count('pattern-discovered');
  const wishes = seen ? state.stats.wishesGranted - seen.wishesGranted : 0;
  const plaques = count('achievement');
  if (arrived > 0) news.push(counted(P.awayArrived, arrived));
  if (left > 0) news.push(counted(P.awayLeft, left));
  if (patterns > 0) news.push(counted(P.awayPatterns, patterns));
  if (wishes > 0) news.push(counted(P.awayWishes, wishes));
  if (plaques > 0) news.push(counted(P.awayAchievements, plaques));
  const lines = [fillText(phrase(P.awayGreeting, key), [['seat', s.name]])];
  const dayText = days === 1 ? 'a day' : `${numberWord(days)} days`;
  let second = fillText(phrase(P.awayDays, key), [['days', dayText]]);
  second = second.charAt(0).toUpperCase() + second.slice(1);
  second +=
    ' ' +
    (news.length ? fillText(phrase(P.awayNews, key), [['news', listJoin(news)]]) : phrase(P.awayQuiet, key));
  const partner = state.seats.find((x) => x.seat !== seat && state.time.connected.includes(x.seat));
  if (partner) second += ' ' + fillText(phrase(P.awayPartner, key), [['partner', partner.name]]);
  lines.push(second);

  return {
    seat,
    since,
    days,
    entries,
    stats: seen
      ? [
          ['Residents', seen.population, state.residents.length],
          ['Coins', Math.floor(seen.treasury / 100), Math.floor(state.economy.treasury / 100)],
          ['Patterns', seen.patterns, state.hearth.discovered.length],
          ['Wishes granted', seen.wishesGranted, state.stats.wishesGranted],
        ]
      : [],
    notes: state.notes.filter((n) => n.tick > since && n.by !== seat).map(noteView),
    opening: lines.join('\n'),
    more: notable.length - entries.length,
  };
}
