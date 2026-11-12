// Pinning a business's trade (R1: docs/spec/13-ledger.md, Choosing a trade). A pinned trade never
// retools by itself (only when its site wants stop being met, R1B); null lets the business choose
// again. The command keeps its I2 name, `build.pinRecipe`.
import { content } from '@qoti/content';
import { isInt } from '../rules/geometry';
import { findById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { hasInnovation, rankAtLeast } from '../state/village';
import { emitBuilding } from '../systems/economy/emit';
import { businessView } from '../view/businesses';
import type { HandlerFor } from './util';

export const pinRecipe: HandlerFor<'build.pinRecipe'> = {
  type: 'build.pinRecipe',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    const b = isInt(cmd.id) ? findById(state.buildings, cmd.id) : undefined;
    if (!b) return 'NOT_FOUND';
    const current = b.trade ? content.tradeById.get(b.trade) : undefined;
    if (!b.rt || !current) return 'NOT_ALLOWED';
    if (cmd.trade === null) return null;
    const next = typeof cmd.trade === 'string' ? content.tradeById.get(cmd.trade) : undefined;
    if (!next || next.zone !== current.zone || next.building !== current.building) return 'INVALID';
    if (next.requires?.rank && !rankAtLeast(state, next.requires.rank)) return 'LOCKED';
    if (next.requires?.innovation && !hasInnovation(state, next.requires.innovation)) return 'LOCKED';
    return null;
  },
  apply(state, _seat, cmd, ctx) {
    const b = findById(state.buildings, cmd.id)!;
    if (cmd.trade === null) {
      delete b.pinned;
    } else {
      if (b.trade !== cmd.trade) {
        b.trade = cmd.trade;
        b.rt!.progress = 0;
      }
      b.pinned = true;
    }
    emitBuilding(state, ctx, b);
    ctx.events.push({ e: 'business.updated', b: businessView(state, b) });
  },
};
