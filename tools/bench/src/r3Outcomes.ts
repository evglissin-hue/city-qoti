// `npm run outcomes -w @qoti/bench [seeds...] [--strict]` (R2E, R3E): measures what R2 and R3 promise
// (docs/spec/19-evenings.md, Acceptance; docs/build/cycle-r3e-bench.md, tasks 3 and 4) and prints one
// table: outcome, seed, measured, target, PASS or MISS, and which cycle's code the number depends on.
// Every seed is played by both profiles (`profile.ts`; the seed column reads `willow` and
// `willow/newcomer`), each as a child process, so the wall time stays near one run.
//
// The R2 rows are `outcomes.ts`'s. The R3 rows:
//   1. Candles for half (R3A): a scripted scene on the grown town at the end of the run.
//   2. The first master in the first Village year (R3B).
//   3. A master's good reaches a shelf (R3B).
//   4. A departed master's good stops (R3B): a scripted scene.
//   5. Six Town Book pages by the two seats, and one calling (R3C).
//   6. The fourth gap opens, closes and credits (R3A).
//   7. The tavern's Treats: the nothing-to-sell gap opens and closes (R3A).
//   8. The evening goal: the worst fair evening and the mean (the owner's ruling, R3A for the lift).
//
// Nothing here assumes a stand-in: each row reads state and views as the contracts define them, so a
// row whose system is still a stand-in shows its measured number and MISS (or N/A), naming the cycle.
//
// Exits 0, or 1 with --strict (or OUTCOMES_STRICT=1) when any row MISSes. OUTCOMES_DAYS (default 70)
// shortens the autoplay runs; OUTCOMES_JOBS (default 4) is the child processes at a time.
// `--one <seed> <profile> <both|off>` is the child: it plays one run and prints one JSON line.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { content } from '@qoti/content';
import {
  DAYS_PER_SEASON,
  isMaster,
  mastersCount,
  placesView,
  rankAtLeast,
  SEASONS_PER_YEAR,
  START_HOUR,
  suppliesView,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type WorldState,
} from '@qoti/sim';
import { findById } from '../../../packages/sim/src/state/entities';
import { moneyBalance } from '../../../packages/sim/src/systems/economy/money';
import { placesFloor } from '../../../packages/sim/src/systems/carrier/places';
import { balanceStock, familyStock } from '../../../packages/sim/src/systems/market/balances';
import { familyIndex } from '../../../packages/sim/src/state/zones';
import { setOffForGood } from '../../../packages/sim/src/systems/residents/lifecycle';
import { DEFAULT_SEEDS } from './audit';
import { command, runTicks, type Hamlet } from './hamlet';
import {
  cartRows,
  formatRows,
  measureGaps,
  measureOut,
  recordRunWith,
  seedRows,
  type EveningSample,
  type OutcomeRow,
  type R3Record,
  type RunRecord,
  type SeenGap,
} from './outcomes';
import { newcomerNote, profileOptions, PROFILES, seedLabel, type Profile } from './profile';

/** Days in a year: the first Village year ends this long after the claim. */
export const DAYS_IN_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;
/** R2X's floor for the worst fair evening (`19-evenings.md`: R3X keeps the worst from falling). */
export const EVENING_WORST_FLOOR = 0.48;
/** R2X's mean fair evening, reported beside the worst; no ruling holds it as a bar. */
export const EVENING_MEAN_FLOOR = 0.76;
/**
 * Each bench seed's own worst and mean fair evening (whole percent) before R3, as measured at a9a51d3
 * (R2X's numbers, R3.0 merged; `npm run r3report`): R3X keeps each seed's worst from falling. A seed
 * not listed reads the floors above. The newcomer profile has no baseline before P3A.
 */
export const EVENING_BASELINE: ReadonlyMap<string, readonly [worst: number, mean: number]> = new Map([
  ['birch', [58, 78]],
  ['hazel', [48, 76]],
  ['oak', [56, 76]],
  ['willow', [54, 77]],
]);
/** Town Book pages a run should find. */
export const PAGES_WANTED = 6;

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

// --- Scripted scenes -------------------------------------------------------------------------------------

/** What the candles-for-half scene saw. */
export interface CandlesRun {
  /** Why the scene could not be set up (no Village rank, no lanterns, no storehouse), or absent. */
  skipped?: string;
  /** An exception the run threw, or absent. */
  threw?: string;
  lanterns: number;
  /** Candles a night needs for every lantern, and the candles the scene left in town (half, rounded down). */
  need: number;
  candlesSet: number;
  /** Lanterns the stock covers (`candlesSet` times the lanterns one candle lights). */
  covers: number;
  /** Lanterns lit at 18:30, and resting pieces (the supplies view). */
  lit: number;
  resting: number;
  /** The place marked `keep`: its lanterns and how many are lit. */
  keptPlace: string | null;
  keptLanterns: number;
  keptLit: number;
  /** Pennies that appeared (+) or vanished (-) inside the valley during the scene. */
  moneyLeak: number;
}

export const NO_CANDLES: CandlesRun = {
  lanterns: 0,
  need: 0,
  candlesSet: 0,
  covers: 0,
  lit: 0,
  resting: 0,
  keptPlace: null,
  keptLanterns: 0,
  keptLit: 0,
  moneyLeak: 0,
};

const clockTicks = (w: WorldState): number => (w.tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY;

/** Runs until the clock next reads `hour`:`minute` (a full day when it already does). */
function runToClock(h: Hamlet, hour: number, minute = 0): void {
  const target = hour * TICKS_PER_HOUR + Math.round((minute / 60) * TICKS_PER_HOUR);
  let guard = 0;
  do {
    runTicks(h, 1);
    if (++guard > 2 * TICKS_PER_DAY) throw new Error('the clock never reached the hour');
  } while (clockTicks(h.world) !== target);
}

const goodIdx = (id: string): number => content.goods.findIndex((g) => g.id === id);

/**
 * Outcome 1's scene: at 17:00 the town holds candles for half a night's lanterns (every other store
 * emptied of them), one place is marked `keep`, and the settling at 17:30 reads stock and priority.
 * R3X: "for half" is above the places' floor: places draw only on what the town holds over its
 * reserves and winter marks (19-evenings.md, Supplies), so the storehouse is topped up past the Wares
 * floor first. Seeded with half the need in all, hazel's settling lit 0 of 124 lanterns (its Wares
 * stood under their reserve) and the row read the households' first claim as a miss.
 * Run from the grown town at the end of an autoplay; reads `suppliesView` at 18:30.
 */
export function candlesScene(h: Hamlet): CandlesRun {
  const w = h.world;
  if (!rankAtLeast(w, 'village')) return { ...NO_CANDLES, skipped: 'not at Village rank' };
  const lanterns = w.decor.filter((d) => content.decorById.get(d.def)?.supply?.kind === 'nightly');
  if (lanterns.length === 0) return { ...NO_CANDLES, skipped: 'no lanterns stand' };
  const supply = content.decorById.get(lanterns[0]!.def)!.supply!;
  const per = supply.per ?? 1;
  const qty = supply.qty ?? 1;
  const need = Math.ceil((lanterns.length * qty) / per);
  const candlesSet = Math.floor(need / 2);
  const base = { ...NO_CANDLES, lanterns: lanterns.length, need, candlesSet };
  if (candlesSet < 1) return { ...base, skipped: 'a night needs under two candles' };
  const storehouse = w.buildings.find((b) => b.def === 'storehouse' && b.stage === 'built' && b.rt);
  if (!storehouse) return { ...base, skipped: 'no storehouse stands' };
  try {
    runToClock(h, 17);
    const gc = goodIdx(supply.good ?? 'candles');
    for (const b of w.buildings) {
      const rt = b.rt;
      if (!rt) continue;
      if (rt.store[gc] !== undefined) rt.store[gc] = 0;
      if (rt.output[gc] !== undefined) rt.output[gc] = 0;
      if (rt.reservedOut[gc] !== undefined) rt.reservedOut[gc] = 0;
    }
    storehouse.rt!.store[gc] = candlesSet;
    // Past the floor: the family's stock is lifted to its floor and half the need above it.
    const family = familyIndex(content.goods[gc]!.family);
    const have = familyStock(balanceStock(w), family);
    storehouse.rt!.store[gc]! += Math.max(0, placesFloor(w, family) + candlesSet - have);
    const covers = Math.min(lanterns.length, Math.floor((candlesSet * per) / qty));
    // The place with the most lanterns is the one kept first.
    const ids = new Set(lanterns.map((d) => d.id));
    let kept: { id: string; members: number[] } | null = null;
    for (const p of placesView(w).places) {
      const n = p.members.filter((m) => ids.has(m)).length;
      if (n > 0 && (!kept || n > kept.members.filter((m) => ids.has(m)).length)) kept = p;
    }
    if (kept) command(h, [{ t: 'place.setPriority', id: kept.id, priority: 'keep' }], 1);
    const before = moneyBalance(w);
    runToClock(h, 18, 30);
    const view = suppliesView(w);
    const litIds = new Set(view.lamps.map((l) => l.id));
    const keptIds = kept ? kept.members.filter((m) => ids.has(m)) : [];
    return {
      ...base,
      covers,
      lit: view.lamps.length,
      resting: view.resting.length,
      keptPlace: kept?.id ?? null,
      keptLanterns: keptIds.length,
      keptLit: keptIds.filter((m) => litIds.has(m)).length,
      moneyLeak: moneyBalance(w) - before,
    };
  } catch (e) {
    return { ...base, threw: e instanceof Error ? e.message : String(e) };
  }
}

/** What the departed-master scene saw. */
export interface DepartRun {
  /** Why there was no scene ("no master made", "no master alone in a trade with a good"). */
  skipped?: string;
  trade: string;
  good: string;
  /** Masters of that trade after the three days (0 once the household has gone). */
  mastersAfter: number;
  /** Units of the master's good made on the third day. */
  madeLastDay: number;
}

/**
 * Outcome 4's scene: a master who is the only one of a trade with a good of their own leaves the valley
 * through the sim's own leaving (`setOffForGood`, as the 09:00 departures do); three days later that
 * trade's master's good is no longer made.
 */
export function departedMasterScene(h: Hamlet): DepartRun {
  const w = h.world;
  const none = { trade: '', good: '', mastersAfter: 0, madeLastDay: 0 };
  if (mastersCount(w) === 0) return { ...none, skipped: 'no master made' };
  for (const r of w.residents) {
    if (!isMaster(r) || r.mastery === undefined || mastersCount(w, r.mastery) !== 1) continue;
    const def = content.masters.find((m) => m.of === r.mastery);
    if (!def?.good) continue;
    const hh = findById(w.households, r.householdId);
    if (!hh) continue;
    const g = goodIdx(def.good);
    setOffForGood(w, h.ctx, hh, 'The valley was lovely. The commute was not.');
    runTicks(h, 2 * TICKS_PER_DAY);
    const mid = w.economy.everProduced[g] ?? 0;
    runTicks(h, TICKS_PER_DAY);
    return {
      trade: r.mastery,
      good: def.good,
      mastersAfter: mastersCount(w, r.mastery),
      madeLastDay: (w.economy.everProduced[g] ?? 0) - mid,
    };
  }
  return { ...none, skipped: 'no master is alone in a trade that has a good of its own' };
}

// --- Rows (pure over recorded data) ---------------------------------------------------------------------

export function rowCandles(seed: string, c: CandlesRun): OutcomeRow {
  const base = {
    outcome: 'Candles for half: kept places lit, the rest rest',
    seed,
    target: 'kept place lit, lit = what stock covers, rest the others, money holds',
    needs: 'R3A (supplies)',
  };
  if (c.skipped) return { ...base, measured: `scene not set: ${c.skipped}`, verdict: 'MISS' };
  if (c.threw) return { ...base, measured: `threw: ${c.threw}`, verdict: 'MISS' };
  const keptOk = c.keptPlace === null || c.keptLit === Math.min(c.keptLanterns, c.covers);
  const ok = c.lit === c.covers && keptOk && c.lit < c.lanterns && c.moneyLeak === 0;
  return {
    ...base,
    measured: `${c.candlesSet} of ${c.need} candles, ${c.lit} of ${c.lanterns} lanterns lit (stock covers ${c.covers}), ${c.resting} resting, kept ${c.keptPlace === null ? 'none' : `${c.keptLit} of ${c.keptLanterns} lit`}${c.moneyLeak ? `, money off by ${c.moneyLeak}` : ''}`,
    verdict: ok ? 'PASS' : 'MISS',
  };
}

export function rowFirstMaster(seed: string, r3: R3Record, days: number): OutcomeRow {
  const base = {
    outcome: 'First master in the first Village year',
    seed,
    target: `within ${DAYS_IN_YEAR} days of the Village claim`,
    needs: 'R3B (masters)',
  };
  if (r3.villageDay === 0) return { ...base, measured: `no Village claim in ${days} days`, verdict: 'N/A' };
  if (r3.firstMasterDay === 0) {
    const seen = days - r3.villageDay;
    return {
      ...base,
      measured: `no master in ${seen} days since the claim on day ${r3.villageDay}`,
      verdict: seen >= DAYS_IN_YEAR ? 'MISS' : 'N/A',
    };
  }
  const took = r3.firstMasterDay - r3.villageDay;
  return {
    ...base,
    measured: `day ${r3.firstMasterDay}, ${took} days after the claim on day ${r3.villageDay}`,
    verdict: took <= DAYS_IN_YEAR ? 'PASS' : 'MISS',
  };
}

export function rowMasterShelf(seed: string, r3: R3Record): OutcomeRow {
  const last = r3.days[r3.days.length - 1];
  const made = r3.days.reduce((n, d) => n + d.masterMade, 0);
  return {
    outcome: "A master's good reaches a shelf",
    seed,
    measured:
      r3.firstShelfDay > 0
        ? `on a shelf from day ${r3.firstShelfDay}; ${made} made, ${last?.masterShelf ?? 0} on shelves at the end`
        : `none on any shelf (${r3.firstMasterDay > 0 ? `${made} made` : 'no master made'})`,
    target: 'on an outlet shelf',
    verdict: r3.firstShelfDay > 0 ? 'PASS' : 'MISS',
    needs: 'R3B (masters)',
  };
}

export function rowDeparted(seed: string, d: DepartRun): OutcomeRow {
  const base = {
    outcome: "A departed master's good stops",
    seed,
    target: 'none made on day 3 once the trade has no master',
    needs: 'R3B (masters)',
  };
  if (d.skipped) return { ...base, measured: d.skipped, verdict: 'N/A' };
  const gone = d.mastersAfter === 0;
  return {
    ...base,
    measured: `${d.trade}: ${d.mastersAfter} masters left after 3 days, ${d.madeLastDay} ${d.good} made on day 3`,
    verdict: !gone ? 'N/A' : d.madeLastDay === 0 ? 'PASS' : 'MISS',
  };
}

export function rowTownBook(seed: string, r3: R3Record): OutcomeRow {
  const last = r3.days[r3.days.length - 1];
  const pages = last?.pages ?? 0;
  const s0 = last?.seat0 ?? 0;
  const s1 = last?.seat1 ?? 0;
  const callings = last?.callings ?? 0;
  const ok = pages >= PAGES_WANTED && s0 >= 1 && s1 >= 1 && callings >= 1;
  return {
    outcome: 'Town Book: six pages, both seats, a calling',
    seed,
    measured: `${pages} pages (${last?.specialties ?? 0} specialties, ${last?.customs ?? 0} customs), seat 0 on ${s0}, seat 1 on ${s1}, ${last?.together ?? 0} together, ${callings} callings`,
    target: `>= ${PAGES_WANTED} pages, each seat on one, >= 1 calling`,
    verdict: ok ? 'PASS' : 'MISS',
    needs: 'R3A (supply customs), R3X (no Treat reaches ten customers at a place; R3C landed)',
  };
}

/** The R3 gap kinds, in content order. */
export function r3GapKinds(): string[] {
  return content.gaps.filter((g) => g.from === 'R3').map((g) => g.kind);
}

/** Outcome 6: the fourth gap (a place short of supplies) opens, closes and credits a seat. */
export function rowsFourthGap(seed: string, gaps: readonly SeenGap[]): OutcomeRow[] {
  return measureGaps(r3GapKinds(), gaps).map((m) => {
    const ok = m.opened > 0 && m.closed > 0 && m.uncredited === 0 && m.badSeats === 0;
    return {
      outcome: `The fourth gap (${m.kind}): opens, closes, credits`,
      seed,
      measured: `opened ${m.opened}, closed ${m.closed}, seats credited ${m.credited}${m.uncredited ? `, ${m.uncredited} closed with no closers` : ''}`,
      target: 'opened > 0, closed > 0, every first closing credits a seat',
      verdict: ok ? 'PASS' : 'MISS',
      needs: 'R3A (supplies)',
    };
  });
}

/** Outcome 7: the tavern's Treats, so the nothing-to-sell gap opens and closes in a run with a tavern. */
export function rowTavernTreats(seed: string, r3: R3Record, gaps: readonly SeenGap[]): OutcomeRow {
  const m = measureGaps(['nothingToSell'], gaps)[0]!;
  const base = {
    outcome: "The tavern's Treats: nothing-to-sell opens and closes",
    seed,
    // R3X: with `PlaceState.served` written (it never was), a town whose tavern and stalls serve its
    // busy places never opens the gap at all (willow); none left open is the player's goal.
    target: 'every nothing-to-sell gap that opens closes, with a tavern standing (none opened counts)',
    needs: 'R3A (the tavern pours Treats)',
  };
  if (r3.tavernDay === 0)
    return {
      ...base,
      measured: `no tavern stood (gap opened ${m.opened}, closed ${m.closed})`,
      verdict: 'N/A',
    };
  return {
    ...base,
    measured: `tavern from day ${r3.tavernDay}: opened ${m.opened}, closed ${m.closed}`,
    verdict: m.closed >= m.opened ? 'PASS' : 'MISS',
  };
}

/** Outcome 8: the evening goal, the worst fair evening's share and the mean. */
export function rowEveningGoal(seed: string, evenings: readonly EveningSample[]): OutcomeRow {
  const m = measureOut(evenings);
  const [name, profile] = seed.split('/');
  const [worstBar, meanBar] = EVENING_BASELINE.get(name ?? '') ?? [
    Math.round(EVENING_WORST_FLOOR * 100),
    Math.round(EVENING_MEAN_FLOOR * 100),
  ];
  const base = {
    outcome: 'Evening goal: worst and mean fair evening',
    seed,
    target: profile
      ? 'reported (no baseline for this profile)'
      : `worst >= ${worstBar}% (before R3); mean reported beside its ${meanBar}%`,
    needs: 'R3A (supplies lift the draw)',
  };
  if (m.evenings === 0)
    return { ...base, measured: 'no fair evening with a place in reach', verdict: 'MISS' };
  // The worst is the bar (the spec keeps it from falling); the mean is reported. Whole percent, as read.
  const ok = Math.round(m.worst * 100) >= worstBar;
  const drift = Math.round(m.mean * 100) - meanBar;
  return {
    ...base,
    measured: `worst ${pct(m.worst)} (day ${m.worstDay}), mean ${pct(m.mean)} (${drift >= 0 ? '+' : ''}${drift} on before R3), ${m.evenings} evenings`,
    verdict: profile ? 'N/A' : ok ? 'PASS' : 'MISS',
  };
}

/** The R3 rows for one seed and profile. */
export function r3SeedRows(
  seed: string,
  rec: RunRecord,
  candles: CandlesRun,
  depart: DepartRun,
): OutcomeRow[] {
  return [
    rowCandles(seed, candles),
    rowFirstMaster(seed, rec.r3, rec.days),
    rowMasterShelf(seed, rec.r3),
    rowDeparted(seed, depart),
    rowTownBook(seed, rec.r3),
    ...rowsFourthGap(seed, rec.gaps),
    rowTavernTreats(seed, rec.r3, rec.gaps),
    rowEveningGoal(seed, rec.evenings),
  ];
}

// --- Child processes ---------------------------------------------------------------------------------------

/** What a `both` child returns: the run's record and the two scenes. */
export interface BothResult {
  rec: RunRecord;
  candles: CandlesRun;
  depart: DepartRun;
}

export type ChildMode = 'both' | 'off';

/** Plays one seed and profile in this process. */
export function playOne(seed: string, profile: Profile, mode: ChildMode, days: number): BothResult {
  const opts = { village: true, ...profileOptions(profile), ...(mode === 'off' ? { hearthOffFrom: 1 } : {}) };
  const { rec, run } = recordRunWith(seed, days, opts);
  if (mode === 'off')
    return { rec, candles: NO_CANDLES, depart: { trade: '', good: '', mastersAfter: 0, madeLastDay: 0 } };
  // The departed master first (three days on), then the candles from the town as it stands.
  const depart = departedMasterScene(run.hamlet);
  const candles = candlesScene(run.hamlet);
  return { rec, candles, depart };
}

/** Runs `script --one ...args` in a child process (tsx's flags are passed on); resolves its JSON line. */
export function childJson<T>(script: string, args: string[], env: NodeJS.ProcessEnv): Promise<T> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [...process.execArgv, script, '--one', ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('{'));
      if (code === 0 && line) resolve(JSON.parse(line) as T);
      else reject(new Error(`child ${args.join(' ')} exited ${code}`));
    });
  });
}

/** Runs thunks `jobs` at a time and returns their results in order. */
export async function runPool<T>(todo: readonly (() => Promise<T>)[], jobs: number): Promise<T[]> {
  const results = new Array<T>(todo.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < todo.length; i = next++) results[i] = await todo[i]!();
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, jobs), todo.length) }, worker));
  return results;
}

// --- The report -----------------------------------------------------------------------------------------------

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const strict = argv.includes('--strict') || env.OUTCOMES_STRICT === '1';
  const seeds = argv.filter((a) => !a.startsWith('--'));
  const list = seeds.length ? seeds : DEFAULT_SEEDS.slice(0, 2);
  const days = Number(env.OUTCOMES_DAYS ?? 70) || 70;
  const jobs = Math.max(1, Number(env.OUTCOMES_JOBS ?? 4));
  const script = fileURLToPath(import.meta.url);
  const todo = list.flatMap((seed) =>
    PROFILES.flatMap((profile) =>
      (['both', 'off'] as const).map((mode) => ({
        seed,
        profile,
        mode,
        run: () =>
          childJson<BothResult>(script, [seed, profile, mode], { OUTCOMES_DAYS: String(days) }).then((r) => {
            console.error(`done ${seed}/${profile}/${mode}`);
            return r;
          }),
      })),
    ),
  );
  const done = await runPool(
    todo.map((t) => t.run),
    jobs,
  );
  const get = (seed: string, profile: Profile, mode: ChildMode): BothResult =>
    done[todo.findIndex((t) => t.seed === seed && t.profile === profile && t.mode === mode)]!;
  const rows: OutcomeRow[] = [];
  for (const profile of PROFILES) {
    for (const seed of list) {
      const both = get(seed, profile, 'both');
      const off = get(seed, profile, 'off');
      const label = seedLabel(seed, profile);
      rows.push(
        ...seedRows(label, both.rec, off.rec),
        ...r3SeedRows(label, both.rec, both.candles, both.depart),
      );
    }
  }
  rows.push(...cartRows());
  console.log(`R3 outcomes, ${days} days, seeds ${list.join(', ')}; ${newcomerNote()}`);
  console.log(formatRows(rows));
  const miss = rows.filter((r) => r.verdict === 'MISS').length;
  console.log(
    `\n${rows.length} rows: ${rows.filter((r) => r.verdict === 'PASS').length} PASS, ${miss} MISS, ${rows.filter((r) => r.verdict === 'N/A').length} N/A`,
  );
  return strict && miss > 0 ? 1 : 0;
}

const entry = process.argv[1] ?? '';
if (/r3Outcomes\.(ts|js)$/.test(entry)) {
  if (process.argv[2] === '--one') {
    const result = playOne(
      process.argv[3]!,
      process.argv[4] as Profile,
      process.argv[5] as ChildMode,
      Number(process.env.OUTCOMES_DAYS ?? 70) || 70,
    );
    console.log(JSON.stringify(result));
  } else {
    void main(process.argv.slice(2)).then((code) => process.exit(code));
  }
}
