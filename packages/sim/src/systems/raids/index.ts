// The raids system slot (C5.0; C5D owns it): runs a raid tick by tick from dusk to dawn: raiders
// spawn, path, loot and flee; the Watch guards and intercepts; nobody is hurt.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

export const raids: System = {
  id: 'raids',
  order: 84,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
