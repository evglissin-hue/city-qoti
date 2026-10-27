// The first days guide (C5.0 baseline; C5H owns it). docs/build/cycle-05h-first-days.md. Hiding is
// per seat; progress is shared.
import { guideView } from '../view/seasons';
import type { HandlerFor } from './util';

export const setHidden: HandlerFor<'guide.setHidden'> = {
  type: 'guide.setHidden',
  validate: (_state, _seat, cmd) => (typeof cmd.on === 'boolean' ? null : 'INVALID'),
  apply(state, seat, cmd, ctx) {
    state.guide.hidden[seat] = cmd.on;
    ctx.events.push({ e: 'guide.step', g: guideView(state) });
  },
};
