// Making a master (R3B; docs/spec/19-evenings.md, Masters): the flag and the trade, the season's
// mark, what the first master of a kind unlocks, the sign over the door, and the words: a Chronicle
// line, a letter (not for a story character, whose arc writes its own) and a life event.
import { content, masterWords } from '@qoti/content';
import { DAYS_PER_SEASON, ResidentFlags } from '../../constants';
import type { Building, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { buildingView } from '../../view';
import { businessView } from '../../view/businesses';
import { fillText, residentName } from '../../view/hamlet';
import { chronicle } from '../chronicle/api';
import { dayIndex } from '../economy/time';
import { rotation } from '../residents/life';
import { syncResident } from '../residents/records';
import { masterDefOf, masteryKey, masterOf } from './api';

/** The absolute season index (year * 4 + season) of today. */
export function absoluteSeason(state: WorldState): number {
  return Math.floor(dayIndex(state.tick) / DAYS_PER_SEASON);
}

/** The season a trade last made a master in, or -1. */
export function lastMadeIn(state: WorldState, key: string): number {
  for (const [trade, season] of state.masters.lastMade) if (trade === key) return season;
  return -1;
}

function markMade(state: WorldState, key: string, season: number): void {
  const list = state.masters.lastMade;
  let i = 0;
  while (i < list.length && list[i]![0] < key) i++;
  if (i < list.length && list[i]![0] === key) list[i]![1] = season;
  else list.splice(i, 0, [key, season]);
}

/** Where a trade or specialized building works, in words: "the baker's workshop", "the quarry". */
export function placeWords(key: string): string {
  const trade = content.tradeById.get(key);
  if (trade) {
    const name = trade.name.toLowerCase();
    if (trade.building === 'workshop') return `the ${name}'s workshop`;
    return `the ${name}`;
  }
  const def = content.buildingById.get(key);
  return def ? `the ${def.name.toLowerCase()}` : 'the valley';
}

/** The building a resident works at, when it is of this key. */
function workplaceOf(state: WorldState, r: Resident, key: string): Building | undefined {
  const b = r.jobId ? findById(state.buildings, r.jobId) : undefined;
  return b && b.stage === 'built' && masteryKey(b) === key ? b : undefined;
}

/** Sets `Building.masterId` to what the crew says it is, sending the events on a change. */
export function settleMasterId(state: WorldState, ctx: TickCtx, b: Building): void {
  const m = masterOf(state, b);
  if (m === (b.masterId ?? 0)) return;
  if (m) b.masterId = m;
  else delete b.masterId;
  ctx.events.push({ e: 'building.updated', b: buildingView(b) });
  if (b.trade) ctx.events.push({ e: 'business.updated', b: businessView(state, b) });
}

/**
 * Makes `r` a master of `key`. A story character counts for Master of the House (`masters.made`)
 * but not against the trade's one new master a season (`lastMade`).
 */
export function makeMaster(state: WorldState, ctx: TickCtx, r: Resident, key: string, story: boolean): void {
  const n = state.masters.made;
  r.flags |= ResidentFlags.master;
  r.mastery = key;
  state.masters.made += 1;
  if (!story) markMade(state, key, absoluteSeason(state));
  const def = masterDefOf(key);
  for (const u of def?.unlocks ?? []) if (!state.hearth.unlocked.includes(u)) state.hearth.unlocked.push(u);
  const at = workplaceOf(state, r, key);
  if (at && !at.masterId) settleMasterId(state, ctx, at);
  const params: [string, string][] = [
    ['name', residentName(r)],
    ['title', def?.title ?? 'master'],
    ['place', placeWords(key)],
  ];
  // A story character's arc made them a master: their line says so, not years of habit.
  const kind = story ? 'master-story' : 'master-made';
  const count = content.chronicleByKind.get(kind)?.text.length ?? 1;
  chronicle(state, ctx, kind, {
    text: params,
    refs: at ? [r.id, at.id] : [r.id],
    variant: rotation(state, n, count),
  });
  const filled = (list: readonly string[]): string =>
    fillText(list[rotation(state, n, list.length)] ?? '', [...params, ['town', state.settings.townName]]);
  if (!story) ctx.events.push({ e: 'notify', kind: 'letter', text: filled(masterWords.letter) });
  ctx.events.push({ e: 'life.event', kind: 'master', residents: [r.id], text: filled(masterWords.made) });
  syncResident(state, ctx, r);
}
