// The lanes test (R1F, docs/spec/22-quality.md, "The lanes test"): each bench seed is played the
// same number of days three ways: both lanes, the Hearth's lane off from the first day, and the
// Ledger's lane off after founding (it still lays and zones the street on day 1). A town that
// needs both players should lose much of its growth with either one gone. R2E enforces it: the run fails
// when a one-lane town keeps more than R2_RESIDENTS of the residents or R2_CRAFTSFOLK of the
// Craftsfolk households, or on the decisions verdict of the both-lanes runs.
//
// `npm run lanes -w @qoti/bench [seed ...]` (default `DEFAULT_SEEDS`). LANES_DAYS (default 70),
// LANES_JOBS (default 4 child processes at a time), LANES_JSON=<file> writes the results.
// `--one <seed> <mode>` is the child: it plays one run and prints one JSON line.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { autoplay } from './autoplay';
import { DEFAULT_SEEDS } from './audit';
import {
  DECISIONS_DAYS,
  DECISIONS_LIMIT,
  decisionVerdict,
  formatDecisions,
  tallyDecisions,
  type DecisionRecord,
} from './decisions';

export type LaneMode = 'both' | 'hearthOff' | 'ledgerOff';
export const LANE_MODES: readonly LaneMode[] = ['both', 'hearthOff', 'ledgerOff'];

export interface LaneRun {
  seed: string;
  mode: LaneMode;
  days: number;
  residents: number;
  households: number;
  /** Households of the Craftsfolk tier. */
  craftsfolk: number;
  /** The commands the run sent (kept for the both-lanes run only). */
  decisions: DecisionRecord[];
}

/** R2 target: a one-lane town keeps at most this share of the residents and of the Craftsfolk. */
export const R2_RESIDENTS = 0.75;
export const R2_CRAFTSFOLK = 0.5;

/** Plays one run of the lanes test. */
export function playLane(seed: string, mode: LaneMode, days: number): LaneRun {
  const run = autoplay(seed, days, {
    village: true,
    threat: 'standard',
    ...(mode === 'hearthOff' ? { hearthOffFrom: 1 } : {}),
    ...(mode === 'ledgerOff' ? { ledgerOffFrom: 2 } : {}),
  });
  const w = run.hamlet.world;
  return {
    seed,
    mode,
    days,
    residents: w.residents.length,
    households: w.households.length,
    craftsfolk: w.households.filter((h) => h.tier === 'craftsfolk').length,
    decisions: mode === 'both' ? run.decisions : [],
  };
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/**
 * Whether a one-lane town stays within the R2 targets against the both-lanes town: at most
 * `R2_RESIDENTS` of its residents and at most `R2_CRAFTSFOLK` of its Craftsfolk households.
 * The edge: a both-lanes town with no Craftsfolk (0 of 0) passes the Craftsfolk half, since
 * 0 <= 0.5 * 0 holds; the residents half still bites, so a stalled both-lanes town cannot hide a leak.
 */
export function laneFailures(one: LaneRun, both: LaneRun): string[] {
  const fails: string[] = [];
  if (one.residents > R2_RESIDENTS * both.residents)
    fails.push(
      `${one.residents} of ${both.residents} residents (${pct(one.residents, both.residents)}%, limit ${R2_RESIDENTS * 100}%)`,
    );
  if (one.craftsfolk > R2_CRAFTSFOLK * both.craftsfolk)
    fails.push(
      `${one.craftsfolk} of ${both.craftsfolk} Craftsfolk households (${pct(one.craftsfolk, both.craftsfolk)}%, limit ${R2_CRAFTSFOLK * 100}%)`,
    );
  return fails;
}

const MODE_NAMES: Record<LaneMode, string> = {
  both: 'both lanes',
  hearthOff: 'Hearth off',
  ledgerOff: 'Ledger off',
};

/** The lanes verdict: one failure line per one-lane town over the R2 limits, then the decisions verdict. */
export function lanesVerdict(runs: readonly LaneRun[], seeds: readonly string[]): string[] {
  const fails: string[] = [];
  for (const seed of seeds) {
    const both = runs.find((r) => r.seed === seed && r.mode === 'both');
    if (!both) continue;
    for (const mode of ['hearthOff', 'ledgerOff'] as const) {
      const one = runs.find((r) => r.seed === seed && r.mode === mode);
      if (!one) continue;
      const f = laneFailures(one, both);
      if (f.length) fails.push(`${seed}: ${MODE_NAMES[mode]} town keeps too much: ${f.join('; ')}`);
    }
    const days = Math.min(both.days, DECISIONS_DAYS);
    for (const v of decisionVerdict(both.decisions, days)) fails.push(`${seed}: decisions: ${v}`);
  }
  return fails;
}

/** The lanes table, then the decisions tables. */
export function formatLanes(runs: readonly LaneRun[], seeds: readonly string[], days: number): string {
  const lines = [
    `Lanes test, ${days} days (residents, Craftsfolk households; percent of the both-lanes town)`,
    'seed     |    both     |        Hearth off          |        Ledger off',
    'seed     | pop crafts  | pop  %  crafts  % R2       | pop  %  crafts  % R2',
  ];
  const find = (seed: string, mode: LaneMode) => runs.find((r) => r.seed === seed && r.mode === mode)!;
  const cell = (one: LaneRun, both: LaneRun) =>
    `${String(one.residents).padStart(3)} ${String(pct(one.residents, both.residents)).padStart(3)}% ${String(one.craftsfolk).padStart(5)} ${String(pct(one.craftsfolk, both.craftsfolk)).padStart(3)}% ${(laneFailures(one, both).length ? 'FAIL' : 'PASS').padEnd(10)}`;
  for (const seed of seeds) {
    const both = find(seed, 'both');
    lines.push(
      `${seed.padEnd(8)} | ${String(both.residents).padStart(3)} ${String(both.craftsfolk).padStart(6)}  | ${cell(find(seed, 'hearthOff'), both)} | ${cell(find(seed, 'ledgerOff'), both)}`,
    );
  }
  lines.push(
    '',
    `Decisions (the both-lanes runs, first ${DECISIONS_DAYS} days, Ledger limit ${DECISIONS_LIMIT}; the Hearth's are reported, not limited)`,
  );
  lines.push('seed     ledger hearth refused verdict');
  for (const seed of seeds) {
    const both = find(seed, 'both');
    const t = tallyDecisions(both.decisions, DECISIONS_DAYS);
    const fails = decisionVerdict(both.decisions, DECISIONS_DAYS);
    lines.push(
      `${seed.padEnd(8)} ${String(t.ledger).padStart(6)} ${String(t.hearth).padStart(6)} ${String(t.refused).padStart(7)} ${fails.length ? 'FAIL' : 'PASS'}`,
    );
  }
  for (const seed of seeds)
    lines.push(
      '',
      `Decisions, ${seed}`,
      formatDecisions(find(seed, 'both').decisions, Math.min(days, DECISIONS_DAYS)),
    );
  return lines.join('\n');
}

/** Plays one run in a child process (tsx's own flags are passed on); resolves its JSON line. */
function child(seed: string, mode: LaneMode, days: number): Promise<LaneRun> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [...process.execArgv, fileURLToPath(import.meta.url), '--one', seed, mode],
      { env: { ...process.env, LANES_DAYS: String(days) }, stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('{'));
      if (code === 0 && line) resolve(JSON.parse(line) as LaneRun);
      else reject(new Error(`lanes child ${seed}/${mode} exited ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const seeds = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SEEDS;
  const days = Number(process.env.LANES_DAYS ?? 70);
  const jobs = Math.max(1, Number(process.env.LANES_JOBS ?? 4));
  const todo = seeds.flatMap((seed) => LANE_MODES.map((mode) => ({ seed, mode })));
  const runs: LaneRun[] = [];
  let next = 0;
  const worker = async () => {
    for (let t = todo[next++]; t; t = todo[next++]) {
      runs.push(await child(t.seed, t.mode, days));
      console.error(`done ${t.seed}/${t.mode}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, worker));
  console.log(formatLanes(runs, seeds, days));
  if (process.env.LANES_JSON) writeFileSync(process.env.LANES_JSON, `${JSON.stringify(runs, null, 2)}\n`);
  const fails = lanesVerdict(runs, seeds);
  if (fails.length) console.log(`\nLanes test FAILED\n${fails.join('\n')}`);
  else console.log('\nLanes test passed');
  process.exit(fails.length ? 1 : 0);
}

if (process.argv[1]?.endsWith('lanes.ts')) {
  if (process.argv[2] === '--one') {
    const run = playLane(process.argv[3]!, process.argv[4] as LaneMode, Number(process.env.LANES_DAYS ?? 70));
    console.log(JSON.stringify(run));
  } else {
    void main();
  }
}
