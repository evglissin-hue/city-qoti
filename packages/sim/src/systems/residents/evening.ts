// A resident's evening and the evenings need (docs/spec/19-evenings.md, Good evenings). R2B owns the
// score and the need; R2A fills `Resident.round` with what happened at each stop.
import { content } from '@qoti/content';
import { RoundFlags } from '../../constants';
import type { EveningWeather, Resident, RoundStop, TickCtx, WorldState } from '../../contracts';
import { eveningsNeed, EVENINGS_NEED } from '../../state/evenings';
import { calendar } from '../clock/calendar';
import { addBond } from './api';
import { dayIndex } from './time';

/** The stops a resident got to today (arrived today, not turned away). */
function arrivedToday(state: WorldState, r: Resident): RoundStop[] {
  const today = dayIndex(state.tick);
  const out: RoundStop[] = [];
  for (const s of r.round ?? []) {
    if (!(s.flags & RoundFlags.arrived) || s.flags & RoundFlags.turnedAway) continue;
    if (s.arrived < 0 || dayIndex(s.arrived) !== today) continue;
    out.push(s);
  }
  return out;
}

/**
 * The score of the resident's evening now, 0 to 100: the draw of their best stop as found, plus a
 * friend met there, a treat, a second kind of stop, less standing; staying in scores
 * `PLACES.stayInScore`, which is also every evening's floor.
 */
export function eveningScore(state: WorldState, r: Resident): number {
  const P = content.places;
  const today = dayIndex(state.tick);
  const stops = arrivedToday(state, r);
  let score = P.stayInScore;
  if (stops.length > 0) {
    let best = -Infinity;
    for (const s of stops) {
      const v =
        s.draw +
        (s.flags & RoundFlags.friend && s.kind !== 'visit' ? P.friendScore : 0) -
        (s.flags & RoundFlags.standing ? P.standingPenalty : 0);
      if (v > best) best = v;
    }
    score = best;
  }
  // A treat bought passing sits on a stop they have not reached yet: it counts when they got
  // somewhere tonight on tonight's plan (R2X: `roundDay`, so a plan left over from an evening they
  // skipped never scores a treat).
  for (const s of r.roundDay === today ? (r.round ?? []) : []) {
    if (!(s.flags & RoundFlags.treat)) continue;
    if (s.arrived >= 0 ? dayIndex(s.arrived) !== today : stops.length === 0) continue;
    score += P.treatScore;
    break;
  }
  const kinds = new Set<string>();
  for (const s of stops) if (s.kind !== 'shop') kinds.add(s.kind);
  if (kinds.size >= 2) score += P.secondKindScore;
  return Math.max(P.stayInScore, Math.min(100, score));
}

function eveningWeather(state: WorldState): EveningWeather {
  const w = state.weather.today;
  return w === 'storm' ? 'storm' : w === 'rain' ? 'rain' : 'fair';
}

/**
 * 21:00, as folk set off home: scores each grown-up's evening (eveningScore), moves the evenings
 * need a third of the way to it, keeps `Resident.evening` (this season's good evenings and the bond
 * heart) and adds the scores to `state.evenings.tonight`. An evening lost to weather does not count.
 */
export function closeEvening(state: WorldState, _ctx: TickCtx): void {
  const P = content.places;
  const today = dayIndex(state.tick);
  const tonight = state.evenings.tonight;
  const counted = tonight.day === today;
  const weather = eveningWeather(state);
  if (counted) tonight.weather = weather;
  if (weather === 'storm') return;
  const cal = calendar(state.tick);
  const season = cal.year * 4 + cal.season;
  for (const r of state.residents) {
    // Every grown-up's evening counts, elders' too (their afternoon round's best stop, or the floor
    // for staying in): an elder left unscored kept a newcomer's 50 and passed the tiers' evenings.
    if (r.stage === 'child') continue;
    const score = eveningScore(state, r);
    const need = eveningsNeed(r);
    r.needs[EVENINGS_NEED] = Math.max(0, Math.min(100, need + Math.round((score - need) / P.needStepOneIn)));
    let ev = r.evening;
    if (!ev || ev.season !== season) ev = { score, day: today, good: 0, season };
    if (score >= P.goodEvening) ev.good++;
    if (ev.good >= P.goodForHeart && !ev.heart) {
      if (r.bond < P.heartsMax) addBond(state, r.id, 1, 'other');
      ev.heart = true;
    }
    ev.score = score;
    ev.day = today;
    r.evening = ev;
    if (counted) tonight.scoreSum += score;
  }
}
