// The supplies' views (R3.0; R3A writes what is marked a stand-in): `supplies.updated` for whoever draws
// lamps, resting pieces and candle-lit windows (R3F), and a place's supplies for its card (R3D).
// docs/spec/19-evenings.md, Supplies. Pure: reads saved state (and the derived places) only.
import { content } from '@qoti/content';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../constants';
import type {
  Building,
  BuildingDetail,
  LampView,
  Place,
  PlaceSupplyView,
  RestingView,
  SuppliesView,
  WorldState,
} from '../contracts';
import { dayIndex } from '../systems/economy/time';
import { candleHomes } from '../systems/supplies/api';

/** The absolute tick of `hour`:00 on day index `day`. */
function tickAt(day: number, hour: number): number {
  return day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;
}

/** The night the view describes: the one settled last, or before any, tonight's (yesterday's before 07:00). */
function nightOf(state: WorldState): number {
  if (state.supplies.night >= 0) return state.supplies.night;
  const day = dayIndex(state.tick);
  return state.tick < tickAt(day, content.supplies.outHour) ? day - 1 : day;
}

/** `supplies.updated`: tonight's lamps, resting pieces, candle-lit homes and the lamplighters. */
export function suppliesView(state: WorldState): SuppliesView {
  const S = content.supplies;
  const night = nightOf(state);
  const out = tickAt(night + 1, S.outHour);
  const lamps: LampView[] = [];
  // R3 stand-in (R3A): every lantern has a candle and comes on at 18:00 sharp; nothing rests.
  for (const d of state.decor) {
    if (content.decorById.get(d.def)?.supply?.kind === 'nightly') {
      lamps.push({ id: d.id, reach: tickAt(night, S.litHour), out });
    }
  }
  const resting: RestingView[] = [];
  return {
    night,
    lamps,
    resting,
    candles: candleHomes(state),
    candleUntil: tickAt(night, S.candleUntilHour),
    lamplighters: { jobs: 0, held: [...state.supplies.lamplighters] },
  };
}

/** A place's supplies by kind, for its card; absent when it has no supplied piece. */
export function placeSupplies(_state: WorldState, _place: Place): PlaceSupplyView[] | undefined {
  // R3 stand-in (R3A): the place card shows no supplies yet.
  return undefined;
}

/** A place's pieces resting tonight, sorted by id; absent when none rests. */
export function placeResting(_state: WorldState, _place: Place): RestingView[] | undefined {
  // R3 stand-in (R3A): nothing rests.
  return undefined;
}

/** The Town Hall's lamplighter and a home's candle (BuildingDetail's R3A fields). */
export function buildingSupplies(
  state: WorldState,
  b: Building,
): Pick<BuildingDetail, 'lamplighter' | 'candle'> {
  // A home: its household's nights of candlelight left (real from R3.0: Household.candle).
  const h = state.households.find((x) => x.homeId === b.id);
  if (h && (h.candle ?? 0) > 0) return { candle: h.candle! };
  // R3 stand-in (R3A): the Town Hall says nothing of a lamplighter yet.
  return {};
}
