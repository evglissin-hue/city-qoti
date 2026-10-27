import { content } from '@qoti/content';
import { BuildingStatus } from '@qoti/sim';
import { autoplay } from './autoplay';
const run = autoplay('hazel', 64, { village: true });
const w = run.hamlet.world;
const names = Object.entries(BuildingStatus);
for (const b of w.buildings.filter((b) => b.stage === 'construction')) {
  const c = b.rt!.construction!;
  const need = c.needs.map((n, g) => (n ? `${content.goods[g]!.id}:${c.delivered[g]}/${n}` : '')).filter(Boolean).join(' ');
  const st = names.filter(([, v]) => (b.rt!.status & (v as number)) !== 0).map(([k]) => k).join(',');
  console.log(b.def, `at ${b.x},${b.z}`, need, 'work', c.workDone, '/', c.work, 'status', st, 'lot', b.lot ?? 0);
}
const stock = (g: string) => w.buildings.reduce((n, b) => n + (b.rt?.store[content.goodIndex.get(g)!] ?? 0), 0);
console.log('stored bricks', stock('bricks'), 'planks', stock('planks'), 'stone', stock('stone'));
console.log('builders', w.buildings.filter((b) => b.def === 'builders-yard').map((b) => `${b.x},${b.z} w${b.rt?.workers.length}`).join(' '));
