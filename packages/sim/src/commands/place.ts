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
