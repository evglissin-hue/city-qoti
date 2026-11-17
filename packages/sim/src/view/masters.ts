// Masters' views (R3.0; R3B writes the bodies): what the resident and building inspectors and the
// Businesses book say about masters and apprentices (docs/spec/19-evenings.md, Masters). Wired into
// residentDetail, buildingDetail and businessView already, so R3B changes only this file. Pure.
import type {
  Building,
  BuildingDetail,
  BusinessView,
  Resident,
  ResidentDetail,
  WorldState,
} from '../contracts';

/** A resident's working days by trade, mastery and master (ResidentDetail's R3 fields). */
export function residentMastery(
  _state: WorldState,
  _r: Resident,
): Pick<ResidentDetail, 'craft' | 'master' | 'apprenticeOf'> {
  // R3 stand-in (R3B): nothing to say yet.
  return {};
}

/** A business's or specialized building's master and apprentices (BuildingDetail.master). */
export function buildingMastery(_state: WorldState, _b: Building): Pick<BuildingDetail, 'master'> {
  // R3 stand-in (R3B): nothing to say yet.
  return {};
}

/** A business's master, its good and grace (BusinessView's R3 fields). */
export function businessMastery(
  _state: WorldState,
  _b: Building,
): Pick<BusinessView, 'masterId' | 'masterGood' | 'apprentices' | 'graceDays'> {
  // R3 stand-in (R3B): nothing to say yet.
  return {};
}
