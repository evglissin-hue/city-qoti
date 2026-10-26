// The sim worker: owns the WorldState, applies turns as they arrive, posts view updates.
import {
  agentFrame,
  applyTurn,
  buildView,
  createTickCtx,
  createWorld,
  deserialize,
  HASH_EVERY_TURNS,
  hashState,
  inspect,
  serialize,
  type SimCtx,
  type Turn,
  type WorldState,
} from '@qoti/sim';
import type { FromWorker, ToWorker } from './messages';

interface WorkerScope {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(msg: FromWorker, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
let state: WorldState | null = null;
let ctx: SimCtx | null = null;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer);
}

/** Applies turns in order, filling gaps; live turns post a hash every HASH_EVERY_TURNS. */
function advance(s: WorldState, c: SimCtx, turns: readonly Turn[], live: boolean): void {
  const step = (turn: Turn) => {
    applyTurn(s, turn, c);
    if (live && s.lastTurn % HASH_EVERY_TURNS === 0) post({ k: 'hash', t: s.lastTurn, h: hashState(s) });
  };
  for (const turn of turns) {
    if (turn.t <= s.lastTurn) continue;
    while (s.lastTurn + 1 < turn.t) step({ t: s.lastTurn + 1, cmds: [] });
    step(turn);
  }
}

scope.onmessage = (e) => {
  const msg = e.data;
  try {
    switch (msg.k) {
      case 'init': {
        state =
          msg.source.kind === 'new'
            ? createWorld(msg.source.seed, msg.source.settings)
            : deserialize(msg.source.data);
        ctx = createTickCtx(state);
        if (msg.turns) advance(state, ctx, msg.turns, false);
        ctx.events.length = 0;
        ctx.dirty.clear();
        post({ k: 'ready', view: buildView(state) });
        break;
      }
      case 'turns': {
        if (!state || !ctx) throw new Error('Turns arrived before init');
        advance(state, ctx, msg.turns, true);
        const patches = ctx.dirty.collectPatches(state.map);
        const events = ctx.events;
        ctx.events = [];
        post(
          { k: 'update', t: state.lastTurn, tick: state.tick, events, patches },
          patches.map((p) => p.data.buffer as ArrayBuffer),
        );
        if (state.residents.length > 0) {
          const data = agentFrame(state);
          post({ k: 'agents', t: state.lastTurn, data }, [data.buffer as ArrayBuffer]);
        }
        break;
      }
      case 'snapshot': {
        if (!state) throw new Error('Snapshot requested before init');
        const data = serialize(state);
        post({ k: 'snapshot', reqId: msg.reqId, t: state.lastTurn, data }, [data.buffer as ArrayBuffer]);
        break;
      }
      case 'inspect': {
        if (!state) throw new Error('Inspect requested before init');
        post({ k: 'inspected', reqId: msg.reqId, data: inspect(state, msg.kind, msg.id) });
        break;
      }
      case 'hash': {
        if (!state) throw new Error('Hash requested before init');
        post({ k: 'hash', t: state.lastTurn, h: hashState(state), reqId: msg.reqId });
        break;
      }
    }
  } catch (err) {
    post({ k: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
