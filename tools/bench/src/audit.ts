// The playability audit (the dead-end hunt, docs/spec/31-parallel-development.md): the autoplayer
// plays several seeds through a full year (24 days), each again as a newcomer pair (P3A, newcomer.ts),
// and one seed on through the Village chapter,
// and everything that would stop a player is collected: the health watch's issues (site-stalled,
// site-cut-off, builders-idle, resident-stuck, no-builders, festival-no-show and, for the zones-first
// Ledger: business-short, a business or specialized building a whole day short of an input the
// carrier may buy; site-unsupplied, a construction site waiting on a good no maker and no carrier
// will bring; demand-unanswered, a demand bar lit three days with no empty lot of its zone;
// growth-wait-broken (P2), a bar that says a lot waits and building starts at the next pass, three
// days running, with nothing started; R2C, gap-unmeetable (a gap of a kind the town cannot meet at
// all, a day); R2X, building-cut-off (a built building nobody can walk to, a day: the class behind
// site-cut-off once the site is done), growth-waits-unseen (homes held back by quiet evenings a day
// with neither the Homes bar's reason nor a gap saying so); R2E, for the evening round: gap-dead-end (an open gap no command
// could close, a day), place-unreachable (a place no home door can walk to, a day), treats-unsold (an
// outlet with Treats on its shelf and a place in reach whose visitors bought none for a season of
// evenings), tier-unreachable (an evenings gate no town can build) and garden-grown (a garden lot
// something grew on); P3A, hands-spiral (food short and food jobs open two middays running while
// hands work past the first elsewhere, or sites pile up with the Homes bar silent); all quiet on the stand-ins; `EXPLAINED` holds the one newcomer-profile limit (treats-unsold);
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
import {
  achievable,
  BUILD_HOURS,
  calendar,
  rankAtLeast,
  setPlaceVerify,
  TICKS_PER_HOUR,
  type HealthIssue,
  type WorldState,
} from '@qoti/sim';
import { writeFileSync } from 'node:fs';
import { autoplay, type AutoplayOptions } from './autoplay';
import { heldActions, stuckCommands, STUCK_DAYS, type StuckCommand } from './decisions';

export const DEFAULT_SEEDS = ['willow', 'hazel', 'oak', 'birch'];
export const YEAR_DAYS = 24;
export const VILLAGE_DAYS = 44;
export const VILLAGE_SEED = 'hazel';
/** A template offered this many times and never granted is flagged. */
export const NEVER_GRANTED_AFTER = 3;

/**
 * Flags a known stand-in still raises, each with the cycle whose system removes it, so the audit
 * prints them as explained instead of failing the run. R1X emptied it as the wave landed: a flag
 * that outlives its stand-in is a dead end again.
 */
export const EXPLAINED: readonly {
  kind: HealthIssue['kind'];
  match: RegExp;
  /** The runs (`seed/label`) the entry covers; with none, every run. */
  run?: RegExp;
  why: string;
}[] = [
  {
    kind: 'treats-unsold',
    match:
      /^market-stall #\d+ has had Treats on the shelf and visitors at \d+ places in reach for \d+ evenings and sold none$/,
    run: /\/newcomer$/,
    why:
      'a limit of the newcomer pair, not a stuck shelf (P3A; hazel/newcomer, traced through tradePass): ' +
      'the few households out each evening either owed under one Treat (a line accrues 30 to 40 hundredths a day, ' +
      'so a household buys about every third evening), had bought tonight at an earlier stop, or, from Village rank ' +
      'when Treats are paid, held 200 to 292 pennies against a cheapest Treat of 300 (187 of 187 refusals at the stall ' +
      'were the purse); with no places or decor for five evenings (NEWCOMER_LATE) the town is thin. The tuned runs, ' +
      'with places from the first evening, flag nothing in this audit.',
  },
  {
    kind: 'treats-unsold',
    match:
      /^tavern #\d+ has had Treats on the shelf and visitors at \d+ places in reach for \d+ evenings and sold none$/,
    run: /\/village$/,
    why:
      'a limit of the thin Treats want, not a stuck shelf (R3X; hazel/village, traced through tradePass): the ' +
      'tavern pours one flavor at 424 to 519 pennies, and of 22 household-evenings at its two places over the six ' +
      'evenings every one owed under one Treat (at most 90 hundredths) and 12 also held a purse under the price; ' +
      'several had bought at another stop. A household buys about every third evening; buying at the tavern began ' +
      'the evening owed reached one Treat.',
  },
];

/** Why a flag is a known stand-in's, or null when it is a dead end. */
export function explained(i: Pick<HealthIssue, 'kind' | 'text'>, run = ''): string | null {
  return (
    EXPLAINED.find((e) => e.kind === i.kind && e.match.test(i.text) && (!e.run || e.run.test(run)))?.why ??
    null
  );
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
  /** R2E: commands the autoplayer kept sending and the sim kept refusing (a stuck player, not a dead end in the game). */
  stuck: StuckCommand[];
  /** R2E: Hearth sites left a day with every material in and no work (the player who asked would nudge them). */
  hearthStalled: string[];
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
  /** R2E: the autoplayer stuck on one refused command, by run; fails the audit like a flag. */
  stuck: (StuckCommand & { run: string })[];
  /** R2E: Hearth sites left a day with every material and no work, by run; fails the audit. */
  hearthStalled: { run: string; text: string }[];
}

/**
 * R2E's class check for the Hearth's own sites (a garden bed, a well, a tavern): stricter than the
 * game's site-stalled (two days), a Hearth-lane site with every material in and no work for a whole
 * working day (the builders' hours) is the autoplayer leaving its own piece behind (hazel's garden bed waited 48 hours).
 */
export class HearthSites {
  /** Site id: work done when last seen, and the builders' working hours it has waited since. */
  private readonly seen = new Map<number, [work: number, hours: number]>();
  private lastHour = -1;
  readonly stalled: string[] = [];
  private readonly told = new Set<number>();

  look(w: WorldState): void {
    // Hourly; a working day is the builders' hours (BUILD_HOURS), so a bed stocked at 18:00 is not
    // charged for the night.
    const hour = Math.floor(w.tick / TICKS_PER_HOUR);
    if (hour === this.lastHour) return;
    this.lastHour = hour;
    // In a Hamlet the homes go first and the Hearth's beds wait behind them by design (nudging them
    // there cost hazel a lean day); from Village rank the Hearth puts its own sites first.
    if (!rankAtLeast(w, 'village')) return;
    const h = calendar(w.tick).hour;
    const working = h >= BUILD_HOURS[0] && h < BUILD_HOURS[1];
    for (const b of w.buildings) {
      const c = b.rt?.construction;
      if (b.stage !== 'construction' || !c || b.rt?.paused) continue;
      const def = content.buildingById.get(b.def);
      // Homes are the Ledger's to place (a cottage's def is in the Hearth's lane); the rest are the Hearth's own.
      if (def?.lane !== 'hearth' || def.housing) continue;
      const allIn = c.needs.every((n) => n <= 0);
      const last = this.seen.get(b.id);
      if (!last || last[0] !== c.workDone || !allIn) {
        this.seen.set(b.id, [c.workDone, 0]);
        continue;
      }
      if (working) last[1]++;
      // A site the Hearth put first and still waiting waits on busy builders (the game's own
      // site-stalled, two days, catches that); the autoplayer's fault is a stocked site left un-nudged.
      if (last[1] >= BUILD_HOURS[1] - BUILD_HOURS[0] && !c.priority && !this.told.has(b.id)) {
        this.told.add(b.id);
        this.stalled.push(
          `${b.def} #${b.id} has had every material a working day with no work and was never put first (day ${calendar(w.tick).day})`,
        );
      }
    }
  }
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
  const hearthSites = new HearthSites();
  const run = autoplay(seed, days, {
    ...opts,
    onHour: (w) => {
      ledger.look(w);
      hearthSites.look(w);
    },
  });
  const last = run.days[run.days.length - 1]!;
  return {
    seed,
    label,
    days,
    residents: last.residents,
    rank: last.rank,
    wishes: ledger.result(),
    issues: run.health,
    stuck: [...stuckCommands(run.decisions), ...heldActions(run.actions)],
    hearthStalled: hearthSites.stalled,
  };
}

export function audit(
  seeds: readonly string[] = DEFAULT_SEEDS,
  days = YEAR_DAYS,
  villageDays = VILLAGE_DAYS,
  villageSeed = VILLAGE_SEED,
  log: (line: string) => void = () => {},
): AuditResult {
  // R2X: every seed plays with the place index verifier on (a writer that forgets to bump throws).
  setPlaceVerify(true);
  const runs: AuditRun[] = [];
  const plan: [string, number, string][] = seeds.map((s) => [s, days, 'year']);
  if (villageDays > 0) plan.push([villageSeed, villageDays, 'village']);
  // P3A: and every seed as a newcomer pair plays it (newcomer.ts), where the hands spiral lives.
  for (const s of seeds) plan.push([s, days, 'newcomer']);
  for (const [seed, d, label] of plan) {
    const t0 = performance.now();
    const r = playOne(seed, d, label, label === 'newcomer' ? { newcomer: true } : {});
    runs.push(r);
    log(
      `${seed.padEnd(7)} ${label.padEnd(7)} ${String(d).padStart(2)} days  ${String(r.residents).padStart(3)} residents  ${r.rank.padEnd(8)} ` +
        `${r.issues.length} issue${r.issues.length === 1 ? '' : 's'}  (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
    );
    for (const i of r.issues) log(`    ${i.kind}: ${i.text}`);
    for (const t of r.hearthStalled) log(`    hearth site stalled: ${t}`);
    for (const s of r.stuck)
      log(`    stuck: ${s.advisor} "${s.label}" refused on ${s.days} days (${s.first} to ${s.last})`);
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
  const flags = all.filter((i) => !explained(i, i.run));
  const known = all.flatMap((i) => {
    const why = explained(i, i.run);
    return why ? [{ ...i, why }] : [];
  });
  const stuck = runs.flatMap((r) => r.stuck.map((s) => ({ ...s, run: `${r.seed}/${r.label}` })));
  const hearthStalled = runs.flatMap((r) =>
    r.hearthStalled.map((text) => ({ run: `${r.seed}/${r.label}`, text })),
  );
  return { runs, wishes, warnings, flags, explained: known, stuck, hearthStalled };
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
  for (const s of r.stuck)
    lines.push(
      `stuck  ${s.run} ${s.advisor}: "${s.label}" refused on ${s.days} days (${s.first} to ${s.last}; ${STUCK_DAYS}+ fails)`,
    );
  for (const h of r.hearthStalled) lines.push(`hearth site stalled  ${h.run} ${h.text}`);
  const bad = r.flags.length + r.stuck.length + r.hearthStalled.length;
  lines.push(
    bad
      ? `FAIL: ${r.flags.length} dead-end flags, ${r.stuck.length} stuck commands, ${r.hearthStalled.length} Hearth sites stalled`
      : 'PASS: no dead-end flags, no stuck commands, no Hearth site stalled',
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
  process.exit(result.flags.length || result.stuck.length || result.hearthStalled.length ? 1 : 0);
}
