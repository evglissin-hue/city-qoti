// Interfaces every command and system codes against (docs/spec/20-architecture.md).
import type { Content } from '@qoti/content';
import type { Command, RejectReason } from './commands';
import type { SimEvent } from './events';
import type { LayerName, Rect, SeatId } from './ids';
import type { WorldState } from './state';

/** Append-only: the order fixes each stream's slot in WorldState.rng. */
export type RngStream = 'worldgen' | 'residents' | 'wishes' | 'weather' | 'threats' | 'misc';

export interface Rng {
  /** Uniform 32-bit unsigned integer. */
  next(): number;
  /** Uniform in [0, 1). */
  float(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform integer in [min, max], inclusive. */
  range(min: number, max: number): number;
  /** Uniform float in [min, max). */
  uniform(min: number, max: number): number;
  chance(p: number): boolean;
}

/** Collects changed tiles by layer so the worker can send LayerPatches for dirty chunks. */
export interface DirtyTracker {
  mark(layer: LayerName, rect: Rect): void;
}

export interface TickCtx {
  events: SimEvent[];
  rng(stream: RngStream): Rng;
  content: Content;
  dirty: DirtyTracker;
}

export interface CommandHandler<C extends Command = Command> {
  type: C['t'];
  /** Pure. Returns null when the command may be applied. */
  validate(state: WorldState, seat: SeatId, cmd: C): RejectReason | null;
  apply(state: WorldState, seat: SeatId, cmd: C, ctx: TickCtx): void;
}

export interface System {
  id: string;
  /** 10 clock, 20 construction, 30 production, 40 logistics, 50 residents, 60 economy,
   *  70 hearth, 80 threats, 90 progression, 100 chronicle. */
  order: number;
  /** Run when tick % every === offset (default every tick). */
  every?: number;
  offset?: number;
  tick(state: WorldState, ctx: TickCtx): void;
}
