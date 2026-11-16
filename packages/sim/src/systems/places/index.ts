// The place pass (docs/spec/19-evenings.md, Places): every hour after the patterns pass, and after a
// Hearth command nearby, the sim finds the town's places (pattern sites, sitting spots, porches,
// hosts) and gives each its seats, kinds, shelter, outlets and draw. Places are derived, never saved:
// the index below is rebuilt from saved state, so a seat joining from a snapshot sees what its
// partner sees (the determinism rule on `Place` in contracts/evenings.ts). The pass also keeps the
// saved rows (`state.places`: names and the evening counts) in step with what it finds.
//
// How the index stays a pure function of saved state (R2A): a read compares a cheap key (the tick,
// the turn, and the counts that change when something is placed or pulled down) with the last read's.
// When it differs, the structural signature (signature.ts: every input of buildPlaces) is hashed again
// and the places rebuilt only if it changed; the draw's moving parts (charm, lanterns, winter) are
// recomputed for the new tick either way. A read in the same tick and turn returns what the first read
// of that tick found, and the first read of a tick is at the same point of the same system on every
// client (a snapshot is taken between turns, and reads between turns key on the turn before), so every
// client sees the same places at every point of the sim. Stock is never cached: placeServes and
// placeDraw read shelves live.
import { TICKS_PER_HOUR } from '../../constants';
import type { Place, PlaceId, System, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { PATTERNS_OFFSET } from '../hearth/patterns';
import { buildPlaces, type PlaceExtra } from './build';
import { refreshDraws } from './draw';
import { refreshRows } from './rows';
import { placeSignature } from './signature';
import { refreshStreets } from './streets';

/** The derived places, sorted by id, and a lookup by id. Never serialized, never hashed. */
export interface PlaceIndex {
  places: Place[];
  byId: Map<PlaceId, Place>;
}

interface Memo {
  index: PlaceIndex;
  extras: PlaceExtra[];
  sigA: number;
  sigB: number;
  // The cheap key of the last read.
  tick: number;
  turn: number;
  decor: number;
  lastDecor: number;
  buildings: number;
  lastBuilding: number;
  households: number;
  network: number;
  /** Set while building, so a re-entrant read (a stub that asks for places) gets the last index. */
  building: boolean;
}

const memos = new WeakMap<WorldState, Memo>();

function sameKey(m: Memo, state: WorldState): boolean {
  const nd = state.decor.length;
  const nb = state.buildings.length;
  return (
    m.tick === state.tick &&
    m.turn === state.lastTurn &&
    m.decor === nd &&
    m.lastDecor === (nd ? state.decor[nd - 1]!.id : 0) &&
    m.buildings === nb &&
    m.lastBuilding === (nb ? state.buildings[nb - 1]!.id : 0) &&
    m.households === state.households.length &&
    m.network === state.networkVersion
  );
}

function storeKey(m: Memo, state: WorldState): void {
  const nd = state.decor.length;
  const nb = state.buildings.length;
  m.tick = state.tick;
  m.turn = state.lastTurn;
  m.decor = nd;
  m.lastDecor = nd ? state.decor[nd - 1]!.id : 0;
  m.buildings = nb;
  m.lastBuilding = nb ? state.buildings[nb - 1]!.id : 0;
  m.households = state.households.length;
  m.network = state.networkVersion;
}

/**
 * The town's places now: a pure function of saved state at the moment it is read (see the file
 * header). Callers must not mutate what it returns.
 */
export function placeIndex(state: WorldState): PlaceIndex {
  let m = memos.get(state);
  if (m && (m.building || sameKey(m, state))) return m.index;
  if (m) m.building = true;
  const [sigA, sigB] = placeSignature(state);
  if (!m || m.sigA !== sigA || m.sigB !== sigB) {
    const prev = m;
    if (!m) {
      m = {
        index: { places: [], byId: new Map() },
        extras: [],
        sigA,
        sigB,
        tick: -1,
        turn: -1,
        decor: -1,
        lastDecor: -1,
        buildings: -1,
        lastBuilding: -1,
        households: -1,
        network: -1,
        building: true,
      };
      memos.set(state, m);
    }
    try {
      const built = buildPlaces(state);
      m.index = { places: built.places, byId: new Map(built.places.map((p) => [p.id, p])) };
      m.extras = built.extras;
      m.sigA = sigA;
      m.sigB = sigB;
    } finally {
      m.building = false;
      if (prev) prev.building = false;
    }
  }
  m.building = false;
  refreshDraws(state, m.index.places, m.extras);
  storeKey(m, state);
  return m.index;
}

/** What stands at a place (PlaceFeature bits), for a resident's taste; 0 for a place not in the index now. */
export function placeFeatures(state: WorldState, place: Place): number {
  const index = placeIndex(state);
  const m = memos.get(state);
  if (!m || index.byId.get(place.id) !== place) return 0;
  return m.extras[featureSlot(m, place)]?.features ?? 0;
}

/** The slot of a place in the memo's arrays (places are sorted by id: binary search). */
function featureSlot(m: Memo, place: Place): number {
  const list = m.index.places;
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const id = list[mid]!.id;
    if (id === place.id) return mid;
    if (id < place.id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/**
 * Drops the cached index (a Hearth command nearby, a building grown or gone); the next read rebuilds
 * it. The index already rebuilds whenever its inputs change, so this only ever costs time: call it
 * from sim code (commands, systems), never from views.
 */
export function invalidatePlaces(state: WorldState): void {
  memos.delete(state);
}

export const places: System = {
  id: 'places',
  order: 73,
  every: TICKS_PER_HOUR,
  offset: PATTERNS_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    // The patterns pass ran a moment ago in this tick: read the sites it found.
    invalidatePlaces(state);
    refreshRows(state, ctx);
    refreshStreets(state, ctx);
  },
};
