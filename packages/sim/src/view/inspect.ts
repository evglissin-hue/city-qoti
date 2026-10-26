// Inspect request builders (C3.0 contract): full detail on demand for the inspectors and the
// while-you-were-away letter. Baselines here; C3A enriches residents, C3C buildings, C3B the letter.
import { chroniclePhrases, content } from '@qoti/content';
import { BuildingStatus, TICKS_PER_DAY } from '../constants';
import type { AwayLetter, BuildingDetail, EntityId, ResidentDetail, SeatId, WorldState } from '../contracts';
import { findById } from '../state/entities';
import { buildingView, noteView } from './index';
import { chronicleView, fillText, nameOf } from './hamlet';
import { residentDetail } from './residentDetail';

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

const STATUS_TEXT: [bit: number, text: string][] = [
  [BuildingStatus.noWorkers, 'Nobody works here yet'],
  [BuildingStatus.missingInput, 'Waiting for inputs'],
  [BuildingStatus.outputFull, 'Output is piling up'],
  [BuildingStatus.noRoad, 'No road at the door'],
  [BuildingStatus.noPorters, 'No porters in range'],
  [BuildingStatus.paused, 'Paused'],
  [BuildingStatus.disrepair, 'In disrepair'],
  [BuildingStatus.waitingMaterials, 'Waiting for materials'],
  [BuildingStatus.waitingBuilders, 'Waiting for builders'],
  [BuildingStatus.noTrees, 'No mature trees in reach'],
  [BuildingStatus.noFields, 'No fields to tend'],
];

export function buildingDetail(state: WorldState, id: EntityId): BuildingDetail | null {
  const b = findById(state.buildings, id);
  if (!b) return null;
  const def = content.buildingById.get(b.def);
  const rt = b.rt;
  const detail: BuildingDetail = {
    b: buildingView(b),
    workers: (rt?.workers ?? []).map((w) => ({
      id: w,
      name: nameOf(state, w),
      present: findById(state.residents, w)?.inside === b.id,
    })),
    status: STATUS_TEXT.filter(([bit]) => (rt?.status ?? 0) & bit).map(([, text]) => text),
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
  return detail;
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
