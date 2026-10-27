// Services (docs/spec/13-ledger.md, Services; docs/build/i2-wave-notes.md). Hourly at offset 110
// the social, health and education needs move a quarter of the way toward what the tavern, the
// herbalist and the school give each household: full cover 100, cover out of supplies 60, none 25
// (education 45: lessons at the kitchen table). Residents without the need (Settlers, and the
// tavern for children) hold it at 100, so it never weighs on them. Mood picks the needs up on the
// household's own hourly pass (systems/residents).
import { TICKS_PER_HOUR } from '../../constants';
import type { EntityId, System, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { serviceCoverage } from './coverage';
import { hasServiceNeed, SERVICE_KINDS, SERVICE_NEED, type ServiceKind } from './weights';

/** Need level without cover, per service (tune). */
export const UNCOVERED: Readonly<Record<ServiceKind, number>> = { social: 25, health: 25, education: 45 };

/** Moves a need a quarter of the way to its target (at least one point), as C3A's needs do. */
function approach(current: number, target: number): number {
  if (current === target) return current;
  const step = Math.trunc((target - current) / 4);
  return current + (step !== 0 ? step : target > current ? 1 : -1);
}

/** One hourly pass over every household (exported for tests). */
export function updateServices(state: WorldState): void {
  const covers = new Map<ServiceKind, Map<EntityId, number>>();
  for (const kind of SERVICE_KINDS) covers.set(kind, serviceCoverage(state, kind).quality);
  for (const h of state.households) {
    for (const id of h.members) {
      const r = findById(state.residents, id);
      if (!r) continue;
      for (const kind of SERVICE_KINDS) {
        const i = SERVICE_NEED[kind];
        if (!hasServiceNeed(r.tier, r.stage, kind)) {
          r.needs[i] = 100;
          continue;
        }
        const target = covers.get(kind)!.get(h.id) ?? UNCOVERED[kind];
        r.needs[i] = approach(r.needs[i] ?? 100, target);
      }
    }
  }
}

export const services: System = {
  id: 'services',
  order: 56,
  every: TICKS_PER_HOUR,
  offset: 110,
  tick(state) {
    if (!isStandard(state)) return;
    updateServices(state);
  },
};
