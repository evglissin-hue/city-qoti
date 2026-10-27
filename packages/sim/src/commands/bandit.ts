// Captured bandits (C5.0 baseline; C5D owns them). docs/spec/14-challenge.md, Captured bandits:
// either seat offers them a home (they join with the Reformed trait and bond 0; C5D creates the
// resident) or sends them off (renown +1).
import { isInt } from '../rules/geometry';
import { addRenown } from '../systems/renown/api';
import { threatView } from '../view/seasons';
import type { HandlerFor } from './util';

/** Renown for sending a captured bandit off. */
export const SEND_OFF_RENOWN = 1;

export const decide: HandlerFor<'bandit.decide'> = {
  type: 'bandit.decide',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id) || (cmd.choice !== 'home' && cmd.choice !== 'send')) return 'INVALID';
    return state.threats.captives.includes(cmd.id) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    state.threats.captives = state.threats.captives.filter((id) => id !== cmd.id);
    // C5D: 'home' makes a Reformed resident (a household of one, looking for a home).
    if (cmd.choice === 'send') addRenown(state, ctx, SEND_OFF_RENOWN, 'send-off');
    ctx.events.push({ e: 'threat.updated', t: threatView(state) });
  },
};
