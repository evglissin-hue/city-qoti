// I3 (C5F): the top bar's season pieces: today's weather with the forecast in its tooltip (a click
// opens this season's card again), and renown as a little ribbon beside the rank pennant.
import type { Session } from '../app/session';
import { WeatherGlyph } from './art';
import { dayName, today, WEATHER_WORD } from './seasons';

export function WeatherChip({ session }: { session: Session }) {
  const m = session.mirror;
  const w = m.weather.value;
  if (!w) return null;
  const now = today(m.tick.value);
  const ahead = w.forecast
    .map(([d, k]) => `${d - now === 1 ? 'Tomorrow' : dayName(d)}: ${WEATHER_WORD[k].word.toLowerCase()}`)
    .join('. ');
  const title = `${WEATHER_WORD[w.today].word}. ${WEATHER_WORD[w.today].line}${ahead ? ` ${ahead}.` : ''}${
    w.frozen ? ' The river is frozen.' : ''
  } Click for the season's card.`;
  const open = () => {
    const card = m.seasonCard.value;
    if (card) session.ui.almanac.value = { kind: 'card', view: { ...card, weather: w } };
  };
  return (
    <button type="button" class={`weather-chip w-${w.today}`} data-testid="weather" title={title} onClick={open}>
      <WeatherGlyph kind={w.today} />
      <span class="weather-word">{WEATHER_WORD[w.today].word}</span>
      {w.forecast[0] && <WeatherGlyph kind={w.forecast[0][1]} class="next" />}
      {w.frozen && <span class="frozen-mark" title="The river is frozen" aria-label="river frozen" />}
    </button>
  );
}

export function RenownChip({ session }: { session: Session }) {
  const r = session.mirror.renown.value;
  if (!r) return null;
  const title =
    r.next === null
      ? `${r.name}: renown ${r.points}, as famous as a valley gets.`
      : `${r.name}: renown ${r.points} of ${r.next} for the next level. Festivals, commissions and a raid seen off all spread the word.`;
  return (
    <span class={`stat-chip renown lvl-${r.level}`} data-testid="renown" title={title}>
      <svg viewBox="0 0 16 20" class="ribbon" aria-hidden="true">
        <circle cx="8" cy="7" r="5.5" />
        <path d="M5 11 l-2 8 l5 -3 l5 3 l-2 -8" />
      </svg>
      <span>{r.level}</span>
    </span>
  );
}
