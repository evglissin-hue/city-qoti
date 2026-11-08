// The renown system (C5B; docs/spec/15-progression.md, Renown). Points arrive through addRenown at
// any time (./api.ts); the trade terms and the pull for arrivals read the level where they are
// used (systems/trade, systems/residents/lifecycle). At 00:06 it settles the rest: on day 2 of each
// season a notable visitor may call with a commission (systems/commissions, offerVisitor), up to
// the level's `visitors` effect.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { offerVisitor } from '../commissions';
import { dailyOffset } from '../economy/time';

export const renown: System = {
  id: 'renown',
  order: 91,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 6),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    offerVisitor(state, ctx);
  },
};
