import { content } from '@qoti/content';
import { DEMAND_KINDS, rankAtLeast, Zone } from '@qoti/sim';
import { needOf, supplyOf, townNeeds } from '../../../packages/sim/src/systems/growth/trades';
import { shopNeed } from '../../../packages/sim/src/systems/growth/outlets';
import { businessesWaitingHands } from '../../../packages/sim/src/systems/growth';
import { autoplay } from './autoplay';
const from = Number(process.argv[4] ?? 30);
autoplay(process.argv[2] ?? 'oak', Number(process.argv[3] ?? 60), {
  village: true,
  onDay: (w, line) => {
    if (line.day < from || line.day % 3 !== 0) return;
    const crafts = w.lots.filter((l) => l.zone === Zone.crafts);
    const n = townNeeds(w, rankAtLeast(w, 'village') ? shopNeed(w) : 0);
    const terms = content.trades.filter((t) => t.zone === 'crafts').map((t) => `${t.id} ${needOf(w, t, n).need}/${needOf(w, t, n).code} s${supplyOf(w, t, n)}`);
    console.log(`d${line.day} crafts lots ${crafts.length} free ${crafts.filter((l) => !l.buildingId).length} waitingHands ${businessesWaitingHands(w)} bars ${DEMAND_KINDS.map((k, i) => `${k}:${w.demand.bars[i]}${w.demand.lit[i] ? '*' : ''}`).join(' ')} | ${terms.join('; ')}`);
  },
});
