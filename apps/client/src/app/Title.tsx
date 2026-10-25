import { randomId } from '@qoti/protocol';
import { useMemo, useState } from 'preact/hooks';
import { createOnlineValley } from '../net/api';
import { LocalRoom } from '../net/local';
import { copy, welcomeLine } from '../ui/copy';
import { ago } from '../ui/format';
import { listRecent, rememberValley, type RecentValley } from './recent';
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
  const [seed, setSeed] = useState('');
  const [town, setTown] = useState('');
  const welcome = useMemo(() => welcomeLine(), []);
  const recent = listRecent();
  const invited = recent.find((v) => v.pending);
  const others = recent.filter((v) => !v.pending);
  const body = {
    ...(seed.trim() ? { seed: seed.trim() } : {}),
    settings: town.trim() ? { townName: town.trim() } : {},
  };

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
      };
      rememberValley(recentValley);
      onStart(targetOf(recentValley));
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
        </div>
        <details class="title-options">
          <summary>{copy.title.options}</summary>
          <label>
            {copy.title.townName}
            <input
              value={town}
              maxLength={32}
              placeholder={copy.title.townPlaceholder}
              onInput={(e) => setTown((e.target as HTMLInputElement).value)}
            />
          </label>
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
        </details>
        {error && <p class="error">{error}</p>}
        {others.length > 0 && (
          <div class="continue">
            <h2>{copy.title.continue}</h2>
            <ul>
              {others.map((v) => (
                <li key={v.valleyId}>
                  <button
                    type="button"
                    data-testid={`continue-${v.valleyId}`}
                    disabled={busy}
                    onClick={() => onStart(targetOf(v))}
                  >
                    <strong>{v.name}</strong>
                    <span class="muted">
                      {v.mode === 'solo' ? copy.title.solo : copy.title.online}, {ago(v.lastPlayed)}
                    </span>
                  </button>
                </li>
              ))}
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
