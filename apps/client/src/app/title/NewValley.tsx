import type { ValleySettings } from '@qoti/sim';
import { copy } from '../../ui/copy';
import { guideCopy } from '../../ui/guide';
import type { PlayerProfile } from '../profile';
import type { NewValleyForm } from './actions';
import { YouFields } from './You';

/** The second step of making a valley: who you are, what the town is called, and the dials. */
export function NewValley({
  mode,
  onMode,
  form,
  onForm,
  profile,
  onProfile,
  fresh,
  busy,
  error,
  onFound,
  onBack,
}: {
  mode: 'online' | 'solo';
  onMode: (mode: 'online' | 'solo') => void;
  form: NewValleyForm;
  onForm: (patch: Partial<NewValleyForm>) => void;
  profile: PlayerProfile;
  onProfile: (p: PlayerProfile) => void;
  fresh: boolean;
  busy: boolean;
  error: string | null;
  onFound: () => void;
  onBack: () => void;
}) {
  const { creative } = form;
  const dial = (
    kind: 'economy' | 'threat',
    options: readonly (readonly [string, string, string])[],
    value: ValleySettings['economy'] | ValleySettings['threat'],
  ) => (
    <fieldset class={`tf-dial ${kind}`} disabled={creative}>
      <legend>{kind === 'economy' ? copy.title.economy : copy.title.threat}</legend>
      <div
        class="dial"
        role="radiogroup"
        aria-label={kind === 'economy' ? copy.title.economy : copy.title.threat}
      >
        {options.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            class={value === id ? 'active' : ''}
            data-testid={`${kind}-${id}`}
            onClick={() => onForm({ [kind]: id } as Partial<NewValleyForm>)}
          >
            {label}
          </button>
        ))}
      </div>
      <p class="muted dial-note">
        {creative ? copy.title.creativeHint : options.find(([id]) => id === value)?.[2]}
      </p>
    </fieldset>
  );
  return (
    <section class="tf-step tf-new-step" data-testid="new-step" aria-labelledby="tf-step-heading">
      <h2 id="tf-step-heading" tabIndex={-1} data-step-heading>
        {mode === 'online' ? copy.title.stepOnline : copy.title.stepSolo}
      </h2>
      <div class="tf-switch" role="radiogroup" aria-label={copy.title.modeLabel}>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'online'}
          class={mode === 'online' ? 'active' : ''}
          data-testid="mode-online"
          onClick={() => onMode('online')}
        >
          {copy.title.online}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'solo'}
          class={mode === 'solo' ? 'active' : ''}
          data-testid="mode-solo"
          onClick={() => onMode('solo')}
        >
          {copy.title.solo}
        </button>
      </div>
      <div class="tf-form">
        <p class="tf-section">{copy.title.you}</p>
        <YouFields profile={profile} onChange={onProfile} />
        <label class="tf-field">
          <span>{copy.title.townName}</span>
          <input
            value={form.town}
            maxLength={32}
            placeholder={copy.title.townPlaceholder}
            data-testid="town-name"
            autocomplete="off"
            onInput={(e) => onForm({ town: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="tf-check">
          <input
            type="checkbox"
            checked={creative}
            data-testid="creative"
            onChange={(e) => onForm({ creative: (e.target as HTMLInputElement).checked })}
          />
          <span>
            {copy.title.creative} <span class="muted">({copy.title.creativeHint})</span>
          </span>
        </label>
        {!creative && (
          <label class="tf-check">
            <input
              type="checkbox"
              checked={form.guide}
              data-testid="guide-new"
              onChange={(e) => onForm({ guide: (e.target as HTMLInputElement).checked })}
            />
            <span>
              {guideCopy.show} <span class="muted">({guideCopy.showHint})</span>
            </span>
          </label>
        )}
        <details class="tf-more-options" open={fresh || undefined}>
          <summary>{copy.title.more}</summary>
          {fresh && (
            <p class="muted small" data-testid="fresh-note">
              {copy.title.freshNote}
            </p>
          )}
          <label class="tf-field">
            <span>{copy.title.seed}</span>
            <input
              value={form.seed}
              maxLength={64}
              placeholder={copy.title.seedPlaceholder}
              data-testid="seed"
              autocomplete="off"
              onInput={(e) => onForm({ seed: (e.target as HTMLInputElement).value })}
            />
          </label>
          {dial('economy', copy.title.economyOptions, form.economy)}
          {dial('threat', copy.title.threatOptions, form.threat)}
        </details>
      </div>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <div class="tf-step-actions">
        <button type="button" class="tf-back" data-testid="title-back" onClick={onBack}>
          {copy.title.back}
        </button>
        <button
          type="button"
          class="primary big"
          data-testid="found-valley"
          disabled={busy}
          onClick={onFound}
        >
          {mode === 'online' ? copy.title.foundOnline : copy.title.foundSolo}
        </button>
      </div>
    </section>
  );
}
