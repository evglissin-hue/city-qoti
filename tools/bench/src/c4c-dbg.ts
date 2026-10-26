import { content } from '@qoti/content';
import { autoplay } from './autoplay';
import { tierProgress } from '../../../packages/sim/src/systems/tiers/api';
const days = Number(process.argv[2] ?? 40);
const run = autoplay(process.argv[3] ?? 'hazel', days, { village: true });
const w = run.hamlet.world;
import { runTicks } from './hamlet';
runTicks(run.hamlet, 13 * 200);
for (const b of w.buildings.filter((b) => b.stage === 'construction'))
  console.log(
    'siteX',
    b.id,
    b.def,
    b.x,
    b.z,
    JSON.stringify(b.rt!.reservedIn.map((n, i) => (n ? `${i}:${n}` : '')).filter(Boolean)),
    b.rt!.paused,
  );
import { doorTile } from '@qoti/sim';
for (const b of w.buildings.filter((b) => b.rt && (b.rt.store[1]! > 0 || b.stage === 'construction'))) {
  const d = doorTile(b);
  console.log(
    'P',
    b.id,
    b.def,
    'door',
    d % 192,
    Math.floor(d / 192),
    'planks',
    b.rt!.store[1],
    'resOut',
    b.rt!.reservedOut[1],
    'road',
    w.map.road[d],
  );
}
import { pathBetween } from '../../../packages/sim/src/systems/movement/paths';
import { walkGrid } from '../../../packages/sim/src/systems/movement/grid';
console.log(
  'path 2->363',
  pathBetween(w, 97 * 192 + 76, 96 * 192 + 97)?.length,
  'path ->413',
  pathBetween(w, 97 * 192 + 76, 86 * 192 + 84)?.length,
);
const cost = walkGrid(w).cost;
for (let z = 82; z <= 100; z++) {
  let row = '';
  for (let x = 74; x <= 100; x++) {
    const i = z * 192 + x;
    row += w.map.water[i] ? '~' : w.map.occupant[i] ? '#' : cost[i] === 0 ? 'X' : w.map.road[i] ? '=' : '.';
  }
  console.log(z, row);
}
const count = new Map<string, number>();
for (const b of w.buildings) {
  const k = b.def + (b.stage === 'construction' ? '*' : '');
  count.set(k, (count.get(k) ?? 0) + 1);
}
console.log([...count].map(([k, v]) => `${k}:${v}`).join(' '));
for (const b of w.buildings.filter((b) => b.stage === 'construction'))
  console.log(
    'site',
    b.def,
    JSON.stringify(
      b.rt!.construction!.needs.map((n, i) => (n ? `${content.goods[i]!.id}:${n}` : '')).filter(Boolean),
    ),
    b.rt!.status,
  );
const stock = new Map<string, number>();
for (const b of w.buildings)
  for (let g = 0; g < content.goods.length; g++) {
    const n = (b.rt?.store[g] ?? 0) + (b.rt?.output[g] ?? 0);
    if (n) stock.set(content.goods[g]!.id, (stock.get(content.goods[g]!.id) ?? 0) + n);
  }
console.log('stock', [...stock].map(([k, v]) => `${k}:${v}`).join(' '));
console.log(
  'made yesterday',
  content.goods
    .map((g, i) => (w.economy.yesterday.produced[i] ? `${g.id}:${w.economy.yesterday.produced[i]}` : ''))
    .filter(Boolean)
    .join(' '),
);
for (const h of w.households.slice(0, 6))
  console.log(h.family, h.tier, h.savings, JSON.stringify(tierProgress(w, h)?.missing));
const idle = w.residents.filter((r) => !r.jobId && (r.stage === 'adult' || r.stage === 'young')).length;
console.log('idle adults', idle);
for (const b of w.buildings.filter((b) => b.def === 'storehouse')) {
  console.log('storehouse', b.id, b.rt!.paused, b.rt!.status);
  for (const id of b.rt!.workers) {
    const r = w.residents.find((x) => x.id === id)!;
    console.log(' porter', r.id, JSON.stringify(r.activity), r.inside, r.tile, !!r.move, r.flags, r.jobId);
  }
}
console.log('jobs', JSON.stringify(w.logistics.jobs));
console.log('tick', w.tick % 4800, w.innovations.map((i) => `${i.id}:${i.unlockedTick}`).join(' '));
console.log(run.actions.slice(-12).join('\n'));
