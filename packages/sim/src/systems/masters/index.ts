// The masters system (R3B; docs/spec/19-evenings.md, Masters). Daily at 23:45, after the levels pass
// (23:30), in this order: (a) working days by trade (`Resident.craft`), counted from the crews;
// (b) story characters, masters by their arcs (once the arc is done); (c) new masters by the rule, one a trade a season,
// chosen by days and then id (no dice); (d) `Building.masterId` kept in step with the crews.
// Losing one is the residents' morning (systems/residents/life.ts); the levels pass keeps the grace.
import { content, MASTERY } from '@qoti/content';
import { ResidentFlags, TICKS_PER_DAY } from '../../constants';
import type { Building, Resident, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { levelOf } from '../../state/zones';
import { dailyOffset, dayIndex } from '../economy/time';
import { outOfSeason } from '../levels/season';
import { isMaster, masteryKey } from './api';
import { addCraft, craftDays } from './craft';
import { absoluteSeason, lastMadeIn, makeMaster, settleMasterId } from './make';

export const MASTERS_OFFSET = dailyOffset(23, 150);

/** A built building with a crew whose key has masters. */
function keyed(b: Building): string | undefined {
  if (b.stage !== 'built' || !b.rt) return undefined;
  const key = masteryKey(b);
  return content.masterByOf.has(key) ? key : undefined;
}

/** True while the resident serves under a master in this trade. */
function underMaster(r: Resident, key: string, today: number): boolean {
  const a = r.apprentice;
  return !!a && !!a.master && a.untilDay > today && a.trade === key;
}

/** (a) One day worked, for every hand of every building at work (not paused, not out of season). */
function countDays(state: WorldState, today: number): void {
  for (const b of state.buildings) {
    const key = keyed(b);
    if (key === undefined || b.rt!.paused || outOfSeason(state, b)) continue;
    for (const id of b.rt!.workers) {
      const r = findById(state.residents, id);
      if (!r || r.flags & ResidentFlags.leaving) continue;
      addCraft(r, key, underMaster(r, key, today) ? MASTERY.apprenticeWeight : 1);
      const a = r.apprentice;
      if (a?.master && a.untilDay <= today && a.trade === key && !isMaster(r))
        a.ownDays = (a.ownDays ?? 0) + 1;
    }
  }
}

/**
 * (b) Story characters are masters by their arcs: once the arc is done (its finale given,
 * `StoryState.step` past the last step), the town calls them what they always were.
 */
function storyMasters(state: WorldState, ctx: TickCtx): void {
  for (const s of state.stories) {
    if (!s.residentId) continue;
    const arc = content.storyById.get(s.arc);
    const key = arc?.mastery;
    if (!key || s.step < arc.steps.length) continue;
    const r = findById(state.residents, s.residentId);
    if (r && !isMaster(r)) makeMaster(state, ctx, r, key, true);
  }
}

/** Can this worker become a master of the trade today: the rule, or the apprentice path. */
function qualifies(r: Resident, key: string, today: number): boolean {
  if (r.stage !== 'young' && r.stage !== 'adult') return false;
  if (isMaster(r) || r.retired || r.flags & (ResidentFlags.story | ResidentFlags.leaving)) return false;
  if (r.bond >= MASTERY.hearts && craftDays(r, key) >= MASTERY.days) return true;
  const a = r.apprentice;
  return !!a?.master && a.trade === key && a.untilDay <= today && (a.ownDays ?? 0) >= MASTERY.apprenticeDays;
}

/** (c) At most one new master a trade a season: the candidate with the most days, then the lowest id. */
function newMasters(state: WorldState, ctx: TickCtx, today: number): void {
  const season = absoluteSeason(state);
  const best = new Map<string, Resident>();
  for (const b of state.buildings) {
    const key = keyed(b);
    if (key === undefined || (b.trade && levelOf(b) < MASTERY.level)) continue;
    for (const id of b.rt!.workers) {
      const r = findById(state.residents, id);
      if (!r || !qualifies(r, key, today)) continue;
      const cur = best.get(key);
      const d = craftDays(r, key);
      const cd = cur ? craftDays(cur, key) : -1;
      if (!cur || d > cd || (d === cd && r.id < cur.id)) best.set(key, r);
    }
  }
  for (const m of content.masters) {
    const r = best.get(m.of);
    if (r && lastMadeIn(state, m.of) !== season) makeMaster(state, ctx, r, m.of, false);
  }
}

/** (d) The sign over each door follows the crew. */
function settleSigns(state: WorldState, ctx: TickCtx): void {
  for (const b of state.buildings) if (keyed(b) !== undefined) settleMasterId(state, ctx, b);
}

export const masters: System = {
  id: 'masters',
  order: 87,
  every: TICKS_PER_DAY,
  offset: MASTERS_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const today = dayIndex(state.tick);
    countDays(state, today);
    storyMasters(state, ctx);
    newMasters(state, ctx, today);
    settleSigns(state, ctx);
  },
};
