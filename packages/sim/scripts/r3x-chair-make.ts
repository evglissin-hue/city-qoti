// R3X (player's chair): makes the paused valleys the chair script opens, in Node, from real autoplayed
// valleys: the grown fixture and the version 8 willow (migrated on load). Each runs on to an hour of an
// evening and is saved as a .qoti (the raw serialized state).
//   npx tsx packages/sim/scripts/r3x-chair-make.ts <outDir>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { content } from '@qoti/content';
import {
  advanceTo,
  base64ToBytes,
  calendar,
  createTickCtx,
  deserialize,
  serialize,
  type WorldState,
} from '../src/index';

const out = process.argv[2] ?? '.';
const seat = (s: WorldState) => {
  s.time.connected = [0, 1];
  s.time.desired = [1, 1];
};
const stamp = (s: WorldState) => {
  const c = calendar(s.tick);
  return `year ${c.year} season ${c.season} day ${c.day} ${c.hour}:${String(c.minute).padStart(2, '0')}`;
};

function run(s: WorldState, until: (c: ReturnType<typeof calendar>) => boolean) {
  const ctx = createTickCtx(s);
  let guard = 0;
  while (!until(calendar(s.tick))) {
    advanceTo(s, s.lastTurn + 1, ctx);
    if (++guard > 5_000_000) throw new Error('time does not pass');
  }
}
/** Runs on to hour:minute of a day that satisfies `day` (default: the first one coming). */
function to(
  s: WorldState,
  hour: number,
  minute: number,
  day: (c: ReturnType<typeof calendar>) => boolean = () => true,
) {
  // Out of the current evening first, then on to the target.
  const c0 = calendar(s.tick);
  run(s, (c) => c.day !== c0.day || c.season !== c0.season || c.year !== c0.year);
  run(s, (c) => day(c) && c.hour * 60 + c.minute >= hour * 60 + minute && c.hour < 23);
}

const grown = deserialize(
  readFileSync(fileURLToPath(new URL('../../../apps/client/src/app/fixtures/grown.qoti', import.meta.url))),
);
const v8json = JSON.parse(
  readFileSync(fileURLToPath(new URL('../test/golden/v8-willow-day70.json', import.meta.url)), 'utf8'),
) as { save: string };

const which = process.argv[3] ?? 'all';

if (which === 'all' || which === 'grown') {
  seat(grown);
  console.log('grown starts', stamp(grown), 'v', grown.saveVersion);
  to(grown, 17, 20);
  console.log('grown-1720', stamp(grown));
  writeFileSync(`${out}/grown-1720.qoti`, serialize(grown));
}
if (which === 'all' || which === 'willow') {
  // (the willow comes after the grown: `npx tsx ... <out> willow` makes only these)
  const w = deserialize(base64ToBytes(v8json.save));
  seat(w);
  console.log('willow starts', stamp(w), 'v', w.saveVersion, 'masters made', w.masters?.made);
  to(w, 17, 20);
  console.log('willow-1720', stamp(w));
  writeFileSync(`${out}/willow-1720.qoti`, serialize(w));
  // Variants of this winter evening, made before the 17:30 settling. The autoplayed town keeps no
  // candles or firewood in store, so each variant puts a stock in the first storehouse: candles
  // short (forty candles, plenty of wood), and no firewood (plenty of candles, no wood).
  const stockOf = (id: string) => content.goods.findIndex((g) => g.id === id);
  const setStock = (st: WorldState, id: string, n: number) => {
    const g = stockOf(id);
    let put = false;
    for (const b of st.buildings) {
      if (!b.rt) continue;
      for (const buf of [b.rt.store, b.rt.output]) buf[g] = 0;
      if (!put && content.buildingById.get(b.def)?.tags?.includes('storehouse') && b.stage === 'built') {
        b.rt.store[g] = n;
        put = true;
      }
    }
    if (!put) throw new Error('no storehouse');
  };
  // The dairy (a level 3 business with a master) paused: its crew, the master with it, goes off to
  // other work. Three days on, at 17:20: the master's grace has begun.
  const gone = deserialize(serialize(w));
  seat(gone);
  const weaver = gone.buildings.find((b) => b.trade === 'dairy')!;
  weaver.rt!.paused = true;
  console.log('paused', weaver.id, weaver.def, weaver.trade);
  for (let i = 0; i < 3; i++) to(gone, 17, 20);
  console.log('willow-gone-1720', stamp(gone));
  writeFileSync(`${out}/willow-gone-1720.qoti`, serialize(gone));
  // Past an evening's close (the Town Book's hints and pages are set there): the next morning, 06:05.
  const book = deserialize(serialize(w));
  seat(book);
  to(book, 6, 5);
  console.log(
    'willow-book-0605',
    stamp(book),
    'pages',
    book.townBook.pages.length,
    'hints',
    book.townBook.hints.length,
  );
  writeFileSync(`${out}/willow-book-0605.qoti`, serialize(book));
  // Households take their candles first (24 here), then the places draw what stands above the floor.
  const cold = deserialize(serialize(w));
  seat(cold);
  setStock(cold, 'candles', 60);
  setStock(cold, 'firewood', 0);
  writeFileSync(`${out}/willow-nowood-1720.qoti`, serialize(cold));
  const warm = deserialize(serialize(w));
  seat(warm);
  setStock(warm, 'candles', 60);
  setStock(warm, 'firewood', 400);
  writeFileSync(`${out}/willow-warm-1720.qoti`, serialize(warm));
  // The same two evenings at 21:45, after the 21:30 draw of the firewood.
  for (const [name, st] of [
    ['warm', warm],
    ['nowood', cold],
  ] as const) {
    run(st, (c) => c.hour * 60 + c.minute >= 21 * 60 + 45);
    console.log(`willow-${name}-2145`, stamp(st));
    writeFileSync(`${out}/willow-${name}-2145.qoti`, serialize(st));
  }
}
