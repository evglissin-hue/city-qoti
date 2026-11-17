// R2D: a resident's day. Today's round as a short line of stops, the evenings need and last score
// in words, and the round drawn on the ground (the stops' tiles and a simple Manhattan line from
// home to each stop in order) through the highlight API.
import { MAP_SIZE, RoundFlags, type ResidentDetail, type RoundStopKind } from '@qoti/sim';
import { useEffect } from 'preact/hooks';
import type { Session } from '../../app/session';
import { capital, formatTime } from '../format';
import { Heading } from './parts';
import { tilePairs } from './PlaceCard';

const PURPOSE: Record<RoundStopKind, string> = {
  sit: 'to sit a while',
  eat: 'for a bite',
  view: 'for the view',
  play: 'to play',
  meet: 'to meet folk',
  walk: 'for a stroll',
  shop: 'to shop',
  visit: 'to visit friends',
};

/**
 * What happened at a stop, from its flags. R2X: on a round from an earlier day (`earlier`) a stop
 * they never reached is behind them, not ahead.
 */
export function stopWords(flags: number, arrived: number, earlier = false): string {
  if (flags & RoundFlags.rained) return 'Rain kept them in.';
  if (flags & RoundFlags.turnedAway) return 'Turned away: no room.';
  if (arrived < 0 && !(flags & RoundFlags.arrived))
    return earlier ? 'They never got there.' : 'Still ahead of them.';
  const bits: string[] = [];
  if (flags & RoundFlags.seated) bits.push('seated');
  else if (flags & RoundFlags.standing) bits.push('stood, no seat left');
  else bits.push('got there');
  if (flags & RoundFlags.friend) bits.push('a friend there');
  if (flags & RoundFlags.treat) bits.push('bought a treat');
  return `${capital(bits.join(', '))}.`;
}

/** The evenings need, in a word or three ("Evenings: middling"). */
export function needWords(need: number): string {
  if (need < 20) return 'a long drought';
  if (need < 40) return 'thin';
  if (need < 60) return 'middling';
  if (need < 80) return 'well kept';
  return 'plentiful';
}

/** The last evening's score, in a phrase that follows "Last evening: ". */
export function scoreWords(score: number): string {
  if (score < 30) return 'a dull one';
  if (score < 50) return 'a plain one';
  if (score < 60) return 'a fair one';
  if (score < 80) return 'a good one';
  return 'one to remember';
}

/** An L-shaped line of tiles from a to b, x first, both ends in. */
export function manhattan(a: number, b: number): number[] {
  const out: number[] = [];
  let x = a % MAP_SIZE;
  let z = Math.floor(a / MAP_SIZE);
  const tx = b % MAP_SIZE;
  const tz = Math.floor(b / MAP_SIZE);
  out.push(z * MAP_SIZE + x);
  while (x !== tx) {
    x += Math.sign(tx - x);
    out.push(z * MAP_SIZE + x);
  }
  while (z !== tz) {
    z += Math.sign(tz - z);
    out.push(z * MAP_SIZE + x);
  }
  return out;
}

/** Every tile the round draws: home to each stop in order, then the stops' own tiles. */
export function roundTiles(home: number | null, stops: readonly { tile: number }[]): number[] {
  const seen = new Set<number>();
  let at = home;
  for (const s of stops) {
    if (at !== null) for (const t of manhattan(at, s.tile)) seen.add(t);
    seen.add(s.tile);
    at = s.tile;
  }
  return [...seen].sort((a, b) => a - b);
}

export function Day({ session, detail }: { session: Session; detail: ResidentDetail }) {
  const round = detail.round;
  const home = session.mirror.buildings.get(detail.r.homeId);
  const homeTile = home ? home.z * MAP_SIZE + home.x : null;
  const key = round && round.length ? `${homeTile}:${round.map((s) => s.tile).join(',')}` : '';
  useEffect(() => {
    if (!key || !round) return;
    session.render?.highlight?.({ tiles: tilePairs(roundTiles(homeTile, round)), tone: 'hearth' });
    return () => session.render?.highlight?.(null);
  }, [key]);
  if (!round) return null;
  const ev = detail.evening;
  // R2X: a round from an earlier day is their last evening, not tonight's (they plan at 17:00,
  // builders and porters at 19:00).
  const earlier = !!detail.roundEarlier;
  return (
    <div class="day" data-testid="resident-day">
      <Heading>{earlier ? 'Their last evening' : 'Their evening'}</Heading>
      {round.length === 0 ? (
        ev && (
          <p class="day-stayed" data-testid="day-stayed">
            Stayed in.
          </p>
        )
      ) : (
        <ol class="stops" data-testid="day-stops">
          {round.map((s, i) => (
            <li key={`${s.place}:${i}`}>
              <span class="stop-time">{s.arrived >= 0 ? formatTime(s.arrived) : earlier ? '' : 'later'}</span>
              <span class="stop-what">
                <b>{capital(s.name)}</b> <span class="muted">{PURPOSE[s.kind] ?? ''}</span>
                <br />
                <span class="stop-flags">{stopWords(s.flags, s.arrived, earlier)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {ev && (
        <p class="day-words" data-testid="day-words">
          Evenings: <b>{needWords(ev.need)}</b>. Last evening: <b>{scoreWords(ev.score)}</b>.
        </p>
      )}
    </div>
  );
}
