// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves.
import type { RejectReason } from './commands';
import type { EntityId, LayerName, Rect, SeatId } from './ids';
import type { ValleySettings } from './settings';
import type { BuildingView, ClockView, DecorView, NoteView, SeatView } from './views';

export type SimEvent =
  | { e: 'tiles.changed'; rect: Rect; layers: LayerName[] }
  | { e: 'building.added'; b: BuildingView }
  | { e: 'building.updated'; b: BuildingView }
  | { e: 'building.removed'; id: EntityId }
  | { e: 'decor.added'; d: DecorView }
  | { e: 'decor.removed'; id: EntityId }
  | { e: 'note.added'; n: NoteView }
  | { e: 'note.removed'; id: EntityId }
  | { e: 'seat.updated'; s: SeatView }
  | { e: 'settings.updated'; settings: ValleySettings }
  /** On speed change and each in-game hour. */
  | { e: 'clock'; c: ClockView }
  | { e: 'command.rejected'; seat: SeatId; seq: number; reason: RejectReason; detail?: string }
  | { e: 'notify'; kind: string; text: string; seat?: SeatId; at?: [number, number] };

export interface LayerPatch {
  layer: LayerName;
  rect: Rect;
  /** Row-major copy of the rect, (x1 - x0 + 1) * (z1 - z0 + 1) entries. */
  data: Uint8Array | Int32Array;
}
