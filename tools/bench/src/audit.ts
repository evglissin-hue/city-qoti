// The playability audit (the dead-end hunt, docs/spec/31-parallel-development.md): the autoplayer
// plays several seeds through a full year (24 days) and one seed on through the Village chapter,
// and everything that would stop a player is collected: the health watch's issues (site-stalled,
// site-cut-off, builders-idle, resident-stuck, no-builders, festival-no-show and, for the zones-first
// Ledger: business-short, a business or specialized building a whole day short of an input the
// carrier may buy; site-unsupplied, a construction site waiting on a good no maker and no carrier
// will bring; demand-unanswered, a demand bar lit three days with no empty lot of its zone;
// site-rule-broken, a specialized building whose woods, open ground or road went; wish-dead-end,
// guide-dead-end and story-dead-end, a goal nothing can meet) and, per wish template, how many were
// offered, granted and let go (and how many let go while impossible). R1.0: standing orders are
// gone, so no order is ever left unfilled (`packages/sim/src/view/health.ts`).
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

/**
 * Flags today's stand-ins still raise, each with the cycle whose system removes it, so the audit
 * prints them as explained instead of failing the run. R1 stand-in (R1X): empty this list as the
 * wave lands; a flag that outlives its stand-in is a dead end again.
 */
export const EXPLAINED: readonly { kind: HealthIssue['kind']; match: RegExp; why: string }[] = [
  {
    kind: 'site-rule-broken',
    match: /^foresters-lodge /,
    why: "R1B: the Forester's Lodge fells its wood and does not replant it yet",
  },
  {
    // Only while the town is in debt: a bar unanswered with coins in hand is the land advisor's.
    kind: 'demand-unanswered',
    match: /\(treasury -\d+ coins\)$/,
    why: 'R1X: the stand-in Village economy runs the treasury into debt (wages outrun sales while no Wares or Treats are sold), and a town in debt lays no lane',
  },
];

/** Why a flag is a known stand-in's, or null when it is a dead end. */
export function explained(i: Pick<HealthIssue, 'kind' | 'text'>): string | null {
  return EXPLAINED.find((e) => e.kind === i.kind && e.match.test(i.text))?.why ?? null;
}

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
  /** Dead-end flags: every health issue of every run, but the explained ones. */
  flags: (HealthIssue & { run: string })[];
  /** Health issues a stand-in still raises (`EXPLAINED`), with why. */
  explained: (HealthIssue & { run: string; why: string })[];
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
  const all = runs.flatMap((r) => r.issues.map((i) => ({ ...i, run: `${r.seed}/${r.label}` })));
  const flags = all.filter((i) => !explained(i));
  const known = all.flatMap((i) => {
    const why = explained(i);
    return why ? [{ ...i, why }] : [];
  });
  return { runs, wishes, warnings, flags, explained: known };
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
  for (const e of r.explained) lines.push(`explained  ${e.run} ${e.kind}: ${e.text} (${e.why})`);
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
