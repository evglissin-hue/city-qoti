// Lots from zoned frontage (docs/spec/13-ledger.md, Zoning and growth). Hourly at offset 70 the
// zoning pass drops empty lots the ground no longer allows and cuts new ones along the roads
// (./lots). zone.paint and zone.clear set the `zone` layer; the pass keeps the `lot` layer and
// state.lots in step and emits lot.added and lot.removed (growLot emits lot.updated). Each hour it
// also rescores a slice of the empty lots (growth/desirability), so every lot is scored daily.
//
// The pass is idempotent, so it is skipped while nothing it reads has changed since it last ran on
// this state: the network version (roads, buildings, fields, terrain), decor, lots and a zone epoch
// the zone commands bump. That memory is a derived index, never saved: a client that just loaded
// runs the pass once and finds nothing to do, exactly as one that skipped it.
import { TICKS_PER_HOUR } from '../../constants';
import type { System, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { DESIRABILITY_SLICES, refreshDesirability } from '../growth/desirability';
import { zoningPass } from './lots';

const zoneEpochs = new WeakMap<WorldState, number>();
const lastKeys = new WeakMap<WorldState, string>();

/** zone.paint and zone.clear: the zones changed, so the next pass looks again. */
export function zonesChanged(state: WorldState): void {
  zoneEpochs.set(state, (zoneEpochs.get(state) ?? 0) + 1);
}

const lastDecor = new WeakMap<WorldState, string>();

function decorKey(state: WorldState): string {
  const d = state.decor;
  return `${d.length}:${d.length ? d[d.length - 1]!.id : 0}`;
}

function inputsKey(state: WorldState): string {
  const b = state.buildings;
  return [
    state.networkVersion,
    zoneEpochs.get(state) ?? 0,
    decorKey(state),
    b.length,
    b.length ? b[b.length - 1]!.id : 0,
    state.lots.length,
    state.lots.length ? state.lots[state.lots.length - 1]!.id : 0,
  ].join(':');
}

export const zoning: System = {
  id: 'zoning',
  order: 24,
  every: TICKS_PER_HOUR,
  offset: 70,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    // Every hour a slice of the empty lots is scored again (a full round each day).
    if (state.lots.length > 0) {
      const hour = Math.floor(state.tick / TICKS_PER_HOUR) % DESIRABILITY_SLICES;
      refreshDesirability(state, ctx, hour);
    }
    const key = inputsKey(state);
    if (lastKeys.get(state) === key) return;
    // Lots last checked against this same decor need not be checked again.
    const decor = decorKey(state);
    zoningPass(state, ctx, lastDecor.get(state) !== decor);
    lastDecor.set(state, decor);
    lastKeys.set(state, inputsKey(state));
  },
};
