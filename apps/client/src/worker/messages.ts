// Worker contract (docs/spec/20-architecture.md, I0 contracts). Additive changes only during waves.
import type {
  InspectKind,
  InspectResult,
  LayerPatch,
  SimEvent,
  ThreadSubject,
  ThreadView,
  Turn,
  ValleySettings,
  ViewSnapshot,
} from '@qoti/sim';

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
  | { k: 'hash'; reqId?: number }
  /**
   * I1 (C3.0): full detail for an inspector or the away letter. kind 'resident' and 'building' take
   * an entity id; 'away' takes a seat. Answered by `inspected` with the same reqId.
   */
  | { k: 'inspect'; reqId: number; kind: InspectKind; id: number }
  /** R3D: a Thread, the one sentence of where a thing came from and where it goes. Answered by `threaded`. */
  | { k: 'thread'; reqId: number; subject: ThreadSubject }
  /** Debug only (C3X): nudges the state so this seat's hash drifts, for resync tests. */
  | { k: 'debugCorrupt' }
  /**
   * R3D, debug only (e2e): records door pairs as if goods had moved, so a Thread can be read from the
   * real sim on a fixture whose evenings sell few Treats. Each pair: from, to (a building id or a
   * PlaceId), the good's id, units. Like debugCorrupt, this sim then drifts from a room's.
   */
  | { k: 'debugThreads'; pairs: [from: number, to: number | string, good: string, units: number][] };

export type FromWorker =
  | { k: 'ready'; view: ViewSnapshot }
  /** C1 addition: tick is the sim tick after the batch, so clocks move between hourly events. */
  | { k: 'update'; t: number; tick?: number; events: SimEvent[]; patches: LayerPatch[] }
  /** I1: agent frame after each batch of turns (stride AGENT_STRIDE, see @qoti/sim view/agents). */
  | { k: 'agents'; t: number; data: Float32Array }
  /** I1 (C3.0): reply to `inspect`; null when the entity is gone. */
  | { k: 'inspected'; reqId: number; data: InspectResult }
  /** R3D: reply to `thread`; null when the subject is gone. */
  | { k: 'threaded'; reqId: number; data: ThreadView | null }
  /** Every 50 turns, and in reply to a hash request (with its reqId). */
  | { k: 'hash'; t: number; h: string; reqId?: number }
  | { k: 'snapshot'; reqId: number; t: number; data: Uint8Array }
  | { k: 'error'; message: string };
