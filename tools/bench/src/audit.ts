// The playability audit (the dead-end hunt, docs/spec/31-parallel-development.md): the autoplayer
// plays several seeds through a full year (24 days) and one seed on through the Village chapter,
// and everything that would stop a player is collected: the health watch's issues (stuck sites,
// idle builders, a valley with no builders, a building idle for want of an input, a wish nobody can
// grant, a festival that never started, an order never filled) and, per wish template, how many
// were offered, granted and let go (and how many let go while impossible).
//
// `npm run audit -w @qoti/bench [seed ...]` (default willow hazel oak birch); AUDIT_JSON=<file>
// writes the results; AUDIT_DAYS and AUDIT_VILLAGE_DAYS override the lengths (the unit test uses
// them). Exits non-zero when a dead-end flag appears. 'wish-never-granted' (a template offered three
// times or more and never granted) is a warning: it prints but does not fail.
import { content } from '@qoti/content';
import { achievable, type HealthIssue, type WorldState } from '@qoti/sim';
import { writeFileSync } from 'node:fs';
import { autoplay, type AutoplayOptions } from './autoplay';

export const DEFAULT_SEEDS = ['willow', 'hazel', 'oak', 'birch'];
export const YEAR_DAYS = 24;
export const VILLAGE_DAYS = 44;
export const VILLAGE_SEED = 'hazel';
/** A template offered this many times and never granted is flagged. */
export const NEVER_GRANTED_AFTER = 3;

export interface WishStat {
  template: string;
  offered: number;
  granted: number;
  expired: number;
  /** Let go while its target was not achievable (the last look before it went). */
  expiredUnachievable: number;
}

export interface AuditRun {
  seed: string;
  label: string;
  days: number;
  residents: number;
  rank: string;
  wishes: WishStat[];
  issues: HealthIssue[];
}

export interface AuditWarning {
  kind: 'wish-never-granted';
  template: string;
  text: string;
}

export interface AuditResult {
  runs: AuditRun[];
  /** Per template, summed over every run. */
  wishes: WishStat[];
  warnings: AuditWarning[];
  /** Dead-end flags: every health issue of every run. */
  flags: (HealthIssue & { run: string })[];
}

/** Watches wishes at each hourly look: new ones are offered; ones that vanish were granted or let go. */
class WishLedger {
  private readonly stats = new Map<string, WishStat>();
  /** Wish id → [template, expiresTick, achievable at the last look]. */
  private readonly live = new Map<number, [string, number, boolean]>();
  private granted = 0;

  private stat(template: string): WishStat {
    let s = this.stats.get(template);
    if (!s)
      this.stats.set(
        template,
        (s = { template, offered: 0, granted: 0, expired: 0, expiredUnachievable: 0 }),
      );
    return s;
  }

  look(w: WorldState): void {
    const now = new Set<number>();
    for (const wish of w.wishes) {
      now.add(wish.id);
      const t = content.wishById.get(wish.template);
      if (!this.live.has(wish.id)) this.stat(wish.template).offered++;
      this.live.set(wish.id, [wish.template, wish.expiresTick, t ? achievable(w, t.target) : true]);
    }
    // Wishes gone since the last look: the sim says how many were granted; the rest were let go.
    let grants = w.stats.wishesGranted - this.granted;
    this.granted = w.stats.wishesGranted;
    for (const [id, [template, expires, ok]] of [...this.live]) {
      if (now.has(id)) continue;
      this.live.delete(id);
      const s = this.stat(template);
      // One that went at or after its expiry faded; otherwise a grant if the sim counted one.
      if (grants > 0 && w.tick < expires) {
        grants--;
        s.granted++;
      } else {
        s.expired++;
        if (!ok) s.expiredUnachievable++;
      }
    }
  }

  result(): WishStat[] {
    return [...this.stats.values()].sort((a, b) => a.template.localeCompare(b.template));
  }
}

function playOne(seed: string, days: number, label: string, opts: AutoplayOptions): AuditRun {
  const ledger = new WishLedger();
  const run = autoplay(seed, days, { ...opts, onHour: (w) => ledger.look(w) });
  const last = run.days[run.days.length - 1]!;
  return {
    seed,
    label,
    days,
    residents: last.residents,
    rank: last.rank,
    wishes: ledger.result(),
    issues: run.health,
  };
}

export function audit(
  seeds: readonly string[] = DEFAULT_SEEDS,
  days = YEAR_DAYS,
  villageDays = VILLAGE_DAYS,
  villageSeed = VILLAGE_SEED,
  log: (line: string) => void = () => {},
): AuditResult {
  const runs: AuditRun[] = [];
  const plan: [string, number, string][] = seeds.map((s) => [s, days, 'year']);
  if (villageDays > 0) plan.push([villageSeed, villageDays, 'village']);
  for (const [seed, d, label] of plan) {
    const t0 = performance.now();
    const r = playOne(seed, d, label, {});
    runs.push(r);
    log(
      `${seed.padEnd(7)} ${label.padEnd(7)} ${String(d).padStart(2)} days  ${String(r.residents).padStart(3)} residents  ${r.rank.padEnd(8)} ` +
        `${r.issues.length} issue${r.issues.length === 1 ? '' : 's'}  (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
    );
    for (const i of r.issues) log(`    ${i.kind}: ${i.text}`);
  }
  const sums = new Map<string, WishStat>();
  for (const r of runs)
    for (const s of r.wishes) {
      const t = sums.get(s.template) ?? {
        template: s.template,
        offered: 0,
        granted: 0,
        expired: 0,
        expiredUnachievable: 0,
      };
      t.offered += s.offered;
      t.granted += s.granted;
      t.expired += s.expired;
      t.expiredUnachievable += s.expiredUnachievable;
      sums.set(s.template, t);
    }
  const wishes = [...sums.values()].sort((a, b) => a.template.localeCompare(b.template));
  const warnings: AuditWarning[] = wishes
    .filter((s) => s.offered >= NEVER_GRANTED_AFTER && s.granted === 0)
    .map((s) => ({
      kind: 'wish-never-granted',
      template: s.template,
      text: `wish ${s.template} was offered ${s.offered} times and never granted (${s.expired} let go, ${s.expiredUnachievable} while impossible)`,
    }));
  const flags = runs.flatMap((r) => r.issues.map((i) => ({ ...i, run: `${r.seed}/${r.label}` })));
  return { runs, wishes, warnings, flags };
}

export function formatSummary(r: AuditResult): string {
  const lines: string[] = [
    '',
    'Wishes by template (all runs)',
    'template                      offered granted expired impossible',
  ];
  for (const s of r.wishes)
    lines.push(
      `${s.template.padEnd(29)} ${String(s.offered).padStart(7)} ${String(s.granted).padStart(7)} ${String(s.expired).padStart(7)} ${String(s.expiredUnachievable).padStart(10)}`,
    );
  lines.push('', 'Summary', 'run              days residents rank     flags');
  for (const run of r.runs)
    lines.push(
      `${`${run.seed}/${run.label}`.padEnd(16)} ${String(run.days).padStart(4)} ${String(run.residents).padStart(9)} ${run.rank.padEnd(8)} ${run.issues.length}`,
    );
  for (const w of r.warnings) lines.push(`warning  ${w.kind}: ${w.text}`);
  lines.push(
    r.flags.length
      ? `FAIL: ${r.flags.length} dead-end flag${r.flags.length === 1 ? '' : 's'}`
      : 'PASS: no dead-end flags',
  );
  return lines.join('\n');
}

if (process.argv[1]?.endsWith('audit.ts')) {
  const seeds = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SEEDS;
  const days = Number(process.env.AUDIT_DAYS ?? YEAR_DAYS);
  const villageDays = Number(process.env.AUDIT_VILLAGE_DAYS ?? VILLAGE_DAYS);
  const result = audit(seeds, days, villageDays, VILLAGE_SEED, console.log);
  console.log(formatSummary(result));
  if (process.env.AUDIT_JSON) writeFileSync(process.env.AUDIT_JSON, `${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.flags.length ? 1 : 0);
}
