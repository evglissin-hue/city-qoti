// Masters' views (R3.0; R3B writes the bodies): what the resident and building inspectors and the
// Businesses book say about masters and apprentices (docs/spec/19-evenings.md, Masters). Wired into
// residentDetail, buildingDetail and businessView already, so R3B changes only this file. Pure.
import { content } from '@qoti/content';
import type {
  Building,
  BuildingDetail,
  BusinessView,
  EntityId,
  Resident,
  ResidentDetail,
  WorldState,
} from '../contracts';
import { findById } from '../state/entities';
import { levelOf } from '../state/zones';
import { residentIsMaster } from '../state/masters';
import { dayIndex } from '../systems/economy/time';
import { masterDefOf, masterResident, masterTitle, masteryKey } from '../systems/masters/api';
import { residentName } from './hamlet';

/** A resident's working days by trade, mastery and master (ResidentDetail's R3 fields). */
export function residentMastery(
  state: WorldState,
  r: Resident,
): Pick<ResidentDetail, 'craft' | 'master' | 'apprenticeOf'> {
  const out: Pick<ResidentDetail, 'craft' | 'master' | 'apprenticeOf'> = {};
  if (r.craft && r.craft.length > 0) {
    out.craft = r.craft
      .map(([trade, days]) => ({ trade, days }))
      .sort((a, b) => b.days - a.days || (a.trade < b.trade ? -1 : a.trade > b.trade ? 1 : 0));
  }
  const title = masterTitle(r);
  if (title !== undefined && r.mastery !== undefined) out.master = { trade: r.mastery, title };
  if (!residentIsMaster(r) && r.apprentice?.master) {
    const m = findById(state.residents, r.apprentice.master);
    if (m) out.apprenticeOf = { id: m.id, name: residentName(m) };
  }
  return out;
}

/** Apprentices under way (untilDay in the future) serving this master at this building, by id. */
function apprenticesAt(state: WorldState, b: Building, master: EntityId): Resident[] {
  const today = dayIndex(state.tick);
  const out: Resident[] = [];
  for (const r of state.residents) {
    const a = r.apprentice;
    if (a && a.master === master && a.at === b.id && a.untilDay > today) out.push(r);
  }
  return out;
}

/** A business's or specialized building's master and apprentices (BuildingDetail.master). */
export function buildingMastery(state: WorldState, b: Building): Pick<BuildingDetail, 'master'> {
  const m = masterResident(state, b);
  if (!m) return {};
  return {
    master: {
      id: m.id,
      name: residentName(m),
      trade: masteryKey(b),
      title: masterTitle(m) ?? masterDefOf(masteryKey(b))?.title ?? 'master',
      apprentices: apprenticesAt(state, b, m.id).map((r) => ({ id: r.id, name: residentName(r) })),
    },
  };
}

/** A business's master, its good and grace (BusinessView's R3 fields). */
export function businessMastery(
  state: WorldState,
  b: Building,
): Pick<BusinessView, 'masterId' | 'masterGood' | 'apprentices' | 'graceDays'> {
  const out: Pick<BusinessView, 'masterId' | 'masterGood' | 'apprentices' | 'graceDays'> = {};
  if (b.masterId) {
    out.masterId = b.masterId;
    const good = masterDefOf(masteryKey(b))?.good;
    if (good !== undefined && content.goodIndex.has(good)) out.masterGood = good;
    out.apprentices = apprenticesAt(state, b, b.masterId).map((r) => r.id);
  }
  const gone = b.counters?.masterGone;
  if (gone !== undefined && levelOf(b) === 3) {
    out.graceDays = Math.max(0, content.mastery.graceDays - (dayIndex(state.tick) - gone));
  }
  return out;
}
