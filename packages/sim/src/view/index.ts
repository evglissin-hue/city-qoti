// View builders. Their output never feeds back into state, so they may compute floats freely.
import { DEFAULT_SPEED, MAP_SIZE } from '../constants';
import type {
  Building,
  BuildingView,
  ClockView,
  Decor,
  DecorView,
  LayerName,
  Note,
  NoteView,
  SeatId,
  SeatView,
  ViewSnapshot,
  WorldState,
} from '../contracts';
import { LAYER_NAMES } from '../map/layers';
import { effectiveSpeed } from '../speed';
import { calendar } from '../systems/clock/calendar';
import { SIM_VERSION } from '../version.generated';

export function clockView(state: WorldState): ClockView {
  return { tick: state.tick, speed: effectiveSpeed(state), ...calendar(state.tick) };
}

export function buildingView(b: Building): BuildingView {
  const view: BuildingView = {
    id: b.id,
    def: b.def,
    x: b.x,
    z: b.z,
    rot: b.rot,
    builtBy: b.builtBy,
    handmade: b.handmade,
    stage: b.stage,
    foundation: b.foundation,
  };
  if (b.custom) view.custom = { ...b.custom };
  return view;
}

export function decorView(d: Decor): DecorView {
  return { id: d.id, def: d.def, fx: d.fx, fz: d.fz, rot: d.rot, builtBy: d.builtBy };
}

export function noteView(n: Note): NoteView {
  return { id: n.id, x: n.x, z: n.z, text: n.text, by: n.by, tick: n.tick };
}

export function seatView(state: WorldState, seat: SeatId): SeatView {
  const s = state.seats.find((x) => x.seat === seat);
  return {
    seat,
    name: s?.name ?? `Player ${seat + 1}`,
    color: s?.color ?? 0x888888,
    lens: s?.lens ?? 'hearth',
    connected: state.time.connected.includes(seat),
    desiredSpeed: state.time.desired[seat] ?? DEFAULT_SPEED,
    lastSeenTick: s?.lastSeenTick ?? 0,
  };
}

/** Everything the client needs to build its Mirror. Layers are copies. */
export function buildView(state: WorldState): ViewSnapshot {
  const layers = {} as Record<LayerName, Uint8Array | Int32Array>;
  for (const name of LAYER_NAMES) layers[name] = state.map[name].slice();
  return {
    simVersion: SIM_VERSION,
    saveVersion: state.saveVersion,
    size: MAP_SIZE,
    lastTurn: state.lastTurn,
    layers,
    buildings: state.buildings.map(buildingView),
    decor: state.decor.map(decorView),
    notes: state.notes.map(noteView),
    seats: state.seats.map((s) => seatView(state, s.seat)),
    settings: { ...state.settings },
    clock: clockView(state),
    meta: {
      startArea: [...state.meta.startArea],
      valleyGate: [...state.meta.valleyGate],
      flow: state.meta.flow,
    },
  };
}
