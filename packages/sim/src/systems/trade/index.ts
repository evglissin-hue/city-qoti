// The Trading Post (docs/spec/13-ledger.md, Trade). Two passes:
// - 00:20 (`trade`): each neighbor's prices move. Drift is a deterministic random walk of up to 2%
//   a day per good it trades, bounded 0.7x to 1.4x, with a gentle pull home so it wanders rather
//   than sticks at a bound; impact (what the valley's own trading did) recovers 10% a day. The
//   walk's steps come from a hash of the valley seed, the day, the neighbor and the good rather
//   than an RNG stream, so trade never shifts the dice other systems roll.
// - 08:00 (`caravans`, caravans.ts): caravans come home and new ones set off with what the
//   standing orders call for.
// Regional price = base x the neighbor's factor x season x drift x impact (regionalPrice); the
// valley buys at 1.2x and sells at 0.85x of it.
import { content } from '@qoti/content';
import { DRIFT_RANGE, DRIFT_STEP, IMPACT_RECOVERY, TICKS_PER_DAY } from '../../constants';
import type { NeighborState, System, WorldState } from '../../contracts';
import { cyrb128 } from '../../rng/cyrb128';
import { isStandard } from '../../state/hamlet';
import { rankAtLeast } from '../../state/village';
import { tradeView } from '../../view/village';
import { dailyOffset, dayIndex } from '../economy/time';

/** Each day drift moves this share (per mille) of the way back toward 1000. */
export const DRIFT_PULL = 40;

/** A day's drift step for a neighbor and good, -DRIFT_STEP to DRIFT_STEP per mille. */
export function driftStep(seedWord: number, day: number, neighbor: number, good: number): number {
  let h = seedWord ^ Math.imul(day + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) ^ Math.imul(neighbor + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) ^ Math.imul(good + 1, 0x165667b1);
  h = (h ^ (h >>> 15)) >>> 0;
  return (h % (2 * DRIFT_STEP + 1)) - DRIFT_STEP;
}

/** Moves one neighbor's drift and impact by a day. */
export function stepNeighbor(state: WorldState, n: NeighborState, seedWord: number): void {
  const ni = content.neighbors.findIndex((x) => x.id === n.id);
  const def = content.neighbors[ni];
  if (!def) return;
  const day = dayIndex(state.tick);
  const walk = (good: string) => {
    const g = content.goodIndex.get(good);
    if (g === undefined) return;
    const d = n.drift[g] ?? 1000;
    const pull = Math.trunc(((1000 - d) * DRIFT_PULL) / 1000);
    const next = d + driftStep(seedWord, day, ni, g) + pull;
    n.drift[g] = Math.max(DRIFT_RANGE[0], Math.min(DRIFT_RANGE[1], next));
  };
  for (const [good] of def.sells) walk(good);
  for (const [good] of def.buys) walk(good);
  for (let g = 0; g < n.impact.length; g++) {
    const i = n.impact[g]!;
    if (i === 1000) continue;
    let step = Math.round(((1000 - i) * IMPACT_RECOVERY) / 100);
    if (step === 0) step = i < 1000 ? 1 : -1;
    n.impact[g] = i + step;
  }
}

export const trade: System = {
  id: 'trade',
  order: 64,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 20),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const seedWord = cyrb128(`${state.seed}:trade`)[0];
    for (const n of state.trade.neighbors) stepNeighbor(state, n, seedWord);
    if (rankAtLeast(state, 'village')) ctx.events.push({ e: 'trade.updated', t: tradeView(state) });
  },
};
