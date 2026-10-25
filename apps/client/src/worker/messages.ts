// Worker contract (docs/spec/20-architecture.md, I0 contracts). Additive changes only during waves.
import type { LayerPatch, SimEvent, Turn, ValleySettings, ViewSnapshot } from '@qoti/sim';

export type InitSource =
  { kind: 'new'; seed: string; settings: ValleySettings } | { kind: 'snapshot'; data: Uint8Array };

export type ToWorker =
  | {
      k: 'init';
      source: InitSource;
      /** C1 addition: catch-up turns applied before `ready`, gaps filled with empty turns. */
      turns?: Turn[];
    }
  | { k: 'turns'; turns: Turn[] }
  | { k: 'snapshot'; reqId: number }
  /** C1 addition: reqId pairs an explicit request with its reply. */
  | { k: 'hash'; reqId?: number };

export type FromWorker =
  | { k: 'ready'; view: ViewSnapshot }
  /** C1 addition: tick is the sim tick after the batch, so clocks move between hourly events. */
  | { k: 'update'; t: number; tick?: number; events: SimEvent[]; patches: LayerPatch[] }
  /** I1. */
  | { k: 'agents'; t: number; data: Float32Array }
  /** Every 50 turns, and in reply to a hash request (with its reqId). */
  | { k: 'hash'; t: number; h: string; reqId?: number }
  | { k: 'snapshot'; reqId: number; t: number; data: Uint8Array }
  | { k: 'error'; message: string };
