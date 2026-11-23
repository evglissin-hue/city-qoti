// `npm run r3report -w @qoti/bench [seed ...]` (R3E, docs/build/cycle-r3e-bench.md, tasks 4, 7 to 10): the
// cycle's numbers in one table, a row per bench seed and profile (`profile.ts`), each played as a child
// process in parallel. R3X tunes against these.
//
// R3REPORT_DAYS (default 70) shortens the runs; R3REPORT_JOBS (default 4) is the child processes at a
// time; R3REPORT_JSON=<file> also writes the rows as JSON. Every figure reads state and views only; a
// system still on its stand-in shows what it measures (every lantern lit, no master, no page).
// `--one <seed> <profile>` is the child: it plays one run and prints one JSON line.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SEEDS } from './audit';
import { measureOut, recordRun, rankIndex, type RunRecord } from './outcomes';
import { newcomerNote, profileOptions, PROFILES, seedLabel, type Profile } from './profile';
import { childJson, runPool } from './r3Outcomes';

/** The first day Treats in town are read from (a young town has none to measure). */
export const TREATS_FROM_DAY = 30;

/** One seed and profile's row, as plain numbers (JSON-safe). */
export interface ReportRow {
  seed: string;
  profile: Profile;
  days: number;
  /** The worst fair evening's share of grown-ups out (0 to 1), its day, and the mean over fair evenings. */
  worst: number;
  worstDay: number;
  mean: number;
  fairEvenings: number;
  /** Craftsfolk (past Settler) households over all households at the last day (0 to 1). */
  craftsShare: number;
  leanDays: number;
  /** The Ledger's accepted commands and the Hearth's over the first 70 days, and refused ones. */
  ledger: number;
  hearth: number;
  refused: number;
  /** Treats in town from `TREATS_FROM_DAY`: min, mean, max; and at the last day. */
  treatsMin: number;
  treatsMean: number;
  treatsMax: number;
  treatsEnd: number;
  /** Garden lots behind rows at the end. */
  gardens: number;
  /** The first specialized building's climb above level 1, or null. */
  climb: { day: number; def: string; level: number } | null;
  /** First day a master stood (0 never), masters at the end, masters ever made. */
  firstMaster: number;
  masters: number;
  mastersMade: number;
  pages: number;
  callings: number;
  /** Lanterns lit over lanterns standing on every night from Village rank, and on winter nights (null: no such night). */
  litAll: number | null;
  litWinter: number | null;
  nightsAll: number;
  nightsWinter: number;
  /** Village debt: coins owed at the end, per resident, and the credit line (coins). */
  owed: number;
  owedPerResident: number;
  creditLine: number;
  /** Health issues seen, by kind. */
  health: Record<string, number>;
}

/** Lit over standing, summed over nights (null when no lantern stood on any). */
function litShare(nights: readonly { lit: number; standing: number }[]): number | null {
  let lit = 0;
  let standing = 0;
  for (const n of nights) {
    lit += n.lit;
    standing += n.standing;
  }
  return standing > 0 ? lit / standing : null;
}

/** Everything the report reads off one run's record (pure). */
export function summarize(rec: RunRecord, profile: Profile): ReportRow {
  const r3 = rec.r3;
  const out = measureOut(rec.evenings);
  const last = r3.days[r3.days.length - 1];
  const treats = r3.days.filter((d) => d.day >= TREATS_FROM_DAY).map((d) => d.treats);
  const village = rankIndex('village');
  const fromVillage = r3.nights.filter((n) => rankIndex(n.rank) >= village && n.standing > 0);
  const winter = fromVillage.filter((n) => n.season === 3);
  const residents = last?.residents ?? 0;
  return {
    seed: rec.seed,
    profile,
    days: rec.days,
    worst: out.worst,
    worstDay: out.worstDay,
    mean: out.mean,
    fairEvenings: out.evenings,
    craftsShare: last && last.households > 0 ? last.crafts / last.households : 0,
    leanDays: r3.days.filter((d) => d.leanTimes).length,
    ledger: r3.decisions.ledger,
    hearth: r3.decisions.hearth,
    refused: r3.decisions.refused,
    treatsMin: treats.length ? Math.min(...treats) : 0,
    treatsMean: treats.length ? treats.reduce((a, b) => a + b, 0) / treats.length : 0,
    treatsMax: treats.length ? Math.max(...treats) : 0,
    treatsEnd: last?.treats ?? 0,
    gardens: rec.rows.gardens,
    climb: r3.firstClimb,
    firstMaster: r3.firstMasterDay,
    masters: last?.masters ?? 0,
    mastersMade: last?.mastersMade ?? 0,
    pages: last?.pages ?? 0,
    callings: last?.callings ?? 0,
    litAll: litShare(fromVillage),
    litWinter: litShare(winter),
    nightsAll: fromVillage.length,
    nightsWinter: winter.length,
    owed: last?.owed ?? 0,
    owedPerResident: residents > 0 ? (last?.owed ?? 0) / residents : 0,
    creditLine: last?.creditLine ?? 0,
    health: r3.health,
  };
}

const pc = (x: number | null): string => (x === null ? '-' : `${Math.round(x * 100)}%`);

/** "meals-missed:3,hands-spiral:1", or "none". */
export function healthText(h: Readonly<Record<string, number>>): string {
  const parts = Object.keys(h)
    .sort()
    .map((k) => `${k}:${h[k]}`);
  return parts.length ? parts.join(',') : 'none';
}

const LEGEND = [
  'seed      run seed, and /newcomer for the newcomer profile',
  'worst@d   worst fair evening share of grown-ups out, and its day; mean = mean fair evening',
  'crf%      Craftsfolk households over all households on the last day',
  'lean      days in lean times; led/hea/ref = Ledger and Hearth commands accepted, and refused (first 70 days)',
  `treats    Treats in town from day ${TREATS_FROM_DAY}: min/mean/max, and on the last day`,
  'gard      garden lots behind rows; climb = first specialized building above level 1 (day:def:level)',
  'mstr      first master day / masters at the end / made ever; pg = Town Book pages; cl = callings',
  'lit%      lanterns lit over standing from Village rank: all nights / winter nights',
  'debt      coins owed per resident (owed, credit line); health = issues seen by kind',
];

interface Column {
  head: string;
  width: number;
  right?: boolean;
  get: (r: ReportRow) => string;
}

const COLUMNS: readonly Column[] = [
  { head: 'seed', width: 15, get: (r) => seedLabel(r.seed, r.profile) },
  { head: 'worst@d', width: 7, get: (r) => `${pc(r.fairEvenings ? r.worst : null)}@${r.worstDay}` },
  { head: 'mean', width: 4, right: true, get: (r) => pc(r.fairEvenings ? r.mean : null) },
  { head: 'crf%', width: 4, right: true, get: (r) => pc(r.craftsShare) },
  { head: 'lean', width: 4, right: true, get: (r) => String(r.leanDays) },
  { head: 'led/hea/ref', width: 11, get: (r) => `${r.ledger}/${r.hearth}/${r.refused}` },
  {
    head: 'treats mn/avg/mx/end',
    width: 20,
    get: (r) => `${r.treatsMin}/${r.treatsMean.toFixed(1)}/${r.treatsMax}/${r.treatsEnd}`,
  },
  { head: 'gard', width: 4, right: true, get: (r) => String(r.gardens) },
  {
    head: 'climb',
    width: 13,
    get: (r) => (r.climb ? `${r.climb.day}:${r.climb.def}:${r.climb.level}` : 'none').slice(0, 13),
  },
  { head: 'mstr', width: 8, get: (r) => `${r.firstMaster || '-'}/${r.masters}/${r.mastersMade}` },
  { head: 'pg', width: 2, right: true, get: (r) => String(r.pages) },
  { head: 'cl', width: 2, right: true, get: (r) => String(r.callings) },
  { head: 'lit% all/win', width: 12, get: (r) => `${pc(r.litAll)}/${pc(r.litWinter)}` },
  {
    head: 'debt/res owed/line',
    width: 18,
    get: (r) => `${r.owedPerResident.toFixed(1)} ${r.owed}/${r.creditLine}`,
  },
];

/** The table, a legend above it. Headers are abbreviated to keep the rows near 150 columns; health is last. */
export function formatReport(rows: readonly ReportRow[], days: number): string {
  const cell = (c: Column, text: string) => (c.right ? text.padStart(c.width) : text.padEnd(c.width));
  const widths = COLUMNS.map((c) => Math.max(c.width, c.head.length));
  const line = (get: (c: Column) => string, health: string) =>
    `${COLUMNS.map((c, i) => cell({ ...c, width: widths[i]! }, get(c))).join(' ')} ${health}`.trimEnd();
  return [
    `R3 report, ${days} days; ${newcomerNote()}`,
    ...LEGEND,
    '',
    line((c) => c.head, 'health'),
    ...rows.map((r) => line((c) => c.get(r), healthText(r.health))),
  ].join('\n');
}

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const seeds = argv.filter((a) => !a.startsWith('--'));
  const list = seeds.length ? seeds : DEFAULT_SEEDS;
  const days = Number(env.R3REPORT_DAYS ?? 70) || 70;
  const jobs = Math.max(1, Number(env.R3REPORT_JOBS ?? 4));
  const script = fileURLToPath(import.meta.url);
  const todo = list.flatMap((seed) =>
    PROFILES.map(
      (profile) => () =>
        childJson<ReportRow>(script, [seed, profile], { R3REPORT_DAYS: String(days) }).then((r) => {
          console.error(`done ${seed}/${profile}`);
          return r;
        }),
    ),
  );
  const rows = await runPool(todo, jobs);
  console.log(formatReport(rows, days));
  if (env.R3REPORT_JSON) writeFileSync(env.R3REPORT_JSON, `${JSON.stringify(rows, null, 2)}\n`);
  return 0;
}

const entry = process.argv[1] ?? '';
if (/r3Report\.(ts|js)$/.test(entry)) {
  if (process.argv[2] === '--one') {
    const profile = process.argv[4] as Profile;
    const days = Number(process.env.R3REPORT_DAYS ?? 70) || 70;
    const rec = recordRun(process.argv[3]!, days, { village: true, ...profileOptions(profile) });
    console.log(JSON.stringify(summarize(rec, profile)));
  } else {
    void main(process.argv.slice(2)).then((code) => process.exit(code));
  }
}
