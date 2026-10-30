import { randomId } from '@qoti/protocol';
import type { ValleySettings } from '@qoti/sim';
import { useMemo, useState } from 'preact/hooks';
import { createOnlineValley } from '../net/api';
import { LocalRoom } from '../net/local';
import { copy, welcomeLine } from '../ui/copy';
import { ago } from '../ui/format';
import { loadProfile, saveProfile, SWATCHES, type PlayerProfile } from './profile';
import { forgetValley, listRecent, rememberValley, type RecentValley } from './recent';
import { valleyDbName } from '../net/idb';
import { readValleyFile, type ValleyFile } from './valleyFile';
import type { SessionTarget } from './session';

function targetOf(v: RecentValley): SessionTarget {
  return {
    valleyId: v.valleyId,
    seat: v.seat,
    token: v.token,
    mode: v.mode,
    ...(v.invite ? { invite: v.invite } : {}),
  };
}

export function Title({ onStart }: { onStart: (t: SessionTarget, opts?: { invite?: boolean }) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Playtest round six: the valley asking "are you sure?", and a bump to redraw the list after.
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [, setListVersion] = useState(0);
  const forget = (v: RecentValley) => {
    forgetValley(v.valleyId);
    // A solo valley's turns and snapshots live in this browser alone: delete them too.
    if (v.mode === 'solo') {
      try {
        indexedDB.deleteDatabase(valleyDbName(v.valleyId));
      } catch {
        // Storage blocked: the list entry is gone, which is what the player asked for.
      }
    }
    setForgetting(null);
    setListVersion((n) => n + 1);
  };
  const [seed, setSeed] = useState('');
  const [town, setTown] = useState('');
  // ?creative starts with the creative box ticked (the I0 end to end specs play sandbox valleys).
  const [creative, setCreative] = useState(() => new URLSearchParams(location.search).has('creative'));
  const [economy, setEconomy] = useState<ValleySettings['economy']>('standard');
  const [imported, setImported] = useState<ValleyFile | null>(null);
  const welcome = useMemo(() => welcomeLine(), []);
  const [profile, setProfileState] = useState<PlayerProfile>(() => loadProfile());
  const setProfile = (p: PlayerProfile) => {
    setProfileState(p);
    saveProfile(p);
  };
  const recent = listRecent();
  const invited = recent.find((v) => v.pending);
  const others = recent.filter((v) => !v.pending);
  // Standard valleys are the game; a creative valley is the quiet sandbox with no residents or costs.
  const settings: Partial<ValleySettings> = {
    mode: creative ? 'sandbox' : 'standard',
    economy,
    ...(town.trim() ? { townName: town.trim() } : {}),
  };
  const body = { ...(seed.trim() ? { seed: seed.trim() } : {}), settings };

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const newOnline = () =>
    run(async () => {
      const v = await createOnlineValley(body).catch(() => {
        throw new Error(copy.title.relayDown);
      });
      const recentValley: RecentValley = {
        valleyId: v.valleyId,
        seat: 0,
        token: v.tokens[0]!,
        mode: 'online',
        name: town.trim() || 'Qoti',
        lastPlayed: Date.now(),
        ...(creative ? { creative: true } : {}),
        ...(v.invites[1] ? { invite: v.invites[1] } : {}),
      };
      rememberValley(recentValley);
      onStart(targetOf(recentValley), { invite: true });
    });

  const newSolo = () =>
    run(async () => {
      const valleyId = randomId();
      const { token } = await LocalRoom.create(valleyId, body);
      const recentValley: RecentValley = {
        valleyId,
        seat: 0,
        token,
        mode: 'solo',
        name: town.trim() || 'Qoti',
        lastPlayed: Date.now(),
        ...(creative ? { creative: true } : {}),
      };
      rememberValley(recentValley);
      onStart(targetOf(recentValley));
    });

  const pickFile = (file: File | undefined) =>
    file &&
    run(async () => {
      setImported(readValleyFile(new Uint8Array(await file.arrayBuffer())));
      setBusy(false);
    });

  /** Opens an imported valley file as a new valley, solo or for two. */
  const openImported = (mode: 'solo' | 'online') =>
    imported &&
    run(async () => {
      const req = { seed: imported.seed, settings: imported.settings, snapshot: imported.snapshot };
      const sandbox = imported.settings.mode === 'sandbox';
      const name = imported.summary.townName;
      if (mode === 'online') {
        const v = await createOnlineValley(req).catch(() => {
          throw new Error(copy.title.relayDown);
        });
        const recentValley: RecentValley = {
          valleyId: v.valleyId,
          seat: 0,
          token: v.tokens[0]!,
          mode: 'online',
          name,
          lastPlayed: Date.now(),
          ...(sandbox ? { creative: true } : {}),
          ...(v.invites[1] ? { invite: v.invites[1] } : {}),
        };
        rememberValley(recentValley);
        onStart(targetOf(recentValley), { invite: true });
      } else {
        const valleyId = randomId();
        const { token } = await LocalRoom.create(valleyId, req);
        const recentValley: RecentValley = {
          valleyId,
          seat: 0,
          token,
          mode: 'solo',
          name,
          lastPlayed: Date.now(),
          ...(sandbox ? { creative: true } : {}),
        };
        rememberValley(recentValley);
        onStart(targetOf(recentValley));
      }
    });

  return (
    <main class="title-screen">
      <div class="panel title-card">
        <div class="title-mark" aria-hidden="true">
          <CottageMark />
        </div>
        <h1>
          {copy.title.name} <span class="qoti">{copy.title.nameAccent}</span>
        </h1>
        <p class="tagline">{copy.title.tagline}</p>
        <p class="welcome muted">{welcome}</p>
        <fieldset class="you">
          <label>
            {copy.title.yourName}
            <input
              value={profile.name}
              maxLength={24}
              placeholder={copy.title.yourNamePlaceholder}
              data-testid="your-name"
              onInput={(e) => setProfile({ ...profile, name: (e.target as HTMLInputElement).value })}
            />
          </label>
          <div class="swatches" role="radiogroup" aria-label={copy.title.yourColor}>
            <span class="swatch-label">{copy.title.yourColor}</span>
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={profile.color === c}
                class={`swatch ${profile.color === c ? 'active' : ''}`}
                style={{ '--swatch': `#${c.toString(16).padStart(6, '0')}` }}
                data-testid={`swatch-${c.toString(16)}`}
                onClick={() => setProfile({ ...profile, color: c })}
              />
            ))}
          </div>
        </fieldset>
        {invited && (
          <div class="invite-banner">
            <p>{copy.title.invited}</p>
            <button
              type="button"
              class="primary big"
              data-testid="join"
              disabled={busy}
              onClick={() => onStart(targetOf(invited))}
            >
              {copy.title.join}
            </button>
          </div>
        )}
        {!invited && (
          <label class="town">
            {copy.title.townName}
            <input
              value={town}
              maxLength={32}
              placeholder={copy.title.townPlaceholder}
              data-testid="town-name"
              onInput={(e) => setTown((e.target as HTMLInputElement).value)}
            />
          </label>
        )}
        <div class="title-actions">
          <button
            type="button"
            class="primary big"
            data-testid="new-online"
            disabled={busy}
            onClick={newOnline}
          >
            {copy.title.newOnline}
          </button>
          <button type="button" class="big" data-testid="new-solo" disabled={busy} onClick={newSolo}>
            {copy.title.newSolo}
          </button>
          {!invited && (
            <label class="creative-toggle">
              <input
                type="checkbox"
                checked={creative}
                data-testid="creative"
                onChange={(e) => setCreative((e.target as HTMLInputElement).checked)}
              />
              <span>
                {copy.title.creative} <span class="muted">({copy.title.creativeHint})</span>
              </span>
            </label>
          )}
        </div>
        <details class="title-options">
          <summary>{copy.title.more}</summary>
          <label>
            {copy.title.seed}
            <input
              value={seed}
              maxLength={64}
              placeholder={copy.title.seedPlaceholder}
              data-testid="seed"
              onInput={(e) => setSeed((e.target as HTMLInputElement).value)}
            />
          </label>
          <fieldset class="economy" disabled={creative}>
            <legend>{copy.title.economy}</legend>
            <div class="dial" role="radiogroup" aria-label={copy.title.economy}>
              {copy.title.economyOptions.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={economy === id}
                  class={economy === id ? 'active' : ''}
                  data-testid={`economy-${id}`}
                  onClick={() => setEconomy(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p class="muted dial-note">
              {creative
                ? copy.title.creativeHint
                : copy.title.economyOptions.find(([id]) => id === economy)?.[2]}
            </p>
          </fieldset>
          <label class="open-file">
            {copy.title.openFile}
            <input
              type="file"
              accept=".qoti,application/octet-stream"
              data-testid="open-file"
              disabled={busy}
              onChange={(e) => void pickFile((e.target as HTMLInputElement).files?.[0])}
            />
          </label>
          {imported && (
            <div class="imported" data-testid="imported">
              <p>
                <strong>{imported.summary.townName}</strong> {copy.title.importedIn}{' '}
                {imported.summary.valleyName}
                <span class="muted"> ({copy.title.importedResidents(imported.summary.residents)})</span>
              </p>
              <div class="actions">
                <button
                  type="button"
                  data-testid="open-imported-online"
                  disabled={busy}
                  onClick={() => openImported('online')}
                >
                  {copy.title.newOnline}
                </button>
                <button
                  type="button"
                  data-testid="open-imported-solo"
                  disabled={busy}
                  onClick={() => openImported('solo')}
                >
                  {copy.title.newSolo}
                </button>
              </div>
            </div>
          )}
        </details>
        {error && <p class="error">{error}</p>}
        {others.length > 0 && (
          <div class="continue">
            <h2>{copy.title.continue}</h2>
            <ul>
              {others.map((v) =>
                forgetting === v.valleyId ? (
                  <li key={v.valleyId} class="forget-confirm" data-testid={`forget-confirm-${v.valleyId}`}>
                    <p>
                      {v.mode === 'solo' ? copy.title.forgetSolo(v.name) : copy.title.forgetOnline(v.name)}
                    </p>
                    <div class="forget-actions">
                      <button
                        type="button"
                        class="danger"
                        data-testid={`forget-yes-${v.valleyId}`}
                        onClick={() => forget(v)}
                      >
                        {copy.title.forgetYes}
                      </button>
                      <button type="button" onClick={() => setForgetting(null)}>
                        {copy.title.forgetNo}
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={v.valleyId} class="continue-row">
                    <button
                      type="button"
                      data-testid={`continue-${v.valleyId}`}
                      disabled={busy}
                      onClick={() => onStart(targetOf(v))}
                    >
                      <strong>{v.name}</strong>
                      <span class="muted">
                        {v.creative ? `${copy.title.creativeTag}, ` : ''}
                        {v.mode === 'solo' ? copy.title.solo : copy.title.online}, {ago(v.lastPlayed)}
                      </span>
                    </button>
                    <button
                      type="button"
                      class="forget"
                      title={copy.title.forgetTitle(v.name)}
                      aria-label={copy.title.forgetTitle(v.name)}
                      data-testid={`forget-${v.valleyId}`}
                      disabled={busy}
                      onClick={() => setForgetting(v.valleyId)}
                    >
                      ×
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

/** A small hand-inked cottage with a curl of smoke, drawn inline. */
function CottageMark() {
  return (
    <svg
      width="92"
      height="64"
      viewBox="0 0 92 64"
      fill="none"
      stroke="#5a4231"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M6 58 C 26 52, 66 52, 86 58" stroke="#7f9c6c" />
      <path d="M26 56 V 32 L 46 16 L 66 32 V 56 Z" fill="#fbf1dc" />
      <path d="M22 34 L 46 13 L 70 34" fill="#d98a76" />
      <path d="M40 56 V 43 a 6 6 0 0 1 12 0 V 56" fill="#c48a3f" />
      <rect x="30" y="37" width="7" height="7" rx="1.5" fill="#f5d98a" />
      <rect x="55" y="37" width="7" height="7" rx="1.5" fill="#f5d98a" />
      <path d="M58 22 V 12 h 6 V 27" fill="#fbf1dc" />
      <path d="M61 9 c -4 -3, 4 -5, 0 -8" stroke="#9a8a7a" stroke-width="1.6" />
      <circle cx="14" cy="47" r="7" fill="#9dbb84" />
      <path d="M14 54 V 58" />
      <circle cx="79" cy="49" r="5" fill="#a9c48e" />
      <path d="M79 54 V 58" />
    </svg>
  );
}
