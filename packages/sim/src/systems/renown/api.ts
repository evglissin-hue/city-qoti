// Renown API (C5.0 contract; C5B owns renown). docs/spec/15-progression.md, Renown. Every source
// (festivals, repelled raids and send-offs from C5D, patterns, story finales through Reward.renown,
// commissions) calls addRenown, which keeps the log, moves the level and tells both seats.
import { content } from '@qoti/content';
import { RENOWN_LOG_MAX } from '../../constants';
import type { TickCtx, WorldState } from '../../contracts';
import { renownView } from '../../view/seasons';

/** The renown level `points` earns (content.renown thresholds). */
export function levelFor(points: number): number {
  let level = 0;
  for (const r of content.renown) if (points >= r.points) level = r.level;
  return level;
}

/** Adds renown points from `source` ('festival', 'raid', 'pattern', 'story', 'send-off', 'commission'). */
export function addRenown(state: WorldState, ctx: TickCtx | null, points: number, source: string): void {
  if (points === 0) return;
  const r = state.renown;
  r.points = Math.max(0, r.points + points);
  r.level = levelFor(r.points);
  r.log.push({ tick: state.tick, source, points });
  if (r.log.length > RENOWN_LOG_MAX) r.log.splice(0, r.log.length - RENOWN_LOG_MAX);
  ctx?.events.push({ e: 'renown.updated', r: renownView(state) });
}

export function renownLevel(state: WorldState): number {
  return state.renown.level;
}
