// What an advisor is (C5.0). An advisor minds one area of the town (homes and food, money, the
// Village chains, wishes and decor, a season's needs) and proposes wants to the planner; it never
// keeps its own build queue, labor count or money reserve. The planner visits the advisors in play
// at 09:00 and 15:00 in `slot` order, like one person dropping in twice a day.
import type { ValleySettings, WorldState } from '@qoti/sim';
import type { DayLine } from '../autoplay';
import type { Planner } from '../planner';

/** The `autoplay` options an advisor may read to decide whether it plays. */
export interface AutoplayOptions {
  economy?: ValleySettings['economy'];
  hearth?: boolean;
  /** Tuning: on this morning the County grants Village rank whether or not the Charter is done. */
  villageDay?: number;
  /** From this day on the players only watch (C4B: does growth stop when demand does?). */
  handsOff?: number;
  /**
   * Until C4C's Trading Post was in content: from Village rank the storehouses doubled as one
   * (the 'trading-post' tag is lent to their def for the run). A no-op now the post is in content.
   */
  standInPost?: boolean;
  /** C4D: the two players also work together at 15:00 (requests, plans, the Charter). */
  together?: boolean;
  /** C4C: play the Village chains, services and tiers (and claim the Charter when ready). */
  village?: boolean;
  /** Called after each day's line is recorded (tuning scripts read the books here). */
  onDay?: (w: WorldState, line: DayLine) => void;
}

export interface Visit {
  /** The 15:00 visit (tidying sites, decorating, working together); false at 09:00. */
  afternoon: boolean;
}

export interface Advisor {
  /** The first morning at Village rank, before that morning's visit. */
  rankUp?(): void;
  /** One visit: read the town, propose wants, pull levers. */
  visit(v: Visit): void;
}

export interface AdvisorDef {
  id: string;
  /** Visit order (lower first). The I2 order: village 10, then the Ledger (street, charter, money, hamlet), the Hearth, together. */
  slot: number;
  /** Whether it plays this run: the system it minds exists (in content or state) and the options allow it. */
  plays(opts: AutoplayOptions, w: WorldState): boolean;
  create(p: Planner): Advisor;
}
