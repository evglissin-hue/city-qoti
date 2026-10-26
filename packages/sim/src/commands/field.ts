// Wheat fields (C3.0 stubs; C3C owns them). docs/spec/13-ledger.md, I1 buildings (Wheat Field).
import { MAX_FIELD_TILES } from '../constants';
import { findById } from '../state/entities';
import { checkTiles, type HandlerFor } from './util';

export const paint: HandlerFor<'field.paint'> = {
  type: 'field.paint',
  validate(state, _seat, cmd) {
    const bad = checkTiles(cmd.tiles, MAX_FIELD_TILES);
    if (bad) return bad;
    const farm = findById(state.buildings, cmd.farm);
    return farm?.def === 'farmhouse' ? null : 'NOT_FOUND';
  },
  apply() {
    // C3C: terrain field, fieldOwner, cost per tile, charm and walkability changes.
  },
};

export const remove: HandlerFor<'field.remove'> = {
  type: 'field.remove',
  validate(_state, _seat, cmd) {
    return checkTiles(cmd.tiles, MAX_FIELD_TILES);
  },
  apply() {
    // C3C
  },
};
