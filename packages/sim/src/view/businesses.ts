// The Businesses book's view (docs/spec/13-ledger.md, Reports: Businesses; R1B owns it). Split from
// view/zones.ts on the wave's first day. Views may use floats freely: nothing here feeds state.
import { content } from '@qoti/content';
import { BuildingStatus } from '../constants';
import type { Building, BusinessView, WorldState } from '../contracts';
import { seasonAt } from '../state/seasons';
import { familyIndex, familyOf, jobsOf, levelOf, methodOf } from '../state/zones';
import { outOfSeason } from '../systems/levels/season';
import { goodOutOfSeason } from '../systems/seasons/growing';
import { buildingProfit } from '../systems/market/profit';
import { capacityOf, served } from '../systems/specialized/api';

/** True for a business or a specialized building: what the Businesses book lists. */
export function isBusinessLike(b: Building): boolean {
  return !!b.trade || !!content.buildingById.get(b.def)?.specialized;
}

/** What a trade is doing while its hands are at work (docs/spec/13-ledger.md, Zoning and growth). */
const DOING: Record<string, string> = {
  baker: 'Baking',
  carpenter: 'Making furniture',
  chandler: 'Dipping candles',
  'cider-maker': 'Pressing cider',
  dairy: 'Making cheese',
  'grain-farm': 'Tending the fields',
  hives: 'Minding the bees',
  'market-garden': 'Hoeing the rows',
  orchard: 'Picking fruit',
  'sheep-run': 'Minding the flock',
  shop: 'Open',
  weaver: 'Weaving',
};

function nameOf(id: string): string {
  return (content.goodById.get(id)?.name ?? id).toLowerCase();
}

/** The first good the method makes or takes that is not in season, by lowercase name. */
function seasonGood(state: WorldState, b: Building): string {
  const m = methodOf(b);
  for (const [g] of [...(m?.outputs ?? []), ...(m?.inputs ?? [])]) {
    if (goodOutOfSeason(state, g)) return nameOf(g);
  }
  return 'goods';
}

/** Short of a raw good: whether the carrier may bring it decides the second half. */
function rawWords(state: WorldState, b: Building): string {
  const m = methodOf(b);
  let good = 'goods';
  for (const [id, qty] of m?.inputs ?? []) {
    const g = content.goodIndex.get(id);
    if (g !== undefined && (b.rt?.input[g] ?? 0) < qty) {
      good = nameOf(id);
      break;
    }
  }
  const made = content.goodIndex.get(m?.outputs[0]?.[0] ?? '');
  const rule = made === undefined ? 'never' : state.carrier.families[familyIndex(familyOf(made))]!.rule;
  return rule === 'never'
    ? `Resting: no ${good}, and the carrier may not bring it`
    : `Resting: no ${good}; the carrier brings some at ten`;
}

/** A business's state in words: warm, dry and short. */
function businessWords(state: WorldState, b: Building): string {
  const rt = b.rt!;
  const st = rt.status;
  if (st & BuildingStatus.resting) {
    if (outOfSeason(state, b)) {
      return seasonAt(state.tick).season === 3
        ? 'Resting till spring'
        : `Resting: no ${seasonGood(state, b)} this season`;
    }
    if (st & BuildingStatus.outputFull) return 'Resting: the shelves are full';
    if (st & BuildingStatus.missingInput) return rawWords(state, b);
    if (st & BuildingStatus.fallow) return 'Resting: the fields lie ready for spring';
    if (st & BuildingStatus.noFields) return 'Resting: no fields to tend';
    return 'Resting';
  }
  if (st & BuildingStatus.missingInput && rt.workers.length > 0) return rawWords(state, b);
  if (rt.workers.length === 0 && jobsOf(b) > 0) return 'Waiting for hands';
  if (rt.present > 0) return DOING[b.trade ?? ''] ?? 'At work';
  return 'Resting';
}

/** A status in words, from the stage and the status bits. */
function statusWords(state: WorldState, b: Building): string {
  if (b.stage === 'construction') return 'Going up';
  const rt = b.rt;
  if (!rt) return 'Standing';
  if (rt.paused) return 'Paused';
  if (b.trade) return businessWords(state, b);
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
    status: statusWords(state, b),
    levelDays: b.counters?.levelDays ?? 0,
  };
  if (def?.capacity && def.enables?.length) {
    view.served = { count: served(state, b), capacity: capacityOf(state, b) };
  }
  const profit = b.trade && b.stage === 'built' && def ? buildingProfit(state, b, def) : null;
  if (profit) {
    const takes = profit.lines.filter((l) => l.pennies > 0).reduce((n, l) => n + l.pennies, 0);
    view.profit = { takes, pays: takes - profit.perDay };
  }
  return view;
}

/** Every business and specialized building, sorted by id. */
export function businessesView(state: WorldState): BusinessView[] {
  return state.buildings.filter(isBusinessLike).map((b) => businessView(state, b));
}
