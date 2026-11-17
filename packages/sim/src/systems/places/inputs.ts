// The place index's change counter (R2X). A derived number per state (a WeakMap keyed by the
// WorldState: never saved, never hashed) that every writer of a structural input of the place index
// bumps (the inputs are listed in signature.ts: decor, buildings, households, pattern sites, the ice
// and the festival). The index rebuilds only when the counter moved since its memo, or has no memo
// (a state that just loaded from a snapshot builds fresh from saved state, which keeps it
// deterministic). A writer that forgets to bump is caught by the verifier (setPlaceVerify).
// This file imports nothing from the sim, so any system may import it without a cycle.
import type { WorldState } from '../../contracts';

const versions = new WeakMap<WorldState, number>();

/** Call after changing anything the place signature reads (see signature.ts). Cheap. */
export function bumpPlaceInputs(state: WorldState): void {
  versions.set(state, (versions.get(state) ?? 0) + 1);
}

/** The counter now (0 for a state nothing has bumped). */
export function placeInputsVersion(state: WorldState): number {
  return versions.get(state) ?? 0;
}

let verify = false;

/**
 * Turns the verifier on or off (off by default in the game). With it on, every place index read that
 * skips the rebuild also hashes the full signature and throws if an input changed while the counter
 * did not. Tests, the audit and the golden year turn it on; the timed bench scenes leave it off.
 */
export function setPlaceVerify(on: boolean): void {
  verify = on;
}

export function placeVerifyOn(): boolean {
  return verify;
}
