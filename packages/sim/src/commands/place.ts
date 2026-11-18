import type { PlacePriority } from '../contracts';
import { cleanName, placeState } from '../state/evenings';
import { placesView } from '../view/evenings';
import type { HandlerFor } from './util';

export const rename: HandlerFor<'place.rename'> = {
  type: 'place.rename',
  validate(state, _seat, cmd) {
    if (typeof cmd.id !== 'string' || typeof cmd.name !== 'string') return 'INVALID';
    if (!placeState(state, cmd.id)) return 'NOT_FOUND';
    return cleanName(cmd.name) === null ? 'INVALID' : null;
  },
  apply(state, seat, cmd, ctx) {
    const row = placeState(state, cmd.id)!;
    const name = cleanName(cmd.name)!;
    if (name === '' || name === row.name) {
      delete row.custom;
      delete row.renamedBy;
    } else {
      row.custom = name;
      row.renamedBy = seat;
    }
    ctx.events.push({ e: 'places.updated', p: placesView(state) });
  },
};

const PRIORITIES: readonly PlacePriority[] = ['keep', 'normal', 'rest'];

/**
 * R3.0 (validate and store; R3A's supplies read it): keep a place first, take it as it comes, or let it
 * rest when supplies are short (docs/spec/19-evenings.md, Supplies: which places first). 'normal' is
 * stored as absent. The seat and tick are kept for the fourth gap's credit.
 */
export const setPriority: HandlerFor<'place.setPriority'> = {
  type: 'place.setPriority',
  validate(state, _seat, cmd) {
    if (typeof cmd.id !== 'string' || !PRIORITIES.includes(cmd.priority)) return 'INVALID';
    return placeState(state, cmd.id) ? null : 'NOT_FOUND';
  },
  apply(state, seat, cmd, ctx) {
    const row = placeState(state, cmd.id)!;
    if (cmd.priority === 'normal') delete row.priority;
    else row.priority = cmd.priority;
    row.prioritySet = { seat, tick: state.tick };
    ctx.events.push({ e: 'places.updated', p: placesView(state) });
  },
};
