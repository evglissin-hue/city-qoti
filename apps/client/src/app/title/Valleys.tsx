import { copy } from '../../ui/copy';
import { ago } from '../../ui/format';
import { RANK_WORD } from '../../ui/village';
import { saveOldFile } from '../oldValley';
import type { RecentValley } from '../recent';
import type { ValleyFile } from '../valleyFile';
import { sharedWith, whereItStands } from './Menu';

/** Every valley this device knows, most recent first: open it, remove it, or save an old one's file. */
export function Valleys({
  list,
  isOld,
  forgetting,
  onForgetting,
  onForget,
  onOpen,
  onError,
  busy,
  error,
  onBack,
}: {
  list: RecentValley[];
  isOld: (v: RecentValley) => boolean;
  forgetting: string | null;
  onForgetting: (id: string | null) => void;
  onForget: (v: RecentValley) => void;
  onOpen: (v: RecentValley) => void;
  onError: (message: string) => void;
  busy: boolean;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <section class="tf-step tf-valleys" data-testid="valleys-step" aria-labelledby="tf-step-heading">
      <h2 id="tf-step-heading" tabIndex={-1} data-step-heading>
        {copy.title.valleysHeading}
      </h2>
      <ul class="tf-list">
        {list.map((v) =>
          forgetting === v.valleyId ? (
            <li key={v.valleyId} class="forget-confirm" data-testid={`forget-confirm-${v.valleyId}`}>
              <p>{v.mode === 'solo' ? copy.title.forgetSolo(v.name) : copy.title.forgetOnline(v.name)}</p>
              <div class="forget-actions">
                <button
                  type="button"
                  class="danger"
                  data-testid={`forget-yes-${v.valleyId}`}
                  onClick={() => onForget(v)}
                >
                  {copy.title.forgetYes}
                </button>
                <button type="button" onClick={() => onForgetting(null)}>
                  {copy.title.forgetNo}
                </button>
              </div>
            </li>
          ) : isOld(v) ? (
            <li key={v.valleyId} class="continue-old" data-testid={`old-${v.valleyId}`}>
              <strong>{v.name}</strong>
              <span class="muted">{copy.title.oldValley}</span>
              <div class="forget-actions">
                <button
                  type="button"
                  data-testid={`old-save-${v.valleyId}`}
                  onClick={() =>
                    void saveOldFile(v)
                      .then((saved) => saved || onError(copy.title.oldValley))
                      .catch(() => onError(copy.title.oldValley))
                  }
                >
                  {copy.title.saveItsFile}
                </button>
                <button
                  type="button"
                  data-testid={`old-remove-${v.valleyId}`}
                  onClick={() => onForgetting(v.valleyId)}
                >
                  {copy.title.forget}
                </button>
              </div>
            </li>
          ) : (
            <li key={v.valleyId} class="continue-row">
              <button
                type="button"
                class="tf-row-open"
                data-testid={`continue-${v.valleyId}`}
                disabled={busy}
                onClick={() => onOpen(v)}
              >
                <strong>{v.name}</strong>
                <span class="muted">
                  {[
                    v.creative ? copy.title.creativeTag : null,
                    v.rank ? RANK_WORD[v.rank] : null,
                    whereItStands(v),
                    sharedWith(v),
                    ago(v.lastPlayed),
                    v.seed ? copy.title.seedTag(v.seed) : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </button>
              <button
                type="button"
                class="forget"
                title={copy.title.forgetTitle(v.name)}
                aria-label={copy.title.forgetTitle(v.name)}
                data-testid={`forget-${v.valleyId}`}
                disabled={busy}
                onClick={() => onForgetting(v.valleyId)}
              >
                ×
              </button>
            </li>
          ),
        )}
      </ul>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <div class="tf-step-actions">
        <button type="button" class="tf-back" data-testid="title-back" onClick={onBack}>
          {copy.title.back}
        </button>
      </div>
    </section>
  );
}

/** A valley file that was just read: open it for two or alone. */
export function Imported({
  imported,
  busy,
  error,
  onOpen,
  onBack,
}: {
  imported: ValleyFile;
  busy: boolean;
  error: string | null;
  onOpen: (mode: 'solo' | 'online') => void;
  onBack: () => void;
}) {
  return (
    <section class="tf-step tf-imported" data-testid="imported" aria-labelledby="tf-step-heading">
      <h2 id="tf-step-heading" tabIndex={-1} data-step-heading>
        {copy.title.importedHeading}
      </h2>
      <p class="tf-imported-line">
        <strong>{imported.summary.townName}</strong> {copy.title.importedIn} {imported.summary.valleyName}
        <span class="muted"> ({copy.title.importedResidents(imported.summary.residents)})</span>
      </p>
      <p class="muted">{copy.title.importedHint}</p>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <div class="tf-imported-actions">
        <button
          type="button"
          class="primary big"
          data-testid="open-imported-online"
          disabled={busy}
          onClick={() => onOpen('online')}
        >
          {copy.title.newOnline}
        </button>
        <button
          type="button"
          class="big"
          data-testid="open-imported-solo"
          disabled={busy}
          onClick={() => onOpen('solo')}
        >
          {copy.title.newSolo}
        </button>
      </div>
      <div class="tf-step-actions">
        <button type="button" class="tf-back" data-testid="title-back" onClick={onBack}>
          {copy.title.back}
        </button>
      </div>
    </section>
  );
}
