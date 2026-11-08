// Renown API (C5.0 contract; C5B owns renown). docs/spec/15-progression.md, Renown. Every source
// (festivals, repelled raids and send-offs from C5D, patterns, story finales through Reward.renown,
// commissions, the sealed Charter's trial) calls addRenown, which keeps the log, moves the level
// and tells both seats. A new level writes a Chronicle line.
//
// Effects by level (content.renown `effects`): `trade` percent better prices at the Trading Post
// and the River Dock, `arrivals` permille more pull for newcomers, `visitors` notable visitors'
// commissions that may be open at once (systems/commissions).
import { content } from '@qoti/content';
import { RENOWN_LOG_MAX } from '../../constants';
import type { TickCtx, WorldState } from '../../contracts';
import { renownView } from '../../view/seasons';
import { chronicle } from '../chronicle/api';

/** Points a newly discovered pattern brings. */
export const PATTERN_RENOWN = 2;

/** The renown level `points` earns (content.renown thresholds). */
export function levelFor(points: number): number {
  let level = 0;
  for (const r of content.renown) if (points >= r.points) level = r.level;
  return level;
}

/** Adds renown points from `source` ('festival', 'raid', 'pattern', 'story', 'send-off', 'commission', 'trial'). */
export function addRenown(state: WorldState, ctx: TickCtx | null, points: number, source: string): void {
  if (points === 0) return;
  const r = state.renown;
  const before = r.level;
  r.points = Math.max(0, r.points + points);
  r.level = levelFor(r.points);
  r.log.push({ tick: state.tick, source, points });
  if (r.log.length > RENOWN_LOG_MAX) r.log.splice(0, r.log.length - RENOWN_LOG_MAX);
  if (!ctx) return;
  ctx.events.push({ e: 'renown.updated', r: renownView(state) });
  if (r.level > before) {
    const name = content.renown[r.level]?.name ?? '';
    chronicle(state, ctx, 'renown-level', { text: [['level', name]], seats: [...state.time.connected] });
    ctx.events.push({
      e: 'notify',
      kind: 'letter',
      text: `Word travels: ${state.settings.townName} is ${name} now. Neighbors pay a little more, ask a little less, and visitors have started to call.`,
    });
  }
}

export function renownLevel(state: WorldState): number {
  return state.renown.level;
}

/** The value of a named effect at the town's renown level (0 when the level has none). */
export function renownEffect(state: WorldState, name: string): number {
  const def = content.renown[state.renown.level];
  if (!def) return 0;
  for (const [n, v] of def.effects) if (n === name) return v;
  return 0;
}
