// The date, the time and the weather: its own component, so only it re-renders each tick.
import { calendar, SEASON_NAMES } from '@qoti/sim';
import type { Session } from '../../app/session';
import { formatTime } from '../format';
import { Glyph } from '../icons';
import { WeatherChip } from '../SeasonChips';

const SEASON_ICON = ['spring', 'summer', 'autumn', 'winter'] as const;

export function Clock({ session }: { session: Session }) {
  const tick = session.mirror.tick.value;
  const cal = calendar(tick);
  return (
    <div class="topbar-clock" data-testid="clock">
      <span
        class={`date-chip season-${cal.season}`}
        data-testid="season"
        title={`Year ${cal.year}, ${SEASON_NAMES[cal.season]}, day ${cal.day}`}
      >
        <Glyph id={SEASON_ICON[cal.season]!} />
        <span class="date-season">{SEASON_NAMES[cal.season]}, </span>
        day {cal.day}
      </span>
      <span class="clock-time">{formatTime(tick)}</span>
      <WeatherChip session={session} />
    </div>
  );
}
