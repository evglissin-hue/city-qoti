// The festival twists' goals (C5B), as named code predicates for the Condition DSL (registered in
// conditions/code.ts). Each reads this season's plan; with no plan they are false. Kept free of the
// festival API's imports so the predicate registry can load first.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { FestivalPlan, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { decorOnSite, siteRect } from './site';

function param(params: readonly [string, number][], name: string, fallback: number): number {
  for (const [k, v] of params) if (k === name) return v;
  return fallback;
}

function planNow(state: WorldState): FestivalPlan | null {
  const p = state.festival.plan;
  if (!p) return null;
  const { season, year } = seasonAt(state.tick);
  return p.season === season && p.year === year ? p : null;
}

/** At least `atLeast` units of the good `ref` put by for the menu. */
export function festivalMenu(
  state: WorldState,
  _bind: unknown,
  params: readonly [string, number][],
  ref?: string,
): boolean {
  const p = planNow(state);
  const g = ref === undefined ? undefined : content.goodIndex.get(ref);
  if (!p || g === undefined) return false;
  return (p.reserved.find(([x]) => x === g)?.[1] ?? 0) >= param(params, 'atLeast', 1);
}

/** At least `atLeast` decor pieces tagged `ref` on the festival site. */
export function festivalPieces(
  state: WorldState,
  _bind: unknown,
  params: readonly [string, number][],
  ref?: string,
): boolean {
  const p = planNow(state);
  const r = p ? siteRect(state, p.site) : null;
  if (!r || !ref) return false;
  let n = 0;
  for (const d of decorOnSite(state, r)) if (content.decorById.get(d.def)?.tags.includes(ref)) n++;
  return n >= param(params, 'atLeast', 1);
}

/** The festival site lies within `within` tiles of open (unfrozen) water. */
export function festivalByWater(
  state: WorldState,
  _bind: unknown,
  params: readonly [string, number][],
): boolean {
  const p = planNow(state);
  const r = p ? siteRect(state, p.site) : null;
  if (!r || state.weather.river.frozen) return false;
  const n = param(params, 'within', 6);
  const S = MAP_SIZE;
  for (let z = Math.max(0, r[1] - n); z <= Math.min(S - 1, r[3] + n); z++) {
    for (let x = Math.max(0, r[0] - n); x <= Math.min(S - 1, r[2] + n); x++) {
      if (state.map.water[z * S + x]) return true;
    }
  }
  return false;
}

/** The river is frozen (snow lies, sculptors are happy). */
export function riverFrozen(state: WorldState): boolean {
  return state.weather.river.frozen;
}
