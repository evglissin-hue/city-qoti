// The guide system slot (C5.0; C5H owns it): checks the open step of the first days guide hourly at
// offset 190 and opens the next with guide.step; over after the last step or on day 6.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

export const guide: System = {
  id: 'guide',
  order: 99,
  every: TICKS_PER_HOUR,
  offset: 190,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
