// Requests between seats (docs/spec/16-coop.md, Requests; C4D). request.add and request.resolve
// work by hand; hourly at offset 130 this pass closes goods and charm requests once they are met
// (counting village.requestsFulfilled, which Odette's arc and the Together goals read), sends the
// asker a note, and emits request.updated when an open request's progress moved. The last progress
// sent lives in a derived index, never in saved state.
import { lifePhrases } from '@qoti/content';
import { TICKS_PER_HOUR } from '../../constants';
import type { EntityId, SeatRequest, System, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { fillText } from '../../view/hamlet';
import { requestProgress, requestText, requestView } from '../../view/village';

export const requests: System = {
  id: 'requests',
  order: 98,
  every: TICKS_PER_HOUR,
  offset: 130,
  tick(state, ctx) {
    if (isStandard(state)) checkRequests(state, ctx);
  },
};

const sent = new WeakMap<WorldState, Map<EntityId, number>>();

/** Closes met requests and reports progress on the rest. Returns the ids closed. */
export function checkRequests(state: WorldState, ctx: TickCtx): EntityId[] {
  let last = sent.get(state);
  if (!last) sent.set(state, (last = new Map()));
  const closed: EntityId[] = [];
  for (const r of state.requests) {
    if (r.status !== 'open') {
      last.delete(r.id);
      continue;
    }
    const p = requestProgress(state, r);
    if (!p) continue;
    if (p.value >= p.target) {
      fulfill(state, ctx, r);
      closed.push(r.id);
      last.delete(r.id);
      continue;
    }
    if (last.get(r.id) === p.value) continue;
    const first = !last.has(r.id);
    last.set(r.id, p.value);
    // The first look only remembers: request.added (or the snapshot) already carried the progress.
    if (!first) ctx.events.push({ e: 'request.updated', r: requestView(state, r) });
  }
  return closed;
}

/** Marks a request done, counts it, and tells the seat that asked. */
export function fulfill(state: WorldState, ctx: TickCtx, r: SeatRequest): void {
  r.status = 'done';
  r.closedTick = state.tick;
  state.village.requestsFulfilled += 1;
  ctx.events.push({ e: 'request.updated', r: requestView(state, r) });
  ctx.events.push({
    e: 'notify',
    kind: 'letter',
    seat: r.from,
    text: fillText(lifePhrases.requestDone, [['what', requestText(state, r)]]),
  });
}
