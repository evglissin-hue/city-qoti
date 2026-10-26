// Inspect request builders (C3.0 contract): full detail on demand for the inspectors and the
// while-you-were-away letter. Baselines here; C3A enriches residents, C3C buildings, C3B the letter.
import { content } from '@qoti/content';
import { BuildingStatus, TICKS_PER_DAY } from '../constants';
import type { AwayLetter, BuildingDetail, EntityId, ResidentDetail, SeatId, WorldState } from '../contracts';
import { findById } from '../state/entities';
import { buildingView, noteView } from './index';
import { chronicleView, nameOf } from './hamlet';
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
