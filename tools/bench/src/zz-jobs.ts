import { content } from '@qoti/content';
import { townStock } from '@qoti/sim';
import { autoplay } from './autoplay';
const at = Number(process.argv[4] ?? 20);
autoplay(process.argv[2] ?? 'oak', Number(process.argv[3] ?? 21), {
  village: true,
  onDay: (w, l) => {
    if (l.day !== at) return;
    const s = townStock(w);
    console.log(`bars ${w.demand.bars.join(",")} lit ${w.demand.lit.join(",")} reasons ${JSON.stringify(w.demand.reasons)} lots ${w.lots.filter((x) => !x.buildingId).map((x) => x.zone).join("")}`);
    console.log(`d${l.day} timber ${s[content.goodIndex.get('timber')!]} stone ${s[content.goodIndex.get('stone')!]} firewood ${s[content.goodIndex.get('firewood')!]} pop ${w.residents.length} working ${w.residents.filter((r) => r.jobId).length}`);
    for (const b of w.buildings) {
      const d = content.buildingById.get(b.def)!;
      if (!d.jobs && b.stage === 'built') continue;
      const c = b.rt?.construction;
      console.log(`  ${b.def}${b.trade ? `:${b.trade}` : ''} #${b.id} ${b.stage} jobs ${d.jobs?.count ?? 0} workers ${b.rt?.workers.length ?? 0} status ${b.rt?.status ?? 0}${c ? ` needs ${c.needs.map((v, i) => (v ? `${content.goods[i]!.id}:${v}` : '')).filter(Boolean).join(',')} work ${c.workDone}` : ''}`);
    }
  },
});
