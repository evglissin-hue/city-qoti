import { MAP_SIZE, MAX_NOTE_CHARS, MAX_NOTES } from '../constants';
import type { Note } from '../contracts';
import { inBounds } from '../map/layers';
import { isInt } from '../rules/geometry';
import { findById, removeById } from '../state/entities';
import { noteView } from '../view';
import { type HandlerFor, takeId, trimmed } from './util';

export const pin: HandlerFor<'note.pin'> = {
  type: 'note.pin',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.x) || !isInt(cmd.z)) return 'INVALID';
    if (!inBounds(cmd.x, cmd.z, MAP_SIZE)) return 'OUT_OF_BOUNDS';
    if (trimmed(cmd.text, MAX_NOTE_CHARS) === null) return 'INVALID';
    return state.notes.length >= MAX_NOTES ? 'TOO_MANY' : null;
  },
  apply(state, seat, cmd, ctx) {
    const n: Note = {
      id: takeId(state),
      x: cmd.x,
      z: cmd.z,
      text: trimmed(cmd.text, MAX_NOTE_CHARS)!,
      by: seat,
      tick: state.tick,
    };
    state.notes.push(n);
    ctx.events.push({ e: 'note.added', n: noteView(n) });
  },
};

export const remove: HandlerFor<'note.remove'> = {
  type: 'note.remove',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id)) return 'INVALID';
    return findById(state.notes, cmd.id) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    if (removeById(state.notes, cmd.id)) ctx.events.push({ e: 'note.removed', id: cmd.id });
  },
};
