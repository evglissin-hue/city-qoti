// Claiming the next rank (C4.0 baseline; C4D owns the Charter). docs/spec/15-progression.md, Ranks
// and Charters. Every goal met opens the claim; the claim grants the rank, unlocks the Charter's
// list (into hearth.unlocked, beside the Pattern Book's) and puts the next Charter on the board.
import { content } from '@qoti/content';
import { isStandard } from '../state/hamlet';
import { startCharter } from '../state/village';
import { celebrateRank, refreshCharter } from '../systems/charter';
import { townView } from '../view';
import { charterView } from '../view/village';
import type { HandlerFor } from './util';

export const claim: HandlerFor<'charter.claim'> = {
  type: 'charter.claim',
  validate(state) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    if (!content.charterById.get(state.charter.charter)) return 'NOT_FOUND';
    return state.charter.ready ? null : 'NOT_READY';
  },
  apply(state, _seat, _cmd, ctx) {
    const def = content.charterById.get(state.charter.charter)!;
    const history = [
      ...state.charter.history,
      { rank: def.rank, tick: state.tick, seats: [...state.time.connected] },
    ];
    for (const u of def.unlocks) if (!state.hearth.unlocked.includes(u)) state.hearth.unlocked.push(u);
    state.charter = { ...startCharter(def.rank), history };
    refreshCharter(state, null);
    const text = def.proclamation.split('{town}').join(state.settings.townName);
    celebrateRank(state, ctx, def.rank, text);
    ctx.events.push({ e: 'rank.up', rank: def.rank, text });
    ctx.events.push({ e: 'charter.updated', c: charterView(state) });
    ctx.events.push({ e: 'town.updated', t: townView(state) });
  },
};
