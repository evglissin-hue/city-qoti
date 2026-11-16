// The demand bars' view (docs/spec/13-ledger.md, Demand; R1B owns it). Split from view/zones.ts on
// the wave's first day. Views may use floats freely: nothing here feeds state.
import { content } from '@qoti/content';
import { DEMAND_KINDS } from '../constants';
import type { DemandBarView, DemandReason, DemandView, WorldState } from '../contracts';

const goodName = (id: string | undefined): string => content.goodById.get(id ?? '')?.name ?? 'Something';
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** "a Windmill", "an Apiary". */
const withArticle = (name: string): string => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;

/** P2: free lots that suit nothing wanted, by the site want they fail (unmetWant in growth/site.ts). */
function unsuitableWords(r: DemandReason): string {
  const what = r.good ? lower(goodName(r.good)) : null;
  const want = r.want ?? '';
  if (want === 'households') return 'Lots are free, but none is in reach of the homes that lack a shop.';
  if (want === 'fields') {
    return 'Lots are free, but none has open Farmland behind it for fields. Zone Farmland deeper.';
  }
  if (want === 'fertility')
    return `Lots are free, but the soil there is too thin for ${what ?? 'what is wanted'}.`;
  if (want === 'pollinators') {
    return `Lots are free, but ${what ?? 'what is wanted'} wants more flowers and bees about than they have.`;
  }
  if (want.startsWith('reach:')) {
    const name = content.buildingById.get(want.slice(6))?.name ?? 'the building it works with';
    return `Lots are free, but none is in reach of ${withArticle(name)} with room to spare.`;
  }
  return what
    ? `Lots are free, but none suits a maker of ${what}.`
    : 'Lots are free, but none suits what the town wants.';
}

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
      return r.value !== undefined
        ? `A lot is free and waiting. Building starts at ${r.value}:00.`
        : 'A lot is free and waiting: growth is on its way.';
    case 'marketStall':
      return 'Shops open with the Village charter. Until then, a Market Stall does the job.';
    case 'hands':
      return 'Businesses already stand empty for want of hands. Newcomers first, then more of them.';
    case 'noRoad':
      return 'Land is zoned for it, but no street runs along it. Lots are cut along streets.';
    case 'outOfReach':
      return 'Lots are free, but too far from any storehouse for the porters. Zone nearer, or build a storehouse by them.';
    case 'unsuitable':
      return unsuitableWords(r);
    case 'materials':
      return `A lot is free, but the stores are too short of ${lower(goodName(r.good))} to start on it.`;
    case 'sitesBusy':
      return (r.value ?? 0) === 1
        ? 'One is going up already. The next starts when it is done.'
        : `${r.value ?? 'Several'} sites are going up already. The next lot starts when one is done.`;
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
