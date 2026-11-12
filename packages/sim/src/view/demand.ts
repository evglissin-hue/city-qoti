// The demand bars' view (docs/spec/13-ledger.md, Demand; R1B owns it). Split from view/zones.ts on
// the wave's first day. Views may use floats freely: nothing here feeds state.
import { content } from '@qoti/content';
import { DEMAND_KINDS } from '../constants';
import type { DemandBarView, DemandReason, DemandView, WorldState } from '../contracts';

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
    case 'marketStall':
      return 'Shops open with the Village charter. Until then, a Market Stall does the job.';
    case 'hands':
      return 'Businesses already stand empty for want of hands. Newcomers first, then more of them.';
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
