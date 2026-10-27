// The defenses system slot (C5.0; C5D owns it): walls take damage and gates close while a raid
// runs; towers lower raiders' morale; traps spring.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

export const defenses: System = {
  id: 'defenses',
  order: 86,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
