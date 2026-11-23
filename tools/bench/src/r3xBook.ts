// `npx tsx tools/bench/src/r3xBook.ts <seed> [days]` (R3X): how far the autoplayer's two seats get
// toward each Town Book mark. One process per seed (the machine is shared). Plays the tuned
// autoplayer as a Village and, each evening, reads saved state:
//   - specialty: the best customers of its good in one evening at a site of its pattern, and the most
//     evenings in one season at 4, 6, 8 and 10 customers (the mark is TOWN_BOOK.specialtyCustomers);
//   - day custom: the best visitors on one day at a fitting place, and the longest run of seasons at
//     10, 15 and 20 visitors on the same day of the season (the mark is TOWN_BOOK.customVisitors);
//   - supply custom: the longest run of nights kept without a rest in one season;
//   - hints ever shown, pages found, callings, and Treats sold on the round per evening.
// Prints one table per seed and a `ROW` json line.
import { content, TOWN_BOOK } from '@qoti/content';
import {
  DAYS_PER_SEASON,
  START_HOUR,
  SUPPLY_KINDS,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  seasonAt,
  type PlaceState,
  type WorldState,
} from '@qoti/sim';
import { autoplay, type DayLine } from './autoplay';

const seed = process.argv[2] ?? 'hazel';
const days = Number(process.argv[3] ?? 100);
const SPEC_T = [4, 6, 8, 10];
const DAY_T = [10, 15, 20];

const dayIndex = (tick: number): number => Math.floor((tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);

const fits = (row: PlaceState, w: WorldState, def: { pattern?: string; host?: string }): boolean => {
  if (def.pattern !== undefined) return row.id.startsWith(`site:${def.pattern}:`);
  if (def.host !== undefined) {
    if (!row.id.startsWith('host:')) return false;
    const id = Number(row.id.slice('host:'.length));
    return w.buildings.find((b) => b.id === id)?.def === def.host;
  }
  return true;
};

/** Customers seen at each place by good, the most through the evening (they clear at 21:20). */
const evening = new Map<string, number[]>();
const hints = new Set<string>();

const specBest = new Map<string, number>();
const specEv = new Map<string, number[]>(); // id -> best evenings in a season, per SPEC_T
const specCount = new Map<string, number[]>(); // `${id}|${row}|${season}` -> evenings per SPEC_T
const dayBest = new Map<string, number>();
const dayRun = new Map<string, number[]>(); // `${id}|${row}|${d}` -> current run per DAY_T
const dayRunBest = new Map<string, number[]>();
const supplyBest = new Map<string, number>();
const treats: number[] = [];

const onHour = (w: WorldState): void => {
  for (const row of w.places) {
    if (!row.customers) continue;
    const cur = evening.get(row.id) ?? new Array<number>(content.goods.length).fill(0);
    for (let g = 0; g < row.customers.length; g++) cur[g] = Math.max(cur[g]!, row.customers[g]!);
    evening.set(row.id, cur);
  }
};

const onDay = (w: WorldState, line: DayLine): void => {
  for (const id of w.townBook.hints) hints.add(id);
  const today = dayIndex(w.tick);
  const season = Math.floor(today / DAYS_PER_SEASON);
  const d = seasonAt(w.tick).day - 1;
  const weather = w.evenings.tonight.day === today ? w.evenings.tonight.weather : 'fair';
  let sold = 0;
  for (const row of w.places) {
    sold += row.sold[row.sold.length - 1] ?? 0;
    const cur = evening.get(row.id);
    for (const def of content.specialties) {
      if (!row.id.startsWith(`site:${def.pattern}:`)) continue;
      const g = content.goodIndex.get(def.good)!;
      const n = cur?.[g] ?? 0;
      specBest.set(def.id, Math.max(specBest.get(def.id) ?? 0, n));
      const key = `${def.id}|${row.id}|${season}`;
      const c = specCount.get(key) ?? SPEC_T.map(() => 0);
      SPEC_T.forEach((t, i) => {
        if (n >= t) c[i]!++;
      });
      specCount.set(key, c);
      const best = specEv.get(def.id) ?? SPEC_T.map(() => 0);
      c.forEach((v, i) => (best[i] = Math.max(best[i]!, v)));
      specEv.set(def.id, best);
    }
    const vis = row.visitors[row.visitors.length - 1] ?? 0;
    for (const def of content.customs) {
      if (def.kind === 'day') {
        if (!fits(row, w, def)) continue;
        dayBest.set(def.id, Math.max(dayBest.get(def.id) ?? 0, vis));
        const key = `${def.id}|${row.id}|${d}`;
        const run = dayRun.get(key) ?? DAY_T.map(() => 0);
        DAY_T.forEach((t, i) => {
          if (vis >= t) run[i]!++;
          else if (weather === 'fair') run[i] = 0;
        });
        dayRun.set(key, run);
        const best = dayRunBest.get(def.id) ?? DAY_T.map(() => 0);
        run.forEach((v, i) => (best[i] = Math.max(best[i]!, v)));
        dayRunBest.set(def.id, best);
      } else {
        const k = SUPPLY_KINDS.indexOf(def.supply!);
        const sup = row.supplied;
        if (!sup || k < 0 || (sup.rested[k] ?? 0) !== 0) continue;
        supplyBest.set(def.id, Math.max(supplyBest.get(def.id) ?? 0, sup.kept[k] ?? 0));
      }
    }
  }
  treats.push(sold);
  evening.clear();
  void line;
};

const res = autoplay(seed, days, { village: true, onDay, onHour });
const w = res.hamlet.world;
const lines: string[] = [];
const mark = TOWN_BOOK.specialtyCustomers;
lines.push(
  `SEED ${seed}: ${days} days, marks: specialty ${mark} customers x ${TOWN_BOOK.specialtyEvenings} evenings; custom ${TOWN_BOOK.customVisitors} visitors x ${TOWN_BOOK.customSeasons} seasons`,
);
lines.push(
  'specialty id | best customers one evening | most evenings in a season at ' +
    SPEC_T.join('/') +
    ' | hint shown',
);
for (const def of content.specialties)
  lines.push(
    `  ${def.id.padEnd(24)} ${String(specBest.get(def.id) ?? 0).padStart(3)}  ${(specEv.get(def.id) ?? []).join('/')}  ${hints.has(def.id) ? 'hint' : ''}`,
  );
lines.push('day custom id | best visitors one day | longest run at ' + DAY_T.join('/') + ' | hint shown');
for (const def of content.customs.filter((c) => c.kind === 'day'))
  lines.push(
    `  ${def.id.padEnd(24)} ${String(dayBest.get(def.id) ?? 0).padStart(3)}  ${(dayRunBest.get(def.id) ?? []).join('/')}  ${hints.has(def.id) ? 'hint' : ''}`,
  );
lines.push(`supply custom id | longest kept without rest (need ${DAYS_PER_SEASON}) | hint shown`);
for (const def of content.customs.filter((c) => c.kind === 'supply'))
  lines.push(
    `  ${def.id.padEnd(24)} ${String(supplyBest.get(def.id) ?? 0).padStart(3)}  ${hints.has(def.id) ? 'hint' : ''}`,
  );
const tail = treats.slice(40);
const mean = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length);
lines.push(
  `pages ${w.townBook.pages.length} [${w.townBook.pages.map((p) => `${p.def}@${p.day}`).join(', ')}] callings [${w.townBook.callings.join(', ')}]`,
);
lines.push(
  `Treats sold on the round per evening, day 41+: mean ${mean.toFixed(1)}, max ${Math.max(0, ...treats)}`,
);
const ledger70 = res.decisions.filter((r) => r.day <= 70 && r.lane === 'ledger' && r.ok).length;
const bookActs = res.decisions.filter((r) => r.advisor === 'townBook');
lines.push(
  `residents ${w.residents.length}, households ${w.households.length}; decisions ${res.decisions.length}; Ledger accepted by day 70: ${ledger70} (limit 150); townBook commands ${bookActs.length} (${bookActs.filter((r) => r.ok).length} ok)`,
);
console.log(lines.join('\n'));
console.log(
  'ROW ' +
    JSON.stringify({
      seed,
      pages: w.townBook.pages.length,
      callings: w.townBook.callings.length,
      treatsMean: Math.round(mean * 10) / 10,
      treatsMax: Math.max(0, ...treats),
    }),
);
