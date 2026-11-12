// The patterns system: the Pattern Book pass each in-game hour (offset 100). R1 (R1D): the Kitchen
// Garden no longer harvests; its garden beds give variety (systems/hearth/garden.ts), not food.
import { TICKS_PER_HOUR } from '../../../constants';
import type { System } from '../../../contracts';
import { isStandard } from '../../../state/hamlet';
import { runPatterns } from './engine';

export const PATTERNS_OFFSET = 100;

export const patterns: System = {
  id: 'patterns',
  order: 72,
  every: TICKS_PER_HOUR,
  offset: PATTERNS_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    runPatterns(state, ctx);
  },
};
