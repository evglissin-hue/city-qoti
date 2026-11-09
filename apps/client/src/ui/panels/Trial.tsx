// I3 (C5F): the trial card. What the winter (or the raid, or the flood) asks of the town, how it is
// doing day by day, the County's seal pressed on success, and on a failure a kind word and when it
// comes round again. Opens from the season card and the rank pennant's board.
import type { TrialView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { Seal } from '../art';
import { SEASON_KEY } from '../seasons';
import { Empty, Frame } from './parts';

const MEASURE_WORD: Record<string, (v: number) => string> = {
  coldHouseholdDays: (v) =>
    v === 0 ? 'Nobody cold for a whole day yet' : `${v} household-${v === 1 ? 'day' : 'days'} spent cold`,
  foodDays: (v) => `${v} ${v === 1 ? 'day' : 'days'} of food in store`,
  firewoodDays: (v) => `${v} ${v === 1 ? 'day' : 'days'} of firewood in store`,
  stolen: (v) => (v === 0 ? 'Nothing stolen' : `${v} goods carried off`),
  flooded: (v) => (v === 0 ? 'No homes flooded' : `${v} buildings under water`),
};

export function measureWord(name: string, value: number): string {
  return MEASURE_WORD[name]?.(value) ?? `${name.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${value}`;
}

const SEASON_WORDS = ['spring', 'summer', 'autumn', 'winter'];

export function TrialPanel({ session }: { session: Session }) {
  const m = session.mirror;
  const t = m.trial.value;
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame
      id="trial"
      class={`book-panel trial-card ${t ? `paper-${SEASON_KEY[t.season]}` : ''}`}
      icon="trial"
      kicker="The County's trial"
      title={t?.name ?? 'Trials'}
      onClose={close}
    >
      {t ? (
        <TrialBody session={session} trial={t} />
      ) : (
        <Empty>No trial on hand. The County will write when it has one in mind.</Empty>
      )}
    </Frame>
  );
}

function TrialBody({ session, trial: t }: { session: Session; trial: TrialView }) {
  const cold = session.mirror.town.value?.coldHouseholds;
  return (
    <div class="trial-body" data-testid={`trial-${t.status}`}>
      <div class="trial-seal">
        <Seal pressed={t.status === 'passed'} label={t.status === 'passed' ? 'Sealed' : 'Not sealed yet'} />
      </div>
      <p class="trial-blurb">{t.blurb}</p>
      <p class="small muted">
        {SEASON_WORDS[t.season]![0]!.toUpperCase() + SEASON_WORDS[t.season]!.slice(1)} of year {t.year + 1}
      </p>
      {t.status === 'running' && (
        <section class="trial-progress" data-testid="trial-progress">
          <h4>How the town is doing</h4>
          <ul>
            {t.measured.map(([name, value]) => (
              <li key={name}>{measureWord(name, value)}</li>
            ))}
            {cold !== undefined && t.kind === 'winter' && (
              <li>
                {cold === 0
                  ? 'Every hearth is lit today'
                  : `${cold} ${cold === 1 ? 'home is' : 'homes are'} cold right now`}
              </li>
            )}
          </ul>
        </section>
      )}
      {t.status === 'upcoming' && (
        <p>It starts with the season. Stock up, and keep an eye on the forecast.</p>
      )}
      {t.status === 'passed' && (
        <p class="trial-word" data-testid="trial-passed">
          Sealed. The County is pleased, in its quiet way, and has put the Village Charter in the drawer
          marked done.
        </p>
      )}
      {t.status === 'failed' && (
        <p class="trial-word" data-testid="trial-failed">
          Not this time, and no harm done: everyone is still here and the kettle still works. The trial comes
          round again next {SEASON_WORDS[t.season]}, in year {t.year + 2}.
        </p>
      )}
    </div>
  );
}
