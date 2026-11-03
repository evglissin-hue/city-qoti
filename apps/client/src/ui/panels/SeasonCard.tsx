// I3 (C5F): the almanac. A card opens each season (the Charter or trial steps that matter now, the
// festival's date, the forecast, a telegraphed threat), and a two-page report closes it: the
// Hearth's page and the Ledger's page, from SeasonReportView. Paper tinted by the season.
import { TICKS_PER_DAY, type SeasonCardView, type SeasonReportLine, type SeasonReportView } from '@qoti/sim';
import type { ComponentChildren } from 'preact';
import type { Session } from '../../app/session';
import { closeAlmanac } from '../../app/seasonsHook';
import { CompassArrow, SeasonVignette, Stars, WeatherGlyph } from '../art';
import {
  BAND_WORD,
  dayName,
  SEASON_KEY,
  SIDE_WORD,
  signWord,
  today,
  WEATHER_WORD,
  whenWord,
} from '../seasons';
import { toggleBook } from '.';

const TRACK_MARK: Record<SeasonReportLine['track'], string> = {
  weather: 'Weather',
  festival: 'Festival',
  nature: 'Nature',
  threat: 'The Watch',
};

export function SeasonCardPanel({ session }: { session: Session }) {
  const a = session.ui.almanac.value;
  if (!a) return null;
  const close = () => closeAlmanac(session.ui);
  return (
    <div class="modal-backdrop letter-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      {a.kind === 'card' ? (
        <SeasonCard session={session} view={a.view} onClose={close} />
      ) : (
        <SeasonReport session={session} view={a.view} page={a.page} onClose={close} />
      )}
    </div>
  );
}

export function SeasonCard({
  session,
  view,
  onClose,
}: {
  session: Session;
  view: SeasonCardView;
  onClose: () => void;
}) {
  const now = today(session.mirror.tick.value);
  const trial = session.mirror.trial.value;
  const trialNow =
    trial && (trial.status === 'running' || trial.status === 'upcoming') && trial.season === view.season;
  const t = view.threat;
  const festivalIn = view.festival.day - now;
  return (
    <div
      class={`almanac-card paper-${SEASON_KEY[view.season]}`}
      role="dialog"
      aria-label={view.name}
      data-testid="season-card"
    >
      <SeasonVignette season={view.season} class="almanac-art" />
      <p class="kicker">The almanac</p>
      <h2>{view.name}</h2>
      <div class="almanac-grid">
        <section class="almanac-box" data-testid="card-festival">
          <h4>The festival</h4>
          <p>
            <b>{view.festival.name}</b>
          </p>
          <p class="small muted">
            {dayName(view.festival.day)}, from six in the evening ({whenWord(festivalIn)}).
          </p>
          <button
            type="button"
            class="link-button"
            data-testid="card-plan"
            onClick={() => {
              onClose();
              session.ui.lens.value = 'hearth';
              toggleBook(session, 'festival');
            }}
          >
            Plan it
          </button>
        </section>
        <section class="almanac-box" data-testid="card-forecast">
          <h4>The forecast</h4>
          <Forecast session={session} weather={view.weather} />
        </section>
      </div>
      {view.steps.length > 0 && (
        <section class="almanac-steps" data-testid="card-steps">
          <h4>{trialNow ? `${trial.name}` : 'This season'}</h4>
          <ul>
            {view.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {trialNow && (
            <button
              type="button"
              class="link-button"
              data-testid="card-trial"
              onClick={() => {
                onClose();
                toggleBook(session, 'trial');
              }}
            >
              How the town is doing
            </button>
          )}
        </section>
      )}
      {t.band && t.side && (
        <section class="almanac-threat" data-testid="card-threat">
          <CompassArrow side={t.side} />
          <div>
            <p>
              <b>Company is coming.</b> {BAND_WORD[t.band]} from {SIDE_WORD[t.side]},{' '}
              {whenWord(t.daysLeft ?? 0)}.
            </p>
            {t.signs.length > 0 && <p class="small muted">{t.signs.map(signWord).join('. ')}.</p>}
          </div>
        </section>
      )}
      <div class="actions">
        <button type="button" class="primary" data-testid="season-card-close" onClick={onClose}>
          Begin the season
        </button>
      </div>
    </div>
  );
}

export function Forecast({ session, weather }: { session: Session; weather: SeasonCardView['weather'] }) {
  const now = today(session.mirror.tick.value);
  return (
    <div class="forecast" data-testid="forecast">
      <span class="forecast-day today" title={WEATHER_WORD[weather.today].line}>
        <WeatherGlyph kind={weather.today} />
        <span>Today</span>
        <b>{WEATHER_WORD[weather.today].word}</b>
      </span>
      {weather.forecast.map(([day, kind]) => (
        <span key={day} class="forecast-day" title={WEATHER_WORD[kind].line}>
          <WeatherGlyph kind={kind} />
          <span>{day - now === 1 ? 'Tomorrow' : dayName(day)}</span>
          <b>{WEATHER_WORD[kind].word}</b>
        </span>
      ))}
      {weather.frozen && <p class="small muted frozen-note">The river is frozen: no fishing and no boats.</p>}
      {weather.events
        .filter((e) => e.active || e.start > session.mirror.tick.value)
        .map((e) => (
          <p key={e.id} class="small event-note" data-testid={`event-${e.event}`}>
            {e.active
              ? `${e.name} now, until ${dayName(Math.floor(e.end / TICKS_PER_DAY))}.`
              : `${e.name} expected ${dayName(Math.floor(e.start / TICKS_PER_DAY))}.`}
          </p>
        ))}
    </div>
  );
}

export function SeasonReport({
  session,
  view,
  page,
  onClose,
}: {
  session: Session;
  view: SeasonReportView;
  page: 0 | 1;
  onClose: () => void;
}) {
  const names = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const flip = (p: 0 | 1) => {
    const a = session.ui.almanac.value;
    if (a?.kind === 'report') session.ui.almanac.value = { ...a, page: p };
  };
  const stars = view.hearth.find((l) => l.track === 'festival')?.value;
  return (
    <div
      class={`almanac-report paper-${SEASON_KEY[view.season]} on-page-${page}`}
      role="dialog"
      aria-label={`${names[view.season]} report`}
      data-testid="season-report"
    >
      <header class="report-head">
        <SeasonVignette season={view.season} class="almanac-art" />
        <p class="kicker">The season report</p>
        <h2>
          {names[view.season]}, year {view.year + 1}
        </h2>
      </header>
      <div class="report-spread">
        <ReportPage title="The Hearth" lines={view.hearth} lens="hearth" testid="report-hearth">
          {stars !== undefined && <Stars n={stars} />}
        </ReportPage>
        <ReportPage title="The Ledger" lines={view.ledger} lens="ledger" testid="report-ledger" />
      </div>
      <div class="actions">
        <span class="page-turn">
          <button type="button" class="ghost-button" disabled={page === 0} onClick={() => flip(0)}>
            The Hearth
          </button>
          <button type="button" class="ghost-button" disabled={page === 1} onClick={() => flip(1)}>
            The Ledger
          </button>
        </span>
        <button type="button" class="primary" data-testid="season-report-close" onClick={onClose}>
          Close the book on it
        </button>
      </div>
    </div>
  );
}

function ReportPage({
  title,
  lines,
  lens,
  testid,
  children,
}: {
  title: string;
  lines: SeasonReportLine[];
  lens: 'hearth' | 'ledger';
  testid: string;
  children?: ComponentChildren;
}) {
  return (
    <section class={`report-page lens-${lens}`} data-testid={testid}>
      <h3>{title}</h3>
      {children}
      {lines.length === 0 ? (
        <p class="muted small">A quiet season on this page. Nobody minded.</p>
      ) : (
        <ul>
          {lines.map((l, i) => (
            <li key={i} class={`report-line track-${l.track}`}>
              <span class="report-mark">{TRACK_MARK[l.track]}</span>
              <span>{l.text}</span>
              {l.value !== undefined && l.track === 'nature' && (
                <b class="report-value" title="New in the Field Guide">
                  +{l.value}
                </b>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
