// Trials (C5A; docs/spec/15-progression.md, Ranks and Charters). Daily at 00:08 the trial machinery
// moves the Charter's trial through its life: upcoming (announced, with an evening or a season to
// prepare), running (through its season, measuring), then judged the first day after: passed seals
// the Charter (a County letter, a Chronicle page, renown through addRenown), failed returns the next
// time its season comes round and costs nothing else. As decided for I3 (i3-wave-notes.md), the
// claim still grants the rank; the trial that follows seals it.
//
// Kinds are a table (TRIAL_KINDS): the season a kind runs in, what it measures each day, and how it
// is judged. I3 writes `winter` (the first winter after the claim: everyone warm and the larder
// never empty); I4's raid and I5's flood add rows here, without new contracts.
import { content } from '@qoti/content';
import { DAYS_PER_SEASON, TICKS_PER_DAY } from '../../constants';
import type { SeasonIndex, System, TickCtx, TrialState, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { trialView } from '../../view/seasons';
import { chronicle } from '../chronicle/api';
import { dailyOffset } from '../economy/time';
import { addRenown } from '../renown/api';
import { seasonNow } from '../seasons/api';
import { larder } from '../seasons/stores';

export { larder };

/** Renown a weathered trial brings. */
export const TRIAL_RENOWN = 3;

export interface TrialKind {
  /** Season it runs through. */
  season: SeasonIndex;
  /** Today's measures as [name, value]; `prev` holds yesterday's (for running minimums). */
  measure: (state: WorldState, prev: readonly [string, number][]) => [string, number][];
  /** True when weathered, from the last measures. */
  passed: (measured: readonly [string, number][]) => boolean;
}

function value(m: readonly [string, number][], name: string, fallback: number): number {
  return m.find(([k]) => k === name)?.[1] ?? fallback;
}

// prettier-ignore
export const TRIAL_KINDS: ReadonlyMap<TrialState['kind'], TrialKind> = new Map<TrialState['kind'], TrialKind>([
  ['winter', {
    season: 3,
    measure: (state, prev) => {
      const food = larder(state);
      return [
        ['coldHouseholds', state.warmth.coldHouseholds.length],
        ['coldHouseholdDays', state.warmth.coldHouseholdDays],
        ['larderLow', Math.min(food, value(prev, 'larderLow', food))],
        ['larder', food],
      ];
    },
    passed: (m) => value(m, 'coldHouseholds', 0) === 0 && value(m, 'larderLow', 1) > 0,
  }],
]);

/** 00:08 */
export const TRIALS_OFFSET = dailyOffset(0, 8);

export const trials: System = {
  id: 'trials',
  order: 95,
  every: TICKS_PER_DAY,
  offset: TRIALS_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    stepTrial(state, ctx);
  },
};

/** The Charter whose rank the valley holds now, when it has a trial to seal. */
function claimedCharter(state: WorldState): { id: string; kind: TrialState['kind'] } | null {
  for (const c of content.charters) {
    if (c.rank === state.charter.rank && c.trial) return { id: c.id, kind: c.trial.kind };
  }
  return null;
}

/** Absolute season number (year * 4 + season). */
function seasonNumber(year: number, season: number): number {
  return year * 4 + season;
}

/** The next time `season` comes round after the current one (this year or next). */
function nextSeason(state: WorldState, season: number): { season: SeasonIndex; year: number } {
  const now = seasonNow(state);
  const year = season > now.season ? now.year : now.year + 1;
  return { season: season as SeasonIndex, year };
}

/** Opens (or re-opens) a trial for the next time its season comes round. */
export function openTrial(
  state: WorldState,
  ctx: TickCtx | null,
  charter: string,
  kind: TrialState['kind'],
): void {
  const k = TRIAL_KINDS.get(kind);
  if (!k) return;
  const when = nextSeason(state, k.season);
  state.trial = { kind, charter, season: when.season, year: when.year, status: 'upcoming', measured: [] };
  ctx?.events.push({ e: 'trial.updated', t: trialView(state)! });
  const def = content.charterById.get(charter)?.trial;
  if (def && ctx) ctx.events.push({ e: 'notify', kind: 'letter', text: `${def.name}: ${def.blurb}` });
}

/** One day of the trial machinery. */
export function stepTrial(state: WorldState, ctx: TickCtx): void {
  const claimed = claimedCharter(state);
  const t = state.trial;
  const now = seasonNow(state);
  const today = seasonNumber(now.year, now.season);
  if (claimed && (!t || t.charter !== claimed.id)) {
    openTrial(state, ctx, claimed.id, claimed.kind);
    return;
  }
  if (!t) return;
  const k = TRIAL_KINDS.get(t.kind);
  if (!k) return;
  const at = seasonNumber(t.year, t.season);
  if (t.status === 'failed' && today > at) {
    // A failed trial returns the next time its season comes round.
    openTrial(state, ctx, t.charter, t.kind);
    return;
  }
  if (t.status === 'upcoming' && today === at) {
    t.status = 'running';
    t.measured = k.measure(state, []);
    ctx.events.push({ e: 'trial.updated', t: trialView(state)! });
    return;
  }
  if (t.status === 'running' && today === at) {
    t.measured = k.measure(state, t.measured);
    ctx.events.push({ e: 'trial.updated', t: trialView(state)! });
    return;
  }
  if (t.status === 'running' && today > at) {
    // The last day's burning and eating count too.
    t.measured = k.measure(state, t.measured);
    judge(state, ctx, t, k);
  }
  // An upcoming trial whose season slipped by (a valley loaded late) waits for the next one.
  if (t.status === 'upcoming' && today > at) openTrial(state, ctx, t.charter, t.kind);
}

function judge(state: WorldState, ctx: TickCtx, t: TrialState, k: TrialKind): void {
  const def = content.charterById.get(t.charter);
  const name = def?.trial?.name ?? 'The trial';
  const charterName = def ? def.rank.charAt(0).toUpperCase() + def.rank.slice(1) : '';
  if (k.passed(t.measured)) {
    t.status = 'passed';
    chronicle(state, ctx, 'trial-passed', {
      text: [
        ['trial', name],
        ['charter', charterName],
      ],
      seats: [...state.time.connected],
    });
    addRenown(state, ctx, TRIAL_RENOWN, 'trial');
    ctx.events.push({
      e: 'notify',
      kind: 'letter',
      text: `The County Clerk writes: ${name} is weathered, and the ${charterName} Charter is sealed. A plaque is on its way.`,
    });
  } else {
    t.status = 'failed';
    chronicle(state, ctx, 'trial-failed', { text: [['trial', name]] });
    ctx.events.push({
      e: 'notify',
      kind: 'letter',
      text: `The County Clerk writes: ${name} was a hard one. The Charter keeps; try again when the season comes round.`,
    });
  }
  ctx.events.push({ e: 'trial.updated', t: trialView(state)! });
}

/** Days until the trial's season begins (0 while it runs), for the season card. */
export function daysToTrial(state: WorldState): number | null {
  const t = state.trial;
  if (!t || t.status !== 'upcoming') return null;
  const start = seasonNumber(t.year, t.season) * DAYS_PER_SEASON;
  const now =
    seasonNumber(seasonNow(state).year, seasonNow(state).season) * DAYS_PER_SEASON + seasonNow(state).day - 1;
  return Math.max(0, start - now);
}
