// The supplies' views (R3A): `supplies.updated` for whoever draws lamps, resting pieces and candle-lit
// windows (R3F), and a place's supplies for its card (R3D). docs/spec/19-evenings.md, Supplies. Pure:
// reads saved state (and the derived places) only.
import { content, type SupplyKind } from '@qoti/content';
import { SUPPLY_KINDS } from '../constants';
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
import { findById } from '../state/entities';
import { dayIndex } from '../systems/economy/time';
import { candleHomes, pieceRests } from '../systems/supplies/api';
import { lamplighterJobs } from '../systems/supplies/lamplighter';
import { Kind, placePieces, seasonOfDay, suppliedIndex, suppliesDraw } from '../systems/supplies/pieces';
import { tickAt } from '../systems/supplies/time';
import { residentName } from './hamlet';

/** The night the view describes: the one settled last, or before any, tonight's (yesterday's before 07:00). */
function nightOf(state: WorldState): number {
  if (state.supplies.night >= 0) return state.supplies.night;
  const day = dayIndex(state.tick);
  return state.tick < tickAt(day, content.supplies.outHour) ? day - 1 : day;
}

/** `supplies.updated`: tonight's lamps, resting pieces, candle-lit homes and the lamplighters. */
export function suppliesView(state: WorldState): SuppliesView {
  const S = content.supplies;
  const sup = state.supplies;
  const night = nightOf(state);
  const out = tickAt(night + 1, S.outHour);
  const lamps: LampView[] = [];
  const ix = suppliedIndex(state);
  if (suppliesDraw(state) && sup.night >= 0) {
    for (const l of sup.lamps) lamps.push({ id: l.id, reach: l.reach, out });
  } else {
    // A Hamlet, or before the first settling: every lantern comes on at the hour.
    const reach = tickAt(night, S.litHour);
    for (let i = 0; i < ix.list.length; i++) {
      if (ix.kind[i] === Kind.nightly) lamps.push({ id: ix.list[i]!.id, reach, out });
    }
  }
  return {
    night,
    lamps,
    resting: restingOf(state, ix.list.keys(), ix),
    candles: candleHomes(state),
    candleUntil: tickAt(night, S.candleUntilHour),
    lamplighters: { jobs: lamplighterJobs(state), held: [...sup.lamplighters] },
  };
}

/** The supplied pieces (by list index) resting tonight, in id order. */
function restingOf(
  state: WorldState,
  indexes: Iterable<number>,
  ix: ReturnType<typeof suppliedIndex>,
): RestingView[] {
  const out: RestingView[] = [];
  for (const i of indexes) {
    const kind = pieceRests(state, ix.list[i]!);
    if (kind) out.push({ id: ix.list[i]!.id, kind });
  }
  return out;
}

/** A place's supplies by kind, for its card; absent when it has no supplied piece. */
export function placeSupplies(state: WorldState, place: Place): PlaceSupplyView[] | undefined {
  const pieces = placePieces(state, place);
  if (pieces.length === 0) return undefined;
  const ix = suppliedIndex(state);
  const season = seasonOfDay(dayIndex(state.tick)) % 4;
  const rows: PlaceSupplyView[] = [];
  for (let k = 0; k < SUPPLY_KINDS.length; k++) {
    let n = 0;
    let wants = 0;
    let resting = 0;
    let good: string | undefined;
    let per = 1;
    for (const i of pieces) {
      if (ix.kind[i] !== k) continue;
      const d = ix.list[i]!;
      const supply = content.decorById.get(d.def)!.supply!;
      n += 1;
      good ??= supply.good;
      per = supply.per ?? 1;
      if (k === Kind.evening) wants += supply.seasons?.includes(season) ? (supply.qty ?? 1) : 0;
      else if (k === Kind.season) wants += supply.qty ?? 1;
      if (pieceRests(state, d)) resting += 1;
    }
    if (n === 0) continue;
    if (k === Kind.nightly) wants = Math.ceil(n / per);
    const row: PlaceSupplyView = { kind: SUPPLY_KINDS[k] as SupplyKind, pieces: n, wants, resting };
    if (good !== undefined) row.good = good;
    rows.push(row);
  }
  return rows;
}

/** A place's pieces resting tonight, sorted by id; absent when none rests. */
export function placeResting(state: WorldState, place: Place): RestingView[] | undefined {
  const ix = suppliedIndex(state);
  const out = restingOf(state, placePieces(state, place), ix);
  return out.length > 0 ? out : undefined;
}

/** The Town Hall's lamplighter and a home's candle (BuildingDetail's R3A fields). */
export function buildingSupplies(
  state: WorldState,
  b: Building,
): Pick<BuildingDetail, 'lamplighter' | 'candle'> {
  // A home: its household's nights of candlelight left (Household.candle).
  const h = state.households.find((x) => x.homeId === b.id);
  if (h && (h.candle ?? 0) > 0) return { candle: h.candle! };
  if (b.def === 'town-hall' && b.stage === 'built' && suppliesDraw(state)) {
    const ix = suppliedIndex(state);
    let lanterns = 0;
    for (const k of ix.kind) if (k === Kind.nightly) lanterns += 1;
    if (lanterns === 0) return {};
    const held: { id: number; name: string }[] = [];
    for (const id of state.supplies.lamplighters) {
      const r = findById(state.residents, id);
      if (r) held.push({ id, name: residentName(r) });
    }
    const candles = content.goodIndex.get('candles');
    const row = state.supplies.drawn[state.supplies.drawn.length - 1];
    return {
      lamplighter: {
        jobs: lamplighterJobs(state),
        held,
        lanterns: state.supplies.lamps.length,
        candles: candles === undefined ? 0 : (row?.[candles] ?? 0),
      },
    };
  }
  return {};
}
