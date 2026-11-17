// Who gets the credit (docs/spec/19-evenings.md, Gaps; 16-coop.md, the evening edition): the seat whose
// command built the piece. A piece placed by hand carries its seat (`builtBy`); a business that grew
// on a lot was placed by nobody (growth writes seat 0), so it is credited to the seats playing the
// Ledger, whose zoning grew it (its own `builtBy` when no seat is in the Ledger lens). Pure: reads
// saved state only, so the gaps pass, the edition and the season report agree on every laptop.
import type { EntityId, Place, SeatId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';

/** The seats in the Ledger lens, sorted. */
export function ledgerSeats(state: WorldState): SeatId[] {
  const out: SeatId[] = [];
  for (const s of state.seats) if (s.lens === 'ledger') out.push(s.seat);
  return out;
}

function addSorted(out: SeatId[], seat: SeatId): void {
  if (out.includes(seat)) return;
  out.push(seat);
  out.sort((a, b) => a - b);
}

/** The seats credited for these buildings (grown ones go to the Ledger's seats), sorted, no repeats. */
export function buildingCredit(state: WorldState, ids: readonly EntityId[]): SeatId[] {
  const out: SeatId[] = [];
  for (const id of ids) {
    const b = findById(state.buildings, id);
    if (!b) continue;
    const ledger = b.lot !== undefined ? ledgerSeats(state) : [];
    if (ledger.length > 0) for (const s of ledger) addSorted(out, s);
    else addSorted(out, b.builtBy);
  }
  return out;
}

/**
 * The seats credited for a place: whoever laid its decor (the Hearth's pieces: benches, lanterns,
 * planters), or, for a place with no decor in it (a tavern, a stall, a porch), whoever built its
 * buildings. Both seats when both laid it. Empty for an unknown place.
 */
export function placeCredit(state: WorldState, place: Place | undefined): SeatId[] {
  if (!place) return [];
  const out: SeatId[] = [];
  const buildings: EntityId[] = [];
  for (const id of place.members) {
    const d = findById(state.decor, id);
    if (d) addSorted(out, d.builtBy);
    else buildings.push(id);
  }
  return out.length > 0 ? out : buildingCredit(state, buildings);
}
