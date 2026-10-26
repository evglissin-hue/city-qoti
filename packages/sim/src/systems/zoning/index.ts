// Lots from zoned frontage (docs/spec/13-ledger.md, Zoning and growth). Hourly at offset 70 the
// zoning pass drops empty lots the ground no longer allows and cuts new ones along the roads
// (./lots). zone.paint and zone.clear set the `zone` layer; the pass keeps the `lot` layer and
// state.lots in step and emits lot.added and lot.removed (growLot emits lot.updated).
//
// The pass is idempotent, so it is skipped while nothing it reads has changed since it last ran on
// this state: the network version (roads, buildings, fields, terrain), decor, lots and a zone epoch
// the zone commands bump. That memory is a derived index, never saved: a client that just loaded
// runs the pass once and finds nothing to do, exactly as one that skipped it.
import { TICKS_PER_HOUR } from '../../constants';
import type { System, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { zoningPass } from './lots';

const zoneEpochs = new WeakMap<WorldState, number>();
const lastKeys = new WeakMap<WorldState, string>();

/** zone.paint and zone.clear: the zones changed, so the next pass looks again. */
export function zonesChanged(state: WorldState): void {
  zoneEpochs.set(state, (zoneEpochs.get(state) ?? 0) + 1);
}

function inputsKey(state: WorldState): string {
  const d = state.decor;
  const b = state.buildings;
  return [
    state.networkVersion,
    zoneEpochs.get(state) ?? 0,
    d.length,
    d.length ? d[d.length - 1]!.id : 0,
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
    const key = inputsKey(state);
    if (lastKeys.get(state) === key) return;
    zoningPass(state, ctx);
    lastKeys.set(state, inputsKey(state));
  },
};
