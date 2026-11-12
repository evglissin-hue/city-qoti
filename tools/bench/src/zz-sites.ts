import { content } from '@qoti/content';
import { autoplay } from './autoplay';
import { doorTile, townStock } from '@qoti/sim';
import { porterServed, storehouseReach } from '../../../packages/sim/src/systems/logistics/range';
const from = Number(process.argv[4] ?? 20);
autoplay(process.argv[2] ?? 'willow', Number(process.argv[3] ?? 40), {
  village: true,
  onDay: (w, l) => {
    if (l.day < from) return;
    const sites = w.buildings.filter((b) => b.stage === 'construction');
    const reach = storehouseReach(w); const st = townStock(w);
    console.log(`   stock timber ${st[content.goodIndex.get('timber')!]} stone ${st[content.goodIndex.get('stone')!]} brick ${st[content.goodIndex.get('brick')!]}; served ${sites.map((b) => `${b.def}:${porterServed(reach, doorTile(b))}`).join(' ')}; brickAt ${w.buildings.filter((b) => (b.rt?.store[content.goodIndex.get('brick')!] ?? 0) + (b.rt?.input[content.goodIndex.get('brick')!] ?? 0) + (b.rt?.output[content.goodIndex.get('brick')!] ?? 0) > 0).map((b) => `${b.def}#${b.id}:${b.rt!.store[content.goodIndex.get('brick')!]}/${b.rt!.input[content.goodIndex.get('brick')!]}/${b.rt!.output[content.goodIndex.get('brick')!]}`).join(',')} upg ${w.buildings.filter((b) => b.rt?.upgrade).map((b) => `${b.def}#${b.id}:${b.rt!.upgrade!.map((v, i) => (v ? `${content.goods[i]!.id}:${v}` : '')).filter(Boolean).join('/')}`).join(',')}; bought ${w.carrier.bought.at(-1)?.map((v, i) => (v ? `${content.goods[i]!.id}:${v}` : '')).filter(Boolean).join(',')}`);
    console.log(`d${l.day} coins ${l.coins} owed ${l.owed} sites: ${sites.map((b) => { const c = b.rt!.construction!; return `${b.def}#${b.id} st${b.rt!.status} need[${c.needs.map((v, i) => (v ? `${content.goods[i]!.id}:${v}` : '')).filter(Boolean).join(',')}] del[${c.delivered.map((v, i) => (v ? `${content.goods[i]!.id}:${v}` : '')).filter(Boolean).join(',')}] w${c.workDone}`; }).join(' | ')}`);
  },
});
