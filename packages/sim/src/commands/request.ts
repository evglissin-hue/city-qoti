// Requests between seats (C4.0 baseline; C4D owns them). docs/spec/16-coop.md, Requests: goods
// (good, quantity, by when, where), charm (an area and a target) or free text.
import { content } from '@qoti/content';
import { MAP_SIZE, MAX_NOTE_CHARS, MAX_REQUESTS } from '../constants';
import type { RequestAsk, SeatRequest } from '../contracts';
import { isInt } from '../rules/geometry';
import { findById } from '../state/entities';
import { requestView } from '../view/village';
import { takeId, trimmed, type HandlerFor } from './util';

function validAsk(a: unknown): a is RequestAsk {
  if (!a || typeof a !== 'object') return false;
  const ask = a as RequestAsk;
  if (ask.kind === 'text') return trimmed(ask.text, MAX_NOTE_CHARS) !== null;
  if (ask.kind === 'goods') {
    return (
      typeof ask.good === 'string' &&
      content.goodIndex.has(ask.good) &&
      isInt(ask.qty) &&
      ask.qty > 0 &&
      isInt(ask.byDay) &&
      ask.byDay >= 0 &&
      isInt(ask.at) &&
      ask.at >= 0
    );
  }
  if (ask.kind === 'charm') {
    return (
      isInt(ask.x) &&
      isInt(ask.z) &&
      ask.x >= 0 &&
      ask.z >= 0 &&
      ask.x < MAP_SIZE &&
      ask.z < MAP_SIZE &&
      isInt(ask.radius) &&
      ask.radius >= 1 &&
      ask.radius <= 16 &&
      isInt(ask.target) &&
      ask.target >= 1 &&
      ask.target <= 100
    );
  }
  return false;
}

export const add: HandlerFor<'request.add'> = {
  type: 'request.add',
  validate(state, _seat, cmd) {
    if (!validAsk(cmd.ask)) return 'INVALID';
    if (cmd.ask.kind === 'goods' && cmd.ask.at && !findById(state.buildings, cmd.ask.at)) return 'NOT_FOUND';
    return state.requests.filter((r) => r.status === 'open').length >= MAX_REQUESTS ? 'TOO_MANY' : null;
  },
  apply(state, seat, cmd, ctx) {
    const ask: RequestAsk =
      cmd.ask.kind === 'text'
        ? { kind: 'text', text: trimmed(cmd.ask.text, MAX_NOTE_CHARS)! }
        : { ...cmd.ask };
    const r: SeatRequest = {
      id: takeId(state),
      from: seat,
      ask,
      tick: state.tick,
      status: 'open',
      closedTick: 0,
    };
    state.requests.push(r);
    ctx.events.push({ e: 'request.added', r: requestView(state, r) });
  },
};

export const resolve: HandlerFor<'request.resolve'> = {
  type: 'request.resolve',
  validate(state, _seat, cmd) {
    if (cmd.status !== 'done' && cmd.status !== 'withdrawn') return 'INVALID';
    const r = isInt(cmd.id) ? findById(state.requests, cmd.id) : undefined;
    return r?.status === 'open' ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    const r = findById(state.requests, cmd.id)!;
    r.status = cmd.status;
    r.closedTick = state.tick;
    if (cmd.status === 'done') state.village.requestsFulfilled += 1;
    ctx.events.push({ e: 'request.updated', r: requestView(state, r) });
  },
};
