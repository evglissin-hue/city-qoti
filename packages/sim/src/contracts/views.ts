// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves.
import type { EntityId, LayerName, Lens, Rot4, SeatId, Speed } from './ids';
import type { ValleySettings } from './settings';
import type { WorldState } from './state';

export interface BuildingView {
  id: EntityId;
  def: string;
  x: number;
  z: number;
  rot: Rot4;
  builtBy: SeatId;
  handmade: boolean;
  stage: 'construction' | 'built';
  foundation: boolean;
  custom?: Record<string, string | boolean>;
}

export interface DecorView {
  id: EntityId;
  def: string;
  fx: number;
  fz: number;
  rot: number;
  builtBy: SeatId;
}

export interface NoteView {
  id: EntityId;
  x: number;
  z: number;
  text: string;
  by: SeatId;
  tick: number;
}

export interface SeatView {
  seat: SeatId;
  name: string;
  color: number;
  lens: Lens;
  connected: boolean;
  desiredSpeed: Speed;
  lastSeenTick: number;
}

export interface ClockView {
  tick: number;
  /** Effective speed. */
  speed: Speed;
  year: number;
  season: 0 | 1 | 2 | 3;
  day: number;
  hour: number;
  minute: number;
}

export interface ViewSnapshot {
  simVersion: string;
  saveVersion: number;
  size: number;
  lastTurn: number;
  layers: Record<LayerName, Uint8Array | Int32Array>;
  buildings: BuildingView[];
  decor: DecorView[];
  notes: NoteView[];
  seats: SeatView[];
  settings: ValleySettings;
  clock: ClockView;
  meta: WorldState['meta'];
}
