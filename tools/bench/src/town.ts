// Small readings of the town the planner, the advisors and the day lines share (C5.0: gathered
// from the I1 and I2 players, unchanged).
import { content } from '@qoti/content';
import { evaluate, MAP_SIZE, type WorldState } from '@qoti/sim';

export const FOODS = content.goods.flatMap((g, i) => (g.food ? [i] : []));
export const G = (id: string) => content.goodIndex.get(id)!;
export const S = MAP_SIZE;
export const idx = (x: number, z: number) => z * S + x;

/** Buildings of a def, standing or going up (only standing with `built`). */
export function count(w: WorldState, def: string, built = false): number {
  return w.buildings.filter((b) => b.def === def && (!built || b.stage === 'built')).length;
}

/** Construction sites under way: the build queue. */
export function sites(w: WorldState): number {
  return w.buildings.filter((b) => b.stage === 'construction').length;
}

export function vacantHomes(w: WorldState): number {
  const homes = w.buildings.filter((b) => content.buildingById.get(b.def)?.housing && b.stage === 'built');
  return homes.filter((b) => !w.households.some((h) => h.homeId === b.id)).length;
}

export function craftsfolk(w: WorldState): number {
  return w.residents.filter((r) => r.tier === 'craftsfolk').length;
}

/** Ids of the Charter goals still open. */
export function charterOpen(w: WorldState): string[] {
  const goals = content.charterById.get(w.charter.charter)?.goals ?? [];
  return goals.filter((g, i) => (w.charter.progress[i] ?? 0) < g.target).map((g) => g.id);
}

/** "3/5 food": goals met, and the first one still open. */
export function charterLine(w: WorldState): string {
  const goals = content.charterById.get(w.charter.charter)?.goals ?? [];
  const open = charterOpen(w);
  return `${goals.length - open.length}/${goals.length}${open[0] ? ` ${open[0]}` : ''}`;
}

/** A story character whose arrival condition holds is waiting for a home. */
export function storyWaiting(w: WorldState): boolean {
  return w.stories.some((s) => {
    const arc = content.storyById.get(s.arc);
    return !!arc && s.residentId === 0 && evaluate(w, arc.arrival, {});
  });
}

/** Story letters sent so far (arrivals and steps, across arcs). */
export function storyLetters(w: WorldState): number {
  let n = 0;
  for (const s of w.stories) if (s.residentId) n += s.step + 2;
  return n;
}
