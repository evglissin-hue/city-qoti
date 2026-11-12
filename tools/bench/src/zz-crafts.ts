import { content } from '@qoti/content';
import { DEMAND_KINDS, rankAtLeast, Zone } from '@qoti/sim';
import { needOf, supplyOf, townNeeds } from '../../../packages/sim/src/systems/growth/trades';
import { shopNeed } from '../../../packages/sim/src/systems/growth/outlets';
import { autoplay } from './autoplay';
const seed = process.argv[2] ?? 'hazel';
const days = Number(process.argv[3] ?? 40);
autoplay(seed, days, {
  village: true,
  onDay: (w, line) => {
    if (line.day % 5 !== 0) return;
    const crafts = w.lots.filter((l) => l.zone === Zone.crafts);
    const n = townNeeds(w, rankAtLeast(w, 'village') ? shopNeed(w) : 0);
    const terms = content.trades.filter((t) => t.zone === 'crafts').map((t) => `${t.id} need ${needOf(w, t, n).need}/${needOf(w, t, n).code} sup ${supplyOf(w, t, n)}`);
    console.log(`d${line.day} crafts lots ${crafts.length} built ${crafts.filter((l) => l.buildingId).length} bars ${DEMAND_KINDS.map((k, i) => `${k}:${w.demand.bars[i]}${w.demand.lit[i] ? '*' : ''}`).join(' ')} | ${terms.join('; ')}`);
    console.log(`    windmill ${w.buildings.filter((b) => b.def === 'windmill').length} sawmill ${w.buildings.filter((b) => b.def === 'sawmill').length} reasons ${JSON.stringify(w.demand.reasons[2])}`);
  },
});
