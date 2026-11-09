// Health checks (playtest round three): things that should be true at every stage of a game, so a
// town that quietly stops working is noticed by a test, the autoplayer or a developer, not by two
// players wondering why nothing gets built. Read-only and outside the simulation: the watcher keeps
// what it has seen in its own memory, never in state, so it changes nothing and hashes nothing.
import { content } from '@qoti/content';
import {
  BuildingStatus,
  DAYS_PER_SEASON,
  FESTIVAL,
  RANKS,
  ResidentFlags,
  SEASON_NAMES,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '../constants';
import type { Building, WorldState } from '../contracts';
import { townReachesDoor } from '../state/reach';
import { isStandard } from '../state/hamlet';
import { hourOf, isBuildTime } from '../systems/economy/time';
import { currentPlan, isFestivalDay } from '../systems/festivals/api';
import { achievable } from '../systems/hearth/wishes/achievable';
import { overdraftLimit } from '../systems/loans/credit';
import { seasonNow } from '../systems/seasons/api';
import { postBuyPrice } from '../systems/trade/caravans';
import { tradingPost } from '../systems/trade/post';
import { MAX_BUILDERS_PER_SITE } from '../systems/construction';
import { available } from '../systems/logistics/tasks';
import { allowedWork } from '../systems/production/status';
import { townStock } from './hamlet';

export type HealthKind =
  /** Every material in, no progress for a long time. */
  | 'site-stalled'
  /** Nobody from the town can walk to the site's door. */
  | 'site-cut-off'
  /** A site waits on a good the town has none of and has no building (built or rising) to make. */
  | 'material-deadlock'
  /** Builders idle at their workplace in work hours while a site has work they could do. */
  | 'builders-idle'
  /** A resident flagged stuck for hours. */
  | 'resident-stuck'
  /** A standard valley with a site waiting and no built builder place (town hall or builder's yard). */
  | 'no-builders'
  /** A production building short of an input through a whole season while it has workers. */
  | 'idle-for-input'
  /** A voiced wish whose target cannot be met by anything the town can do, for a whole day. */
  | 'wish-dead-end'
  /** A festival plan that was current on the festival day and never started. */
  | 'festival-no-show'
  /** A standing order below its min for a season, with credit and a neighbor selling the good. */
  | 'order-never-filled';

export interface HealthIssue {
  kind: HealthKind;
  /** The building or resident concerned. */
  id: number;
  text: string;
}

/** A site with all its materials may go this long without progress (a builder's queue, a night). */
export const STALL_TICKS = 2 * TICKS_PER_DAY;
/** Builders may stand idle beside waiting work this long (the matcher runs every 20 ticks). */
export const IDLE_TICKS = 2 * TICKS_PER_HOUR;
/** A resident may stay flagged stuck this long. */
export const STUCK_TICKS = 6 * TICKS_PER_HOUR;
/** No builder place beside a waiting site, an unachievable wish: a day before it counts. */
export const DAY_TICKS = TICKS_PER_DAY;
/** An input short, an order unfilled: a season (6 days) before it counts. */
export const SEASON_TICKS = DAYS_PER_SEASON * TICKS_PER_DAY;

const quietCache = new Map<string, ReadonlySet<number>>();
const ALL_YEAR: ReadonlySet<number> = new Set();
/** Field crops come in from the first summer cutting until the last sheaf, so winter and spring wait. */
const FIELD_QUIET: ReadonlySet<number> = new Set([3, 0]);

/**
 * P1: the seasons (0 spring to 3 winter) in which a good runs short by design, so a mill waiting on
 * it then is no dead end: a field crop in winter and spring (the barn is empty until the summer
 * cutting, and the windmill's line says so), a gathered good out of season, and what is made only
 * from them. A good that some producer makes all year is never quiet.
 */
export function quietSeasons(good: string, seen: ReadonlySet<string> = new Set()): ReadonlySet<number> {
  const hit = quietCache.get(good);
  if (hit) return hit;
  if (seen.has(good)) return ALL_YEAR;
  const path = new Set(seen).add(good);
  const producers: ReadonlySet<number>[] = [];
  for (const def of content.buildings)
    for (const m of def.methods ?? []) {
      if (!m.outputs.some(([g]) => g === good)) continue;
      let mine: ReadonlySet<number>;
      if (m.kind === 'farm') mine = FIELD_QUIET;
      else if (m.kind === 'gather') {
        const table = content.goodById.get(good)?.seasons;
        mine = new Set(table ? [0, 1, 2, 3].filter((i) => table[i] === 0) : []);
      } else if (m.kind === 'craft' && m.inputs.length > 0) {
        // Short whenever any input is short.
        const any = new Set<number>();
        for (const [g] of m.inputs) for (const q of quietSeasons(g, path)) any.add(q);
        mine = any;
      } else mine = ALL_YEAR;
      producers.push(mine);
    }
  // Quiet only when every producer is.
  const out: ReadonlySet<number> =
    producers.length === 0 ? ALL_YEAR : new Set([0, 1, 2, 3].filter((q) => producers.every((p) => p.has(q))));
  if (seen.size === 0) quietCache.set(good, out);
  return out;
}

/**
 * Watches a valley over time. Call `check` as often as you like (every game hour is plenty); it
 * returns the issues that hold now, judged against what it saw on earlier calls.
 */
export class HealthWatch {
  /** Site id → [workDone seen, tick it was first seen at that value]. */
  private readonly progress = new Map<number, [number, number]>();
  /** Site id → [workDone, tick it was first seen workable with builders free]. */
  private readonly waiting = new Map<number, [number, number]>();
  private readonly stuckSince = new Map<number, number>();
  private noBuildersSince = -1;
  /** Building id → tick it was first seen short of an input (and not once clear since). */
  private readonly shortSince = new Map<number, number>();
  /** Wish id → tick it was first seen with an unachievable target. */
  private readonly deadSince = new Map<number, number>();
  /** Day index of a festival day on which a current plan was seen, and whether it was reported. */
  private festivalDay = -1;
  private festivalReported = false;
  /** Good index → tick a standing order was first seen below its min. */
  private readonly unfilledSince = new Map<number, number>();

  check(state: WorldState): HealthIssue[] {
    if (!isStandard(state)) return [];
    const out: HealthIssue[] = [];
    const now = state.tick;
    const sites = state.buildings.filter((b) => b.stage === 'construction' && b.rt?.construction);
    const seen = new Set<number>();
    for (const b of sites) {
      const c = b.rt!.construction!;
      seen.add(b.id);
      const last = this.progress.get(b.id);
      const allIn = c.needs.every((n) => n <= 0);
      // The clock runs from the last progress or the last look still waiting on materials: a site
      // that waited days for its last stone was not stalled with everything in (C5A).
      if (!last || last[0] !== c.workDone || !allIn) this.progress.set(b.id, [c.workDone, now]);
      if (allIn && last && last[0] === c.workDone && now - last[1] >= STALL_TICKS && !b.rt!.paused) {
        out.push({
          kind: 'site-stalled',
          id: b.id,
          text: `${b.def} #${b.id} has every material and has not moved in ${Math.floor((now - last[1]) / TICKS_PER_HOUR)} hours`,
        });
      }
      if (!townReachesDoor(state, b)) {
        out.push({ kind: 'site-cut-off', id: b.id, text: `${b.def} #${b.id}: nobody can walk to its door` });
      }
      for (const g of deadlocked(state, b)) {
        out.push({
          kind: 'material-deadlock',
          id: b.id,
          text: `${b.def} #${b.id} waits on ${g}: none in town, nothing makes it, nothing is being built to`,
        });
      }
    }
    for (const id of [...this.progress.keys()]) if (!seen.has(id)) this.progress.delete(id);

    // Builders idle beside work they could do: a reachable site with work allowed and room in its
    // crew that has not moved for a while, though builders stood free at every look.
    const crews = new Map<number, number>();
    for (const r of state.residents)
      if (r.activity.kind === 'task' && r.activity.taskId < 0)
        crews.set(-r.activity.taskId, (crews.get(-r.activity.taskId) ?? 0) + 1);
    const idle = isBuildTime(now) ? idleBuilders(state) : 0;
    for (const b of sites) {
      const c = b.rt!.construction!;
      const workable =
        idle > 0 &&
        !b.rt!.paused &&
        c.workDone < allowedWork(b.rt!) &&
        (crews.get(b.id) ?? 0) < MAX_BUILDERS_PER_SITE &&
        townReachesDoor(state, b);
      const was = this.waiting.get(b.id);
      if (!workable || (was && was[0] !== c.workDone)) {
        if (workable) this.waiting.set(b.id, [c.workDone, now]);
        else this.waiting.delete(b.id);
        continue;
      }
      if (!was) {
        this.waiting.set(b.id, [c.workDone, now]);
        continue;
      }
      if (now - was[1] >= IDLE_TICKS)
        out.push({
          kind: 'builders-idle',
          id: b.id,
          text: `${b.def} #${b.id} has had work ready for ${Math.floor((now - was[1]) / TICKS_PER_HOUR)} hours while ${idle} builder${idle === 1 ? '' : 's'} stood free`,
        });
    }
    for (const id of [...this.waiting.keys()]) if (!seen.has(id)) this.waiting.delete(id);

    for (const r of state.residents) {
      if (!(r.flags & ResidentFlags.stuck)) {
        this.stuckSince.delete(r.id);
        continue;
      }
      const since = this.stuckSince.get(r.id) ?? now;
      this.stuckSince.set(r.id, since);
      if (now - since >= STUCK_TICKS)
        out.push({
          kind: 'resident-stuck',
          id: r.id,
          text: `${r.given} ${r.family} has been stuck for hours`,
        });
    }
    this.checkPlayability(state, out);
    return out;
  }

  /** The playability audit's checks: soft locks and dead ends that wait on time, not on one look. */
  private checkPlayability(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;

    // A site waits and nothing built can raise it.
    const waiting = state.buildings.some((b) => b.stage === 'construction');
    const hasBuilders = state.buildings.some(
      (b) => b.stage === 'built' && content.buildingById.get(b.def)?.jobs?.role === 'builder',
    );
    if (!waiting || hasBuilders) this.noBuildersSince = -1;
    else {
      if (this.noBuildersSince < 0) this.noBuildersSince = now;
      if (now - this.noBuildersSince >= DAY_TICKS)
        out.push({
          kind: 'no-builders',
          id: 0,
          text: "a site is waiting and the valley has no town hall or builder's yard to raise it",
        });
    }

    // Production short of an input for a whole season.
    const live = new Set<number>();
    for (const b of state.buildings) {
      const rt = b.rt;
      if (b.stage !== 'built' || !rt || !(rt.status & BuildingStatus.missingInput)) continue;
      const def = content.buildingById.get(b.def);
      if (!def || !(rt.workers.length > 0 || (def.jobs?.count ?? 0) > 0)) continue;
      const method = def.methods?.[rt.method];
      const short = (method?.inputs ?? []).filter(
        ([g, q]) => (rt.input[content.goodIndex.get(g) ?? -1] ?? 0) < q,
      );
      // P1: waiting on a field crop in winter and spring is the year's shape, not a dead end; the
      // clock starts again in summer, so a windmill idle through a summer is still found.
      const season = seasonNow(state).season;
      if (short.length > 0 && short.every(([g]) => quietSeasons(g).has(season))) continue;
      live.add(b.id);
      const since = this.shortSince.get(b.id) ?? now;
      this.shortSince.set(b.id, since);
      if (now - since < SEASON_TICKS) continue;
      const goods = short.map(([g]) => g).join(' and ') || 'an input';
      out.push({
        kind: 'idle-for-input',
        id: b.id,
        text: `${def.id} #${b.id} has had no ${goods} for a whole season (${SEASON_NAMES[seasonNow(state).season]}, day ${seasonNow(state).day})`,
      });
    }
    for (const id of [...this.shortSince.keys()]) if (!live.has(id)) this.shortSince.delete(id);

    // Voiced wishes the town could not meet by building anything.
    const wishes = new Set<number>();
    for (const w of state.wishes) {
      const t = content.wishById.get(w.template);
      if (!t || achievable(state, t.target)) continue;
      wishes.add(w.id);
      const since = this.deadSince.get(w.id) ?? now;
      this.deadSince.set(w.id, since);
      if (now - since >= DAY_TICKS)
        out.push({
          kind: 'wish-dead-end',
          id: w.id,
          text: `wish ${t.id} (#${w.id}) asks for something no one can do`,
        });
    }
    for (const id of [...this.deadSince.keys()]) if (!wishes.has(id)) this.deadSince.delete(id);

    // A festival plan that was current on the day but had not started by 19:00.
    if (isFestivalDay(state)) {
      const day = Math.floor(now / TICKS_PER_DAY);
      const hour = hourOf(now);
      if (this.festivalDay !== day) {
        this.festivalDay = day;
        this.festivalReported = false;
      }
      const plan = currentPlan(state);
      const started = state.festival.live || state.festival.outcome !== null;
      if (plan && hour > FESTIVAL.from && hour < FESTIVAL.to && !started && !this.festivalReported) {
        this.festivalReported = true;
        out.push({
          kind: 'festival-no-show',
          id: 0,
          text: `the ${plan.festival} plan was current but the festival never started by ${FESTIVAL.from}:01`,
        });
      }
    }

    // Standing orders below their min for a season though a neighbor sells and the treasury can pay.
    const post = tradingPost(state);
    const stock = townStock(state);
    const open = new Set<number>();
    for (const o of post ? state.trade.orders : []) {
      if ((stock[o.good] ?? 0) >= o.min) continue;
      const sold = state.trade.neighbors.some((n) => {
        const p = postBuyPrice(state, n.id, o.good);
        const named = !o.neighbor || o.neighbor === n.id;
        const rank = content.neighborById.get(n.id)?.rank;
        if (rank && RANKS.indexOf(state.charter.rank) < RANKS.indexOf(rank)) return false;
        return (
          named &&
          p !== null &&
          (o.ceiling === 0 || p <= o.ceiling) &&
          state.economy.treasury - p > -overdraftLimit(state)
        );
      });
      if (!sold) continue;
      open.add(o.good);
      const since = this.unfilledSince.get(o.good) ?? now;
      this.unfilledSince.set(o.good, since);
      if (now - since >= SEASON_TICKS)
        out.push({
          kind: 'order-never-filled',
          id: o.good,
          text: `the standing order for ${content.goods[o.good]?.id} has sat below its minimum of ${o.min} for a season`,
        });
    }
    for (const g of [...this.unfilledSince.keys()]) if (!open.has(g)) this.unfilledSince.delete(g);
  }
}

function idleBuilders(state: WorldState): number {
  let n = 0;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || content.buildingById.get(b.def)?.jobs?.role !== 'builder') continue;
    for (const id of b.rt.workers) {
      const r = state.residents.find((x) => x.id === id);
      if (r && available(r, b)) n++;
    }
  }
  return n;
}

/** Goods a site waits on that the town cannot get: none in stock, no maker working or rising. */
function deadlocked(state: WorldState, site: Building): string[] {
  const c = site.rt!.construction!;
  const stock = townStock(state);
  const out: string[] = [];
  c.needs.forEach((need, g) => {
    if (need <= 0 || (stock[g] ?? 0) > 0) return;
    const good = content.goods[g]!.id;
    const makers = new Set(
      content.buildings
        .filter((d) => d.methods?.some((m) => m.outputs.some(([o]) => o === good)))
        .map((d) => d.id),
    );
    // A maker built or rising counts (one waiting on its own inputs shows up as its own issue).
    const coming = state.buildings.some((b) => makers.has(b.def));
    if (!coming) out.push(good);
  });
  return out;
}
