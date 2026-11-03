// How a festival scores (C5B; docs/spec/12-hearth.md, Festivals). Five joy parts, each 0 to 100,
// weighed by content (festivalTuning.weights): the site (its charm, a pattern site's bonus), the
// variety of festival pieces on it, the menu (variety, and sufficiency per guest), the music and
// the twist (its goal held). The score is joy x turnout (guests out of residents in reach, with
// weather and mood already in who came), and stars come from the score's thresholds. Pure.
import { content } from '@qoti/content';
import type { FestivalOutcome, FestivalPlan, Rect, WorldState } from '../../contracts';
import { evaluate } from '../../conditions';
import { festivalTuningNow, hasBandstand } from './api';
import { patternSiteOf, pieceVariety, siteCharm } from './site';

const clamp100 = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

export function sitePart(state: WorldState, plan: FestivalPlan, rect: Rect): number {
  const t = festivalTuningNow();
  const base = (siteCharm(state, rect) * 100) / Math.max(1, t.siteCharm);
  const pattern = plan.site && 'pattern' in plan.site ? t.patternBonus : 0;
  return clamp100(base + pattern);
}

export function varietyPart(state: WorldState, rect: Rect): number {
  return clamp100((pieceVariety(state, rect) * 100) / Math.max(1, festivalTuningNow().varietyFull));
}

/** Half variety (distinct goods put by), half sufficiency (units put by a guest). */
export function menuPart(plan: FestivalPlan, guests: number): number {
  const t = festivalTuningNow();
  let kinds = 0;
  let units = 0;
  for (const [, q] of plan.reserved) {
    if (q > 0) kinds++;
    units += q;
  }
  const variety = Math.min(1, kinds / Math.max(1, t.menuGoods));
  const enough = guests > 0 ? Math.min(1, units / (guests * t.perGuest)) : kinds > 0 ? 1 : 0;
  return clamp100(50 * variety + 50 * enough);
}

export function musicPart(state: WorldState, plan: FestivalPlan): number {
  const m = festivalTuningNow().music;
  const player =
    plan.music !== 'none' && plan.musician > 0 && state.residents.some((r) => r.id === plan.musician);
  const band = plan.music === 'bandstand' && hasBandstand(state);
  if (player && band) return m.both;
  if (band) return m.bandstand;
  if (player) {
    // Juniper Reed with her festival music plays the full part; anyone else does their best.
    const juniper = state.stories.find((s) => s.arc === 'musician')?.residentId === plan.musician;
    return juniper && state.hearth.unlocked.includes('festival-music')
      ? m.resident
      : Math.round(m.resident / 2);
  }
  return m.none;
}

export function twistPart(state: WorldState, plan: FestivalPlan): number {
  const def = plan.twist ? content.twistById.get(plan.twist) : undefined;
  if (!def?.goal) return 0;
  return evaluate(state, def.goal) ? festivalTuningNow().twist : 0;
}

/** Joy from its parts, 0 to 100, by the content weights. */
export function joyOf(j: FestivalOutcome['joy']): number {
  const w = festivalTuningNow().weights;
  const total = w.site + w.variety + w.menu + w.music + w.twist;
  const sum =
    j.site * w.site + j.variety * w.variety + j.menu * w.menu + j.music * w.music + j.twist * w.twist;
  return total > 0 ? sum / total : 0;
}

/** Stars (1 to 5) for a score. */
export function starsFor(score: number): number {
  let stars = 1;
  for (const s of festivalTuningNow().stars) if (score >= s) stars++;
  return stars;
}

/** The whole outcome: joy parts, turnout, score and stars. */
export function scoreFestival(
  state: WorldState,
  plan: FestivalPlan,
  rect: Rect,
  guests: number,
  invited: number,
): FestivalOutcome {
  const t = festivalTuningNow();
  const joy = {
    site: sitePart(state, plan, rect),
    variety: varietyPart(state, rect),
    menu: menuPart(plan, guests),
    music: musicPart(state, plan),
    twist: twistPart(state, plan),
  };
  const turnout = invited > 0 ? Math.min(1, guests / invited) : 0;
  const factor = (t.turnoutFloor + (1000 - t.turnoutFloor) * turnout) / 1000;
  const score = clamp100(joyOf(joy) * factor);
  return { attendance: guests, joy, stars: starsFor(score), invited, score };
}

/** For the result card: whether a pattern site still stands for the plan. */
export function siteStands(state: WorldState, plan: FestivalPlan): boolean {
  return !plan.site || 'rect' in plan.site || !!patternSiteOf(state, plan.site.pattern, plan.site.anchor);
}
