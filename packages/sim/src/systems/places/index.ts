// The place pass (docs/spec/19-evenings.md, Places): every hour after the patterns pass, and after a
// Hearth command nearby, the sim finds the town's places (pattern sites, sitting spots, porches,
// hosts) and gives each its seats, kinds, shelter, outlets and draw. Places are derived, never saved:
// the index below is rebuilt from saved state, so a seat joining from a snapshot sees what its
// partner sees (the determinism rule on `Place` in contracts/evenings.ts). The pass also keeps the
// saved rows (`state.places`: names and the evening counts) in step with what it finds.
//
// How the index stays a pure function of saved state (R2A, R2X): every writer of a structural input
// (signature.ts: every input of buildPlaces) bumps a derived counter (inputs.ts). A read whose counter
// matches its memo returns the memo; a moved counter, or no memo (a client that just loaded from a
// snapshot builds fresh from saved state), hashes the structural signature and rebuilds the places
// only if it changed. The draw's moving parts (charm, lanterns, winter, and the tree and quiet taste
// bits) are recomputed for each new tick or turn either way. With the verifier on (setPlaceVerify:
// tests, the audit, the golden year) a skipped rebuild also hashes the signature and throws if an input
// changed behind the counter's back, so a writer that forgets to bump cannot ship. Every client
// sees the same places at every point of the sim. Stock is never cached: placeServes and
// placeDraw read shelves live.
import { TICKS_PER_HOUR } from '../../constants';
import type { Place, PlaceId, System, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { PATTERNS_OFFSET } from '../hearth/patterns';
import { buildPlaces, placeExtra, type PlaceExtra } from './build';
import { refreshDraws } from './draw';
import { bumpPlaceInputs, placeInputsVersion, placeVerifyOn } from './inputs';
import { refreshRows } from './rows';
import { placeSignature, sameSignature, SIG } from './signature';
import { refreshStreets } from './streets';

/** The derived places, sorted by id, and a lookup by id. Never serialized, never hashed. */
export interface PlaceIndex {
  places: Place[];
  byId: Map<PlaceId, Place>;
}

interface Memo {
  index: PlaceIndex;
  extras: PlaceExtra[];
  sig: number[];
  /** The input counter (inputs.ts) the index was last checked against. */
  version: number;
  /** The road network version the index was last checked against (a cheap key; also in the signature). */
  network: number;
  // The tick and turn the draw's moving parts were last refreshed for.
  tick: number;
  turn: number;
  /** Set while building, so a re-entrant read (a stub that asks for places) gets the last index. */
  building: boolean;
}

const memos = new WeakMap<WorldState, Memo>();

const PARTS = ['decor', 'buildings', 'households', 'sites', 'rest'] as const;

/** The verifier: the inputs must not have changed behind the counter's back. */
function verifyUnchanged(state: WorldState, m: Memo): void {
  const sig = placeSignature(state);
  if (sameSignature(m.sig, sig)) return;
  const parts = PARTS.filter((p) => !sameSignature(m.sig, sig, SIG[p], SIG[p] + 2));
  throw new Error(
    `place index: ${parts.join(', ')} changed at tick ${state.tick} without bumpPlaceInputs (a writer forgot to bump)`,
  );
}

/**
 * The town's places now: a pure function of saved state at the moment it is read (see the file
 * header). Callers must not mutate what it returns.
 */
export function placeIndex(state: WorldState): PlaceIndex {
  let m = memos.get(state);
  if (m?.building) return m.index;
  const version = placeInputsVersion(state);
  if (m && m.version === version && m.network === state.networkVersion) {
    if (placeVerifyOn()) verifyUnchanged(state, m);
    if (m.tick !== state.tick || m.turn !== state.lastTurn) {
      refreshDraws(state, m.index.places, m.extras);
      m.tick = state.tick;
      m.turn = state.lastTurn;
    }
    return m.index;
  }
  if (m) m.building = true;
  const sig = placeSignature(state);
  if (!m || !sameSignature(m.sig, sig)) {
    const prev = m;
    if (!m) {
      m = {
        index: { places: [], byId: new Map() },
        extras: [],
        sig,
        version,
        network: state.networkVersion,
        tick: -1,
        turn: -1,
        building: true,
      };
      memos.set(state, m);
    }
    try {
      const built = buildPlaces(state, sig);
      m.index = { places: built.places, byId: new Map(built.places.map((p) => [p.id, p])) };
      m.extras = built.extras;
      m.sig = sig;
    } finally {
      m.building = false;
      if (prev) prev.building = false;
    }
  }
  m.building = false;
  refreshDraws(state, m.index.places, m.extras);
  m.version = version;
  m.network = state.networkVersion;
  m.tick = state.tick;
  m.turn = state.lastTurn;
  return m.index;
}

/** What stands at a place (PlaceFeature bits), for a resident's taste; 0 for a place not in the index now. */
export function placeFeatures(state: WorldState, place: Place): number {
  if (placeIndex(state).byId.get(place.id) !== place) return 0;
  return placeExtra(place)?.features ?? 0;
}

/**
 * The next read checks the signature again even within this tick and turn (and rebuilds only if an
 * input changed). Deterministic: call it from sim code.
 */
export function recheckPlaces(state: WorldState): void {
  bumpPlaceInputs(state);
}

/**
 * Drops the cached index (a Hearth command nearby, a building grown or gone); the next read rebuilds
 * it. The index already rebuilds whenever its inputs change, so this only ever costs time: call it
 * from sim code (commands, systems), never from views.
 */
export function invalidatePlaces(state: WorldState): void {
  memos.delete(state);
}

/** The road layer each state's street pass last ran on (derived, never saved). */
const streetsSeen = new WeakMap<WorldState, number>();

/** A 32-bit hash of the road layer (word by word). */
function roadHash(state: WorldState): number {
  const road = state.map.road;
  const words = new Uint32Array(road.buffer, road.byteOffset, road.byteLength >>> 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i]!, 0x01000193);
  return h >>> 0;
}

export const places: System = {
  id: 'places',
  order: 73,
  every: TICKS_PER_HOUR,
  offset: PATTERNS_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    // The patterns pass ran a moment ago in this tick: check the signature again (it rebuilds only
    // when something changed), so the pass reads the sites it found.
    recheckPlaces(state);
    // Streets first, so a place first found today can be named for the street beside it. Runs
    // change only with the road layer: unchanged roads mean the street pass would change nothing.
    const roads = roadHash(state);
    if (streetsSeen.get(state) !== roads) {
      refreshStreets(state, ctx);
      streetsSeen.set(state, roads);
    }
    refreshRows(state, ctx);
  },
};
