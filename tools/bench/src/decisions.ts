// The decisions count (R1F, docs/spec/22-quality.md, "Decisions, not chores"): the autoplayer logs
// every command it sends by lane (the Ledger's seat or the Hearth's) and kind, and the verdict
// holds the Ledger to a handful of decisions and each lane to its own kind of work. The Ledger
// decides where the town goes (zones, streets, specialized buildings, the books); the Hearth
// answers wishes and dresses the town. A Ledger who has to balance labor by hand, or place decor, is
// doing chores, and a Hearth who zones is doing the Ledger's job.
import { content } from '@qoti/content';
import type { Command } from '@qoti/sim';
import type { PlayLane } from './advisors/types';

/** The most commands the Ledger may have accepted over the first `DECISIONS_DAYS` days. */
export const DECISIONS_LIMIT = 150;
export const DECISIONS_DAYS = 70;

export interface DecisionRecord {
  day: number;
  /** The advisor id, or 'planner' for the planner's own calls. */
  advisor: string;
  lane: PlayLane;
  /** The command's type (`Command['t']`). */
  kind: string;
  /** Whether the sim took this command. */
  ok: boolean;
  /** The planner's action label. */
  label: string;
  /** The command itself, for the verdict's rules. */
  cmd: Command;
}

export interface KindTally {
  kind: string;
  ledger: number;
  hearth: number;
  ledgerRefused: number;
  hearthRefused: number;
}

export interface AdvisorTally {
  advisor: string;
  total: number;
  refused: number;
}

export interface DecisionTally {
  kinds: KindTally[];
  advisors: AdvisorTally[];
  /** Accepted commands per lane. */
  ledger: number;
  hearth: number;
  /** Refused commands, both lanes. */
  refused: number;
}

/** Counts the records of the first `days` days: by kind (sent and refused apart) and by advisor. */
export function tallyDecisions(records: readonly DecisionRecord[], days: number): DecisionTally {
  const kinds = new Map<string, KindTally>();
  const advisors = new Map<string, AdvisorTally>();
  let ledger = 0;
  let hearth = 0;
  let refused = 0;
  for (const r of records) {
    if (r.day > days) continue;
    const k = kinds.get(r.kind) ?? { kind: r.kind, ledger: 0, hearth: 0, ledgerRefused: 0, hearthRefused: 0 };
    const a = advisors.get(r.advisor) ?? { advisor: r.advisor, total: 0, refused: 0 };
    a.total++;
    if (r.ok) {
      if (r.lane === 'ledger') {
        k.ledger++;
        ledger++;
      } else {
        k.hearth++;
        hearth++;
      }
    } else {
      if (r.lane === 'ledger') k.ledgerRefused++;
      else k.hearthRefused++;
      a.refused++;
      refused++;
    }
    kinds.set(r.kind, k);
    advisors.set(r.advisor, a);
  }
  return {
    kinds: [...kinds.values()].sort(
      (a, b) => b.ledger - a.ledger || b.hearth - a.hearth || a.kind.localeCompare(b.kind),
    ),
    advisors: [...advisors.values()].sort((a, b) => b.total - a.total || a.advisor.localeCompare(b.advisor)),
    ledger,
    hearth,
    refused,
  };
}

const LEDGER_NO_DECOR = new Set(['decor.move', 'decor.place', 'decor.placeRun', 'tree.plant']);

/** Why the town fails the decisions test; empty means it passes. Only the first `days` days count. */
export function decisionVerdict(records: readonly DecisionRecord[], days = DECISIONS_DAYS): string[] {
  const fails: string[] = [];
  const seen = records.filter((r) => r.day <= days);
  const count = (f: (r: DecisionRecord) => boolean) => seen.filter(f).length;
  const ledgerOk = count((r) => r.lane === 'ledger' && r.ok);
  if (ledgerOk > DECISIONS_LIMIT)
    fails.push(`the Ledger sent ${ledgerOk} accepted commands in ${days} days (limit ${DECISIONS_LIMIT})`);
  const pauses = count((r) => r.lane === 'ledger' && r.cmd.t === 'build.setPaused' && r.cmd.paused === true);
  if (pauses > 0) fails.push(`the Ledger paused a building ${pauses} times to balance labor`);
  const decor = count((r) => r.lane === 'ledger' && LEDGER_NO_DECOR.has(r.kind));
  if (decor > 0) fails.push(`the Ledger placed decor or trees ${decor} times`);
  const hearthZoned = count(
    (r) =>
      r.lane === 'hearth' &&
      (r.cmd.t === 'zone.paint' ||
        (r.cmd.t === 'road.paint' && (r.cmd.kind === 'lane' || r.cmd.kind === 'street')) ||
        (r.cmd.t === 'build.place' && content.buildingById.get(r.cmd.def)?.specialized === true)),
  );
  if (hearthZoned > 0)
    fails.push(`the Hearth zoned, laid streets or placed specialized buildings ${hearthZoned} times`);
  return fails;
}

/** A plain-text table of the decisions, and the verdict. */
export function formatDecisions(records: readonly DecisionRecord[], days: number): string {
  const t = tallyDecisions(records, days);
  const lines = ['kind                 ledger hearth refused'];
  for (const k of t.kinds)
    lines.push(
      `${k.kind.padEnd(20)} ${String(k.ledger).padStart(6)} ${String(k.hearth).padStart(6)} ${String(k.ledgerRefused + k.hearthRefused).padStart(7)}`,
    );
  lines.push('', 'advisor              total refused');
  for (const a of t.advisors)
    lines.push(`${a.advisor.padEnd(20)} ${String(a.total).padStart(5)} ${String(a.refused).padStart(7)}`);
  const fails = decisionVerdict(records, days);
  lines.push(
    '',
    `Ledger ${t.ledger} of ${DECISIONS_LIMIT} in ${days} days`,
    fails.length ? `FAIL: ${fails.join('; ')}` : 'PASS',
  );
  return lines.join('\n');
}
