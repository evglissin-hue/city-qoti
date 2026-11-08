// Wheat fields (C3C). docs/spec/13-ledger.md, I1 buildings (Wheat Field). Painting skips tiles
// that cannot be fields (planFields), so a dragged rectangle paints what it can; it is refused
// only when nothing would change, or when the town cannot pay for the new tiles.
import { content } from '@qoti/content';
import { MAP_SIZE, MAX_FIELD_TILES } from '../constants';
import { findById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { book, fieldCost, spendBlocked } from '../systems/economy/api';
import { emitMoney } from '../systems/economy/emit';
import { clearFields, isFarm, paintFields, planFields } from '../systems/production/fields';
import { checkTiles, type HandlerFor } from './util';

export const paint: HandlerFor<'field.paint'> = {
  type: 'field.paint',
  validate(state, _seat, cmd) {
    const bad = checkTiles(cmd.tiles, MAX_FIELD_TILES);
    if (bad) return bad;
    const farm = findById(state.buildings, cmd.farm);
    const def = farm ? content.buildingById.get(farm.def) : undefined;
    if (!farm || !isFarm(def)) return 'NOT_FOUND';
    const plan = planFields(state, farm, def!, cmd.tiles);
    if (plan.reason) return plan.reason;
    return spendBlocked(state, fieldCost(plan.tiles.length));
  },
  apply(state, _seat, cmd, ctx) {
    const farm = findById(state.buildings, cmd.farm)!;
    const plan = planFields(state, farm, content.buildingById.get(farm.def)!, cmd.tiles);
    paintFields(state, ctx, farm, plan.tiles);
    if (isStandard(state)) {
      book(state, 'fields', fieldCost(plan.tiles.length));
      emitMoney(state, ctx);
    }
  },
};

export const remove: HandlerFor<'field.remove'> = {
  type: 'field.remove',
  validate(state, _seat, cmd) {
    const bad = checkTiles(cmd.tiles, MAX_FIELD_TILES);
    if (bad) return bad;
    return cmd.tiles.some(([x, z]) => state.map.fieldOwner[z * MAP_SIZE + x]) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    const tiles: number[] = [];
    for (const [x, z] of cmd.tiles) {
      const i = z * MAP_SIZE + x;
      if (state.map.fieldOwner[i] && !tiles.includes(i)) tiles.push(i);
    }
    clearFields(state, ctx, tiles);
  },
};
