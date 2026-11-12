// R1 views (R1.0): demand bars, the five balances and the businesses. These builders are stand-ins
// that read what exists in R1.0; R1A (balances) and R1B (demand, businesses) replace their insides,
// keeping the shapes in contracts/zones.ts. Views may use floats freely: nothing here feeds state.
import { content } from '@qoti/content';
import { DEMAND_KINDS } from '../constants';
import type {
  Building,
  BusinessView,
  DemandBarView,
  DemandReason,
  DemandView,
  WorldState,
} from '../contracts';
import { hasTag, jobsOf, levelOf } from '../state/zones';

// --- Demand ------------------------------------------------------------------------------------

const goodName = (id: string | undefined): string => content.goodById.get(id ?? '')?.name ?? 'Something';
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** One reason in words, for a bar's hover text. */
export function demandWhy(r: DemandReason): string {
  switch (r.code) {
    case 'newcomers':
      return 'Newcomers would come: there is work, and the town draws them.';
    case 'noOutlet':
      return `${r.value ?? 'Some'} households have no shop in reach.`;
    case 'crowded':
      return 'Every shop already serves more than eight households.';
    case 'short':
      return r.from
        ? `${goodName(r.good)} is short and ${lower(goodName(r.from))} is plentiful.`
        : `${goodName(r.good)} is short.`;
    case 'firstMaker':
      return `Nobody makes ${lower(goodName(r.good))} yet, and ${lower(goodName(r.from))} is made here.`;
    case 'foodCover':
      return 'Food is under four days of cover.';
    case 'imported':
      return `More than a third of the ${lower(goodName(r.good))} comes by carrier.`;
    case 'needsLand':
      return 'The town needs more zoned land for it.';
    case 'lotWaiting':
      return 'A lot is free and waiting: growth is on its way.';
  }
}

/** `demand.updated`: the four bars as the growth pass left them. */
export function demandView(state: WorldState): DemandView {
  const d = state.demand;
  const bars: DemandBarView[] = DEMAND_KINDS.map((kind, i) => {
    const reasons = d.reasons[i] ?? [];
    return { kind, value: d.bars[i] ?? 0, lit: d.lit[i] ?? false, reasons, why: reasons.map(demandWhy) };
  });
  return { bars };
}

// --- Balances (view/balances.ts, R1A) ---------------------------------------------------------

export { balancesView } from './balances';

// --- Businesses --------------------------------------------------------------------------------

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
