import { useEffect, useRef, useState } from 'preact/hooks';
import { copy } from '../../ui/copy';
import { ago } from '../../ui/format';
import { RANK_WORD } from '../../ui/village';
import type { PlayerProfile } from '../profile';
import type { RecentValley } from '../recent';
import { sharedWith, whereItStands } from './describe';
import { YouFields } from './You';

export type MenuPrimary = 'join' | 'continue' | 'new-online';

export function Menu({
  primary,
  invited,
  featured,
  otherCount,
  profile,
  onProfile,
  busy,
  nameOpen,
  onNameOpen,
  pasteOpen,
  onPasteOpen,
  onJoin,
  onContinue,
  onChoose,
  onValleys,
  onSettings,
  onFile,
  onPaste,
}: {
  primary: MenuPrimary;
  invited: RecentValley | undefined;
  featured: RecentValley | undefined;
  otherCount: number;
  profile: PlayerProfile;
  onProfile: (p: PlayerProfile) => void;
  busy: boolean;
  nameOpen: boolean;
  onNameOpen: (open: boolean) => void;
  pasteOpen: boolean;
  onPasteOpen: (open: boolean) => void;
  onJoin: () => void;
  onContinue: (v: RecentValley) => void;
  onChoose: (mode: 'online' | 'solo') => void;
  onValleys: () => void;
  onSettings: () => void;
  onFile: (file: File | undefined) => void;
  onPaste: (text: string) => boolean;
}) {
  return (
    <>
      <div class="tf-menu" data-primary={primary}>
        {invited && (
          <section class="tf-card tf-join" aria-labelledby="tf-join-kicker">
            <p class="tf-kicker" id="tf-join-kicker">
              {copy.title.joinKicker}
            </p>
            <p class="tf-lead">{copy.title.invited}</p>
            <button
              type="button"
              class="primary big tf-go"
              data-testid="join"
              disabled={busy}
              onClick={onJoin}
            >
              {copy.title.join}
            </button>
            <p class="tf-arrive muted">
              {profile.name.trim() ? copy.title.arriveAs(profile.name.trim()) : copy.title.arriveUnnamed}{' '}
              <button
                type="button"
                class="tf-link"
                aria-expanded={nameOpen}
                data-testid="join-change"
                onClick={() => onNameOpen(!nameOpen)}
              >
                {nameOpen ? copy.title.changeDone : copy.title.change}
              </button>
            </p>
            {nameOpen && <YouFields profile={profile} onChange={onProfile} />}
          </section>
        )}
        {featured && (
          <section class="tf-continue" aria-label={copy.title.continue}>
            <button
              type="button"
              class={`tf-card tf-continue-card ${primary === 'continue' ? 'is-primary' : ''}`}
              data-testid={`continue-${featured.valleyId}`}
              disabled={busy}
              onClick={() => onContinue(featured)}
            >
              <span class="tf-kicker">{copy.title.continue}</span>
              <strong class="tf-valley-name">{featured.name}</strong>
              <span class="tf-meta">
                {[whereItStands(featured), sharedWith(featured)]
                  .filter((s): s is string => !!s)
                  .map((s, i) => (
                    <span key={i} class="tf-chip">
                      {s}
                    </span>
                  ))}
                {featured.creative && <span class="tf-chip tf-chip-soft">{copy.title.creativeTag}</span>}
                {featured.rank && <span class="tf-chip tf-chip-soft">{RANK_WORD[featured.rank]}</span>}
              </span>
              <span class="tf-played muted">{copy.title.played(ago(featured.lastPlayed))}</span>
              <span class="tf-continue-go" aria-hidden="true">
                {copy.title.continueGo}
              </span>
            </button>
            {otherCount > 0 && (
              <button type="button" class="tf-link tf-more" data-testid="more-valleys" onClick={onValleys}>
                {copy.title.otherValleys(otherCount)}
              </button>
            )}
          </section>
        )}
        {!featured && otherCount > 0 && (
          <button
            type="button"
            class="tf-link tf-more tf-more-alone"
            data-testid="more-valleys"
            onClick={onValleys}
          >
            {copy.title.otherValleys(otherCount)}
          </button>
        )}
        <div class="tf-new">
          <button
            type="button"
            class={`tf-choice ${primary === 'new-online' ? 'primary is-primary' : ''}`}
            data-testid="new-online"
            disabled={busy}
            onClick={() => onChoose('online')}
          >
            <strong>{copy.title.newOnline}</strong>
            <span>{copy.title.newOnlineSub}</span>
          </button>
          <button
            type="button"
            class="tf-choice"
            data-testid="new-solo"
            disabled={busy}
            onClick={() => onChoose('solo')}
          >
            <strong>{copy.title.newSolo}</strong>
            <span>{copy.title.newSoloSub}</span>
          </button>
        </div>
      </div>
      <nav class="tf-quiet" aria-label={copy.title.quietRow}>
        <div class="tf-quiet-row">
          <button type="button" class="tf-link" data-testid="title-settings-open" onClick={onSettings}>
            {copy.settings.open}
          </button>
          <label class="tf-link tf-file">
            {copy.title.openFile}
            <input
              type="file"
              accept=".qoti,application/octet-stream"
              data-testid="open-file"
              disabled={busy}
              onChange={(e) => {
                const input = e.target as HTMLInputElement;
                onFile(input.files?.[0]);
                input.value = '';
              }}
            />
          </label>
          {!invited && (
            <button
              type="button"
              class="tf-link"
              aria-expanded={pasteOpen}
              data-testid="invite-paste-open"
              onClick={() => onPasteOpen(!pasteOpen)}
            >
              {copy.title.joinWithLink}
            </button>
          )}
        </div>
        {!invited && pasteOpen && <PasteInvite onPaste={onPaste} />}
      </nav>
    </>
  );
}

function PasteInvite({ onPaste }: { onPaste: (text: string) => boolean }) {
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // The field was just asked for, so it takes focus.
  useEffect(() => field.current?.focus(), []);
  const go = () => {
    if (!onPaste(text)) setBad(true);
  };
  return (
    <div class="tf-paste">
      <label class="tf-field">
        <span>{copy.title.pasteLabel}</span>
        <span class="tf-paste-row">
          <input
            ref={field}
            value={text}
            placeholder={copy.title.pastePlaceholder}
            data-testid="invite-paste"
            aria-invalid={bad}
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => {
              setText((e.target as HTMLInputElement).value);
              setBad(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                go();
              }
            }}
          />
          <button type="button" data-testid="invite-paste-go" onClick={go}>
            {copy.title.pasteGo}
          </button>
        </span>
      </label>
      {bad && (
        <p class="error tf-paste-error" role="alert" data-testid="invite-paste-error">
          {copy.title.pasteBad}
        </p>
      )}
    </div>
  );
}
