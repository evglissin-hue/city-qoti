import { content } from '@qoti/content';
import { ALLOWED_WHEN_APART, handlerFor } from './commands';
import type {
  Command,
  RejectReason,
  Rng,
  RngStream,
  SeatedCommand,
  TickCtx,
  Turn,
  WorldState,
} from './contracts';
import { Dirty } from './map/dirty';
import { StreamRng, streamIndex } from './rng/streams';
import { canPaintRoad } from './rules/road';
import { effectiveSpeed } from './speed';
import { worldIndex } from './state/worldIndex';
import { isSkipped, pipeline } from './systems';
import { clockView } from './view';

export { effectiveSpeed } from './speed';

/** A TickCtx with the concrete Dirty tracker, so callers can collect LayerPatches. */
export interface SimCtx extends TickCtx {
  dirty: Dirty;
}

/** Context bound to one WorldState: its RNG streams, an event list and a dirty tracker. */
export function createTickCtx(state: WorldState): SimCtx {
  const rngs = new Map<RngStream, Rng>();
  return {
    events: [],
    content,
    dirty: new Dirty(),
    rng(stream) {
      let rng = rngs.get(stream);
      if (!rng) {
        rng = new StreamRng(state.rng, streamIndex(stream) * 4);
        rngs.set(stream, rng);
      }
      return rng;
    },
  };
}

/** Validates and applies one command. A rejection changes nothing and emits command.rejected. */
export function executeCommand(state: WorldState, sc: SeatedCommand, ctx: TickCtx): boolean {
  const reject = (reason: RejectReason, detail?: string) => {
    ctx.events.push(
      detail === undefined
        ? { e: 'command.rejected', seat: sc.seat, seq: sc.seq, reason }
        : { e: 'command.rejected', seat: sc.seat, seq: sc.seq, reason, detail },
    );
    return false;
  };
  const cmd: Command | undefined = sc.cmd;
  const handler = cmd ? handlerFor(cmd) : undefined;
  if (!cmd || !handler) return reject('INVALID', 'unknown command');
  if (state.settings.togetherOnly && state.time.connected.length < 2 && !ALLOWED_WHEN_APART.has(cmd.t)) {
    return reject('TOGETHER_ONLY');
  }
  let reason: RejectReason | null;
  try {
    reason = handler.validate(state, sc.seat, cmd as never);
  } catch {
    // Malformed input from the network. Every client throws on the same input, so this stays in sync.
    reason = 'INVALID';
  }
  if (reason) return reject(reason, rejectDetail(state, cmd));
  handler.apply(state, sc.seat, cmd as never, ctx);
  return true;
}

/** Where a road run failed ("x,z"), so the client can show the message at the right tile. */
function rejectDetail(state: WorldState, cmd: Command): string | undefined {
  if (cmd.t !== 'road.paint') return undefined;
  try {
    const bad = canPaintRoad(worldIndex(state).reader, cmd.kind, cmd.tiles).firstBadTile;
    return bad ? `${bad[0]},${bad[1]}` : undefined;
  } catch {
    return undefined;
  }
}

/** One tick: every system whose schedule matches, in order. The clock system advances state.tick. */
export function runTick(state: WorldState, ctx: TickCtx): void {
  const t = state.tick;
  for (const system of pipeline) {
    const every = system.every ?? 1;
    if (t % every === (system.offset ?? 0) && !isSkipped(system.id)) system.tick(state, ctx);
  }
}

/**
 * Applies a turn: its commands in order, then effectiveSpeed(state) ticks. Turns must arrive in
 * sequence; use applyTurns to fill gaps left by empty turns, which the room does not store.
 */
export function applyTurn(state: WorldState, turn: Turn, ctx: TickCtx): void {
  if (turn.t !== state.lastTurn + 1) throw new Error(`Turn ${turn.t} cannot follow turn ${state.lastTurn}`);
  const before = effectiveSpeed(state);
  for (const sc of turn.cmds) executeCommand(state, sc, ctx);
  state.lastTurn = turn.t;
  const speed = effectiveSpeed(state);
  if (speed !== before) ctx.events.push({ e: 'clock', c: clockView(state) });
  for (let i = 0; i < speed; i++) runTick(state, ctx);
}

/** Applies turns in order, filling any gap with empty turns. Turns at or before lastTurn are skipped. */
export function applyTurns(state: WorldState, turns: readonly Turn[], ctx: TickCtx): void {
  for (const turn of turns) {
    if (turn.t <= state.lastTurn) continue;
    while (state.lastTurn + 1 < turn.t) applyTurn(state, { t: state.lastTurn + 1, cmds: [] }, ctx);
    applyTurn(state, turn, ctx);
  }
}

/** Applies empty turns until lastTurn reaches t. */
export function advanceTo(state: WorldState, t: number, ctx: TickCtx): void {
  while (state.lastTurn < t) applyTurn(state, { t: state.lastTurn + 1, cmds: [] }, ctx);
}
