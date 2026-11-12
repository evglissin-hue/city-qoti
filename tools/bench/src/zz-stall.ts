import { content } from '@qoti/content';
import { methodOf } from '@qoti/sim';
import { autoplay } from './autoplay';
const wool = content.goodIndex.get('wool')!;
autoplay(process.argv[2] ?? 'oak', Number(process.argv[3] ?? 70), {
  village: true,
  onDay: (w, l) => {
    const weavers = w.buildings.filter((b) => b.trade === 'weaver' && b.stage === 'built');
    if (weavers.length === 0) return;
    const b = w.carrier.bought.at(-1) ?? [];
    const tot = b.reduce((a, v) => a + v, 0);
    const f = (a: number[]) => a.map((v, i) => (v ? `${content.goods[i]!.id}:${v}` : '')).filter(Boolean).join(' ');
    console.log(`d${l.day} coins ${l.coins} tab ${w.carrier.tab / 100} wares ${w.carrier.families[3]!.rule} weavers ${weavers.map((x) => `#${x.id} w${x.rt!.workers.length} in${x.rt!.input[wool]} st${x.rt!.status}`).join(' ')} | bought(${tot}) ${f(b)} | woolStock ${w.buildings.reduce((a, x) => a + (x.rt?.store[wool] ?? 0) + (x.rt?.output[wool] ?? 0), 0)} sheep ${w.buildings.filter((x) => x.trade === 'sheep-run').length}`);
  },
});
