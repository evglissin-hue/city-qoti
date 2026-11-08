// Playtest round six: for each wish voiced, what it still wants in plain words ("2 of 3 flowers
// within three steps of the home"; "the walk to work crosses 5 tiles of grass"), for the Wishes
// book. It reads the same conditions the wish is granted by.
import { content, type Condition, type Target } from '@qoti/content';
import { MAP_SIZE } from '../../../constants';
import type { WishProgressView, WorldState } from '../../../contracts';
import { charmAt, countNear, placeRect, placeBuildingId, type Binding } from '../../../conditions';
import { decorInRect, decorTileX, decorTileZ, expandRect } from '../../../conditions/geo';
import { findRoute } from '../../../conditions/route';
import { doorTileOf } from '../../movement/api';
import { wishBinding } from './index';

const S = MAP_SIZE;

function word(t: Target, n: number): string {
  const plural = n !== 1;
  if ('tag' in t)
    return (
      { flower: plural ? 'flowers' : 'flower', bench: plural ? 'benches' : 'bench', herb: 'herb planter' }[
        t.tag
      ] ?? t.tag
    );
  if ('decor' in t) return (content.decorById.get(t.decor)?.name ?? t.decor).toLowerCase();
  if ('building' in t) return (content.buildingById.get(t.building)?.name ?? t.building).toLowerCase();
  if ('buildingTag' in t) return t.buildingTag;
  if ('buildingCategory' in t) return t.buildingCategory;
  if ('tree' in t) return plural ? 'trees' : 'tree';
  if ('water' in t) return 'water';
  if ('road' in t) return 'road';
  return plural ? 'neighbors' : 'neighbor';
}

/** "1 of 3 flowers within 3 steps of the home". */
function nearText(
  state: WorldState,
  cond: Extract<Condition, { near: unknown }>,
  bind: Binding,
): string | null {
  const n = cond.near;
  const place = placeRect(state, n.of, bind);
  if (!place) return null;
  const need = n.atLeast ?? 1;
  const have = countNear(
    state,
    n,
    place,
    n.within,
    need,
    n.excludeSelf ? placeBuildingId(n.of, bind) : 0,
    n.also,
  );
  if (have >= need) return null;
  const where = n.of === 'home' ? 'the home' : n.of === 'work' ? 'work' : 'there';
  const also = n.also ? ` (each within ${n.also.within} steps of ${word(n.also.target, 1)})` : '';
  return need === 1
    ? `a ${word(n, 1)} within ${n.within} steps of ${where}${also}`
    : `${have} of ${need} ${word(n, need)} within ${n.within} steps of ${where}${also}`;
}

function routeText(
  state: WorldState,
  code: string,
  bind: Binding,
  params: readonly [string, number][],
): string | null {
  if (!bind.home || !bind.work) return null;
  const from = doorTileOf(state, bind.work);
  const to = doorTileOf(state, bind.home);
  const walk = from >= 0 && to >= 0 ? findRoute(state, from, to, false) : null;
  if (!walk) return 'a way to walk from the door at work to the door at home';
  if (code === 'pathRoute') {
    const grass = walk.filter((i) => !state.map.road[i]).length;
    return grass > 0
      ? `a path all the way from the door at work to the door at home (the walk crosses ${grass} ${grass === 1 ? 'tile' : 'tiles'} of grass)`
      : null;
  }
  // lanternRoute: lanterns light a share of the walk home.
  let x0 = S;
  let z0 = S;
  let x1 = -1;
  let z1 = -1;
  for (const i of walk) {
    const x = i % S;
    const z = (i - x) / S;
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  const lit = new Set<number>();
  for (const d of decorInRect(state, expandRect([x0, z0, x1, z1], 1))) {
    if (!content.decorById.get(d.def)?.tags.includes('lantern')) continue;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) lit.add((decorTileZ(d) + dz) * S + decorTileX(d) + dx);
  }
  const share = Math.round((walk.filter((i) => lit.has(i)).length * 100) / walk.length);
  const want = params.find(([k]) => k === 'share')?.[1] ?? 50;
  return share < want ? `lanterns along ${want}% of the walk home from work (${share}% lit now)` : null;
}

function explain(state: WorldState, cond: Condition, bind: Binding): string | null {
  if ('near' in cond) return nearText(state, cond, bind);
  if ('any' in cond) {
    const parts = cond.any.map((c) => explain(state, c, bind));
    return parts.some((p) => p === null) ? null : parts.filter(Boolean).join(', or ');
  }
  if ('all' in cond) {
    const parts = cond.all.map((c) => explain(state, c, bind)).filter((p): p is string => !!p);
    return parts.length ? parts.join('; and ') : null;
  }
  if ('code' in cond && (cond.code === 'pathRoute' || cond.code === 'lanternRoute'))
    return routeText(state, cond.code, bind, cond.params ?? []);
  if ('charm' in cond && cond.charm.atMost !== undefined) {
    const place = placeRect(state, cond.charm.of, bind);
    if (!place) return null;
    const v = charmAt(state, place, cond.charm.layer, cond.charm.radius ?? 0);
    return v > cond.charm.atMost
      ? `less ${cond.charm.layer} at the home (${v} now, ${cond.charm.atMost} or less)`
      : null;
  }
  return null;
}

/** What each voiced wish still wants, where the conditions can say it. */
export function wishProgress(state: WorldState): WishProgressView[] {
  const out: WishProgressView[] = [];
  for (const w of state.wishes) {
    const t = content.wishById.get(w.template);
    if (!t) continue;
    const wants = explain(state, t.target, wishBinding(w));
    if (wants) out.push({ id: w.id, wants });
  }
  return out;
}
