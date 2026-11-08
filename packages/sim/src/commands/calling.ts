// Choosing what the village is known for (P1, playtest item 19; docs/spec/15-progression.md,
// Callings). Once, from the two the County offered at the Village claim. In a valley for two both
// seats must be here; a solo valley chooses alone.
import { callingPhrases, content } from '@qoti/content';
import { dayIndex } from '../systems/economy/time';
import { isStandard } from '../state/hamlet';
import { fillText } from '../view/hamlet';
import { townView } from '../view';
import { charterView } from '../view/village';
import { chronicle } from '../systems/chronicle/api';
import { creditText } from '../systems/chronicle/text';
import { markLanterns } from '../systems/hearth/charm';
import { markCharmSoon } from '../systems/hearth/charm/dirty';
import type { HandlerFor } from './util';

export const choose: HandlerFor<'calling.choose'> = {
  type: 'calling.choose',
  validate(state, _seat, cmd) {
    if (!isStandard(state) || !state.calling || state.calling.chosen !== null) return 'NOT_ALLOWED';
    if (typeof cmd.id !== 'string' || !state.calling.offered.includes(cmd.id)) return 'INVALID';
    if (state.seats.length >= 2 && state.time.connected.length < 2) return 'TOGETHER_ONLY';
    return null;
  },
  apply(state, _seat, cmd, ctx) {
    const calling = state.calling!;
    const def = content.callingById.get(cmd.id)!;
    calling.chosen = def.id;
    calling.day = dayIndex(state.tick);
    const piece = content.decorById.get(def.signature);
    if (piece && !state.hearth.unlocked.includes(piece.id)) state.hearth.unlocked.push(piece.id);
    chronicle(state, ctx, 'calling', {
      text: [
        ['calling', def.name],
        ['credit', creditText(state, ctx, state.time.connected)],
      ],
      seats: [...state.time.connected],
    });
    ctx.events.push({
      e: 'notify',
      kind: 'letter',
      text: fillText(callingPhrases.chosen, [
        ['town', state.settings.townName],
        ['calling', def.name],
        ['signature', (piece?.name ?? def.signature).toLowerCase()],
      ]),
    });
    // Lit lanterns count for more at once, not at the next dusk.
    if (def.lanternCharm && markLanterns(state)) markCharmSoon(state);
    ctx.events.push({ e: 'charter.updated', c: charterView(state) });
    ctx.events.push({ e: 'town.updated', t: townView(state) });
  },
};
