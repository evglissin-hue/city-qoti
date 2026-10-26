import { randomId } from '@qoti/protocol';
import { useState } from 'preact/hooks';
import { createOnlineValley } from '../net/api';
import { LocalRoom } from '../net/local';
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
        throw new Error('Could not reach the relay. Is the dev server running?');
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
        <h1>City Qoti</h1>
        <p class="tagline">Two players, one valley, no rush.</p>
        {invited && (
          <div class="invite-banner">
            <p>Someone saved you a seat in their valley.</p>
            <button
              type="button"
              class="primary big"
              data-testid="join"
              disabled={busy}
              onClick={() => onStart(targetOf(invited))}
            >
              Join the valley
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
            New online valley
          </button>
          <button type="button" class="big" data-testid="new-solo" disabled={busy} onClick={newSolo}>
            New solo valley
          </button>
        </div>
        <details class="title-options">
          <summary>Options</summary>
          <label>
            Town name
            <input
              value={town}
              maxLength={32}
              placeholder="Qoti"
              onInput={(e) => setTown((e.target as HTMLInputElement).value)}
            />
          </label>
          <label>
            Seed
            <input
              value={seed}
              maxLength={64}
              placeholder="Leave empty for a surprise"
              data-testid="seed"
              onInput={(e) => setSeed((e.target as HTMLInputElement).value)}
            />
          </label>
        </details>
        {error && <p class="error">{error}</p>}
        {others.length > 0 && (
          <div class="continue">
            <h2>Continue</h2>
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
                      {v.mode === 'solo' ? 'Solo' : 'Online'}, {ago(v.lastPlayed)}
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
