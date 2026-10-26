// Story arcs (docs/spec/11-residents.md, Story characters). C4.0 stub: registered, does nothing
// yet. C4D checks arrivals (moving the character in, then storyStep from -1 to 0) and step goals
// hourly at offset 120, and calls storyStep (./api) as goals are met.
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';

export const stories: System = {
  id: 'stories',
  order: 96,
  every: TICKS_PER_HOUR,
  offset: 120,
  tick() {},
};
