// `npx tsx tools/bench/src/r3xTreats.ts <seed> [days]` (R3X): why Treats are scarce on the round. Plays one
// seed with the tuned autoplayer (village: true) and reads the outlets at 16:00, 18:00 and 19:00 from
// day 30: per outlet def, how many stand, their storage, the food and each Treat on their shelves, the
// storage space left, and the Treats in storehouses. The evening's Treats sold (stops and passing) are
// read at 23:00. Prints one compact table per seed and a ROW json line with the cycle's measures:
// outlets with a Treat on the shelf at 18:00 (mean), Treats sold per evening (mean and max, days 41+).
import { content } from '@qoti/content';
import { sellsTreats, storageOf, treatsOnShelf, type WorldState } from '@qoti/sim';
import { autoplay, type DayLine } from './autoplay';
import { isFood } from '../../../packages/sim/src/state/zones';
import { isStorehouse, storageSpace } from '../../../packages/sim/src/systems/logistics/stores';
import { dayIndex, hourOf } from '../../../packages/sim/src/systems/economy/time';
import { basketGroups, ensureBasket } from '../../../packages/sim/src/systems/market/baskets';
import { TREATS, TREATS_GROUP } from '../../../packages/sim/src/systems/market/round';

const seed = process.argv[2] ?? 'willow';
const days = Number(process.argv[3] ?? 70);
const FROM = 30;
const HOURS = [16, 18, 19, 22];

interface Acc {
  n: number;
  storage: number;
  food: number;
  treats: number;
  space: number;
  withTreat: number;
  stored: number;
}
const acc = new Map<string, Acc>();
const seen = new Set<string>();
const shelf18: number[] = [];
const sold: number[] = [];
const stops: number[] = [];
const passing: number[] = [];
const storeTreats: number[] = [];
const door: number[] = [];
const owedUnits: number[] = [];

const onHour = (w: WorldState): void => {
  const h = hourOf(w.tick);
  if (!HOURS.includes(h)) return;
  const d = dayIndex(w.tick);
  if (d < FROM || seen.has(`${d}|${h}`)) return;
  seen.add(`${d}|${h}`);
  let onShelf = 0;
  let st = 0;
  for (const b of w.buildings) {
    if (b.stage === 'built' && isStorehouse(content.buildingById.get(b.def))) {
      for (const g of TREATS) st += b.rt?.store[g] ?? 0;
    }
  }
  for (const b of w.buildings) {
    if (!sellsTreats(w, b) || !b.rt) continue;
    const key = `${b.def}@${h}`;
    const a = acc.get(key) ?? { n: 0, storage: 0, food: 0, treats: 0, space: 0, withTreat: 0, stored: 0 };
    a.n++;
    a.storage += storageOf(b);
    let food = 0;
    for (let g = 0; g < content.goods.length; g++) if (isFood(g)) food += b.rt.store[g] ?? 0;
    a.food += food;
    let t = 0;
    for (const g of TREATS) t += (b.rt.store[g] ?? 0) + (b.def === 'tavern' ? (b.rt.input[g] ?? 0) : 0);
    a.treats += t;
    a.space += storageOf(b) === 0 ? 0 : storageSpace(b, b.rt);
    const ok = treatsOnShelf(w, b);
    if (ok) a.withTreat++;
    if (h === 18 && ok) onShelf++;
    a.stored += st;
    acc.set(key, a);
  }
  if (h === 18) {
    let owed = 0;
    for (const hh of w.households) {
      const basket = ensureBasket(hh);
      if (!basket || !hh.homeId) continue;
      const i = basketGroups(basket).findIndex((g) => g.id === TREATS_GROUP);
      if (i >= 0) owed += Math.floor((hh.owed![i] ?? 0) / 100);
    }
    owedUnits.push(owed);
    shelf18.push(onShelf);
    storeTreats.push(st);
  }
};

const onDay = (w: WorldState, line: DayLine): void => {
  const t = w.evenings.tonight;
  stops.push(t.treatsAtStops);
  passing.push(t.treatsPassing);
  door.push(t.treatsDoorstep);
  sold.push(t.treatsAtStops + t.treatsPassing);
  void line;
};

autoplay(seed, days, { village: true, onDay, onHour });
const f = (x: number, n: number) => (x / Math.max(1, n)).toFixed(1);
console.log(`${seed}: outlets that sell Treats, mean per read, days ${FROM}+ (units on the shelf)`);
console.log('def@hour           reads  storage  food  treats  space  withTreat%  storehouseTreats');
for (const [k, a] of [...acc].sort()) {
  console.log(
    `${k.padEnd(18)} ${String(a.n).padStart(5)} ${f(a.storage, a.n).padStart(8)} ${f(a.food, a.n).padStart(5)} ${f(a.treats, a.n).padStart(7)} ${f(a.space, a.n).padStart(6)} ${String(Math.round((100 * a.withTreat) / a.n)).padStart(10)} ${f(a.stored, a.n).padStart(17)}`,
  );
}
const tail = sold.slice(40);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
console.log(
  `sold/evening d41+: mean ${mean(tail).toFixed(1)} max ${Math.max(0, ...tail)} (stops ${mean(stops.slice(40)).toFixed(1)}, passing ${mean(passing.slice(40)).toFixed(1)}), doorstep ${mean(door.slice(40)).toFixed(1)}, owed units at 18:00 ${mean(owedUnits).toFixed(1)}`,
);
console.log(
  `ROW ${JSON.stringify({ seed, shelf18: Math.round(mean(shelf18) * 10) / 10, soldMean: Math.round(mean(tail) * 10) / 10, soldMax: Math.max(0, ...tail), doorstep: Math.round(mean(door.slice(40)) * 10) / 10, owed: Math.round(mean(owedUnits) * 10) / 10, storehouseTreats: Math.round(mean(storeTreats)) })}`,
);
