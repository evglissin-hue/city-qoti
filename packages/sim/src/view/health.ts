// Health checks (playtest round three): things that should be true at every stage of a game, so a
// town that quietly stops working is noticed by a test, the autoplayer or a developer, not by two
// players wondering why nothing gets built. Read-only and outside the simulation: the watcher keeps
// what it has seen in its own memory, never in state, so it changes nothing and hashes nothing.
import { content } from '@qoti/content';
import { ResidentFlags, TICKS_PER_DAY, TICKS_PER_HOUR } from '../constants';
import type { Building, WorldState } from '../contracts';
import { townReachesDoor } from '../state/reach';
import { isStandard } from '../state/hamlet';
import { isBuildTime } from '../systems/economy/time';
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
  | 'resident-stuck';

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
    return out;
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
