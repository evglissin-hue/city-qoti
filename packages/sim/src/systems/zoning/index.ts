// Lots from zoned frontage (docs/spec/13-ledger.md, Zoning and growth). Hourly at offset 70 the
// zoning pass drops empty lots the ground no longer allows and cuts new ones along the roads
// (./lots). zone.paint and zone.clear set the `zone` layer; the pass keeps the `lot` layer and
// state.lots in step and emits lot.added and lot.removed (growLot emits lot.updated). Each hour it
// also rescores a slice of the empty lots (growth/desirability), so every lot is scored daily.
//
// The pass is idempotent, so it is skipped while nothing it reads has changed since it last ran on
// this state: the network version (roads, buildings, fields, terrain), decor, lots and a zone epoch
// the zone commands bump. That memory is a derived index, never saved: a client that just loaded
// runs the pass once and finds nothing to do, exactly as one that skipped it. When the pass cuts or
// drops lots, the demand bars are written again (lit or quiet: docs/spec/13-ledger.md, Demand).
import { TICKS_PER_HOUR } from '../../constants';
import type { System, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { refreshDemand } from '../growth';
import { DESIRABILITY_SLICES, refreshDesirability } from '../growth/desirability';
import { zoningPass } from './lots';
import { refitStoreys } from './storeys';

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

/** R2F: what the last pass saw, to tell when only grown buildings came since. */
interface Seen {
  version: number;
  epoch: number;
  decor: string;
  buildings: number;
  lastBuilding: number;
  lots: number;
  lastLot: number;
}
const lastSeen = new WeakMap<WorldState, Seen>();

function seenNow(state: WorldState): Seen {
  const b = state.buildings;
  const l = state.lots;
  return {
    version: state.networkVersion,
    epoch: zoneEpochs.get(state) ?? 0,
    decor: decorKey(state),
    buildings: b.length,
    lastBuilding: b.length ? b[b.length - 1]!.id : 0,
    lots: l.length,
    lastLot: l.length ? l[l.length - 1]!.id : 0,
  };
}

/**
 * R2F: true when all that changed since the last pass is buildings grown on lots (each bumped the
 * network version once and stands on lot tiles, its door on the road), so the street lots stand as
 * they are and the pass need not cut them again. A client that just loaded has no memory and runs the
 * whole pass, which finds the same lots (the pass is idempotent on these inputs).
 */
function onlyGrown(state: WorldState, was: Seen | undefined): boolean {
  if (!was) return false;
  const now = seenNow(state);
  const added = now.buildings - was.buildings;
  if (added <= 0 || now.version - was.version !== added) return false;
  if (
    now.epoch !== was.epoch ||
    now.decor !== was.decor ||
    now.lots !== was.lots ||
    now.lastLot !== was.lastLot
  )
    return false;
  const b = state.buildings;
  if (b[was.buildings - 1]?.id !== was.lastBuilding && was.buildings > 0) return false;
  for (let i = was.buildings; i < b.length; i++) if (!b[i]!.lot) return false;
  return true;
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
    // R2F: homes move up a tier and businesses a level without changing the key below.
    refitStoreys(state, ctx);
    const key = inputsKey(state);
    if (lastKeys.get(state) === key) return;
    // Lots last checked against this same decor need not be checked again.
    const decor = decorKey(state);
    const cut = zoningPass(state, ctx, lastDecor.get(state) !== decor, onlyGrown(state, lastSeen.get(state)));
    // R1B: the free lots changed, so the demand bars read again whether land waits for them.
    if (cut.added + cut.removed > 0) refreshDemand(state, ctx);
    lastDecor.set(state, decor);
    lastKeys.set(state, inputsKey(state));
    lastSeen.set(state, seenNow(state));
  },
};
