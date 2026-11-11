// The Businesses book's view (docs/spec/13-ledger.md, Reports: Businesses; R1B owns it). Split from
// view/zones.ts on the wave's first day. Views may use floats freely: nothing here feeds state.
import { content } from '@qoti/content';
import type { Building, BusinessView, WorldState } from '../contracts';
import { hasTag, jobsOf, levelOf } from '../state/zones';

/** True for a business or a specialized building: what the Businesses book lists. */
export function isBusinessLike(b: Building): boolean {
  return !!b.trade || !!content.buildingById.get(b.def)?.specialized;
}

/** Door distance (Manhattan, between footprint corners) a reach is measured in, for the stand-in. */
function near(a: Building, b: Building, reach: number): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) <= reach;
}

/** A status in words. R1 stand-in (R1B): from the stage and who is at work. */
function statusWords(b: Building): string {
  if (b.stage === 'construction') return 'Going up';
  const rt = b.rt;
  if (!rt) return 'Standing';
  if (rt.paused) return 'Paused';
  if (rt.workers.length === 0 && jobsOf(b) > 0) return 'Waiting for hands';
  if (rt.present > 0) return 'At work';
  return 'Resting';
}

/** `business.updated`: one business or specialized building. */
export function businessView(state: WorldState, b: Building): BusinessView {
  const def = content.buildingById.get(b.def);
  const view: BusinessView = {
    id: b.id,
    def: b.def,
    trade: b.trade ?? null,
    level: levelOf(b),
    keeperId: b.keeperId ?? 0,
    pinned: !!b.pinned,
    hands: b.rt?.workers.length ?? 0,
    crew: jobsOf(b),
    status: statusWords(b),
    levelDays: b.counters?.levelDays ?? 0,
  };
  if (def?.capacity && def.enables?.length) {
    let count = 0;
    for (const o of state.buildings) {
      if (o.id !== b.id && def.enables.some((t) => hasTag(o, t)) && near(o, b, def.reach ?? 24)) count++;
    }
    view.served = { count, capacity: def.capacity };
  }
  return view;
}

/** Every business and specialized building, sorted by id. */
export function businessesView(state: WorldState): BusinessView[] {
  return state.buildings.filter(isBusinessLike).map((b) => businessView(state, b));
}
