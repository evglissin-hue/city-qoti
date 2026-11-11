import { autoplay } from './autoplay';
import { townStock } from '@qoti/sim';
import { content } from '@qoti/content';
const r = autoplay(process.argv[2] ?? 'hazel', Number(process.argv[3] ?? 10), { village: true, threat: 'standard' });
const w = r.hamlet.world;
for (const b of w.buildings) {
  const c = b.rt?.construction;
  console.log(b.id, b.def, b.trade ?? '', b.stage, 'workers', b.rt?.workers.length, 'status', b.rt?.status, c ? 'needs ' + c.needs.map((n, g) => n ? content.goods[g]!.id + n : '').filter(Boolean).join(',') + ' done ' + c.workDone : '');
}
const s = townStock(w);
console.log(content.goods.map((g, i) => s[i] ? `${g.id}:${s[i]}` : '').filter(Boolean).join(' '));
console.log('lots', w.lots.length, 'free', w.lots.filter(l => !l.buildingId).length, 'demand', JSON.stringify(w.demand));
console.log(r.actions.filter(a => !a.includes('decor') && !a.includes('flower') && !a.includes('lantern')).slice(-30).join('\n'));
