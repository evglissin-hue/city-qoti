import { rankAtLeast } from '@qoti/sim';
import { autoplay } from './autoplay';
import { nextTierSummary, businessesSummary } from './ledgerRow';
const seed = process.argv[2] ?? 'willow';
const days = Number(process.argv[3] ?? 50);
autoplay(seed, days, {
  village: true,
  onDay: (w, line) => {
    if (!rankAtLeast(w, 'village') || line.day % 4 !== 0) return;
    console.log(`d${line.day} ${nextTierSummary(w)}`);
    console.log(`   biz: ${businessesSummary(w)}`);
    const svc = w.buildings.filter((b) => ['tavern', 'herbalist', 'trading-post', 'school', 'bath-house', 'chapel'].includes(b.def)).map((b) => b.def);
    console.log(`   services: ${svc.join(' ')}`);
  },
});
