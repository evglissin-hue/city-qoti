// I3 (C5F): the Trade book's river pages. The River Dock (boats moored and expected, what they sell
// and buy, a frozen notice in winter) and commissions (offers to accept or decline, progress and the
// time left on the ones taken).
import { content, type Reward } from '@qoti/content';
import type { CommissionView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { goodName } from '../format';
import { Glyph } from '../icons';
import { inDays, neighborName } from '../seasons';
import { Empty, Meter } from './parts';

export function DockTab({ session }: { session: Session }) {
  const m = session.mirror;
  const d = m.dock.value;
  const now = m.tick.value;
  const dock = [...m.buildings.values()].some((b) => b.def === 'river-dock' && b.stage === 'built');
  return (
    <div class="dock-tab" data-testid="dock">
      {!dock && (
        <p class="post-note">
          <Glyph id="dock" />
          <span>No River Dock yet. Build one on the bank and the boats will find it.</span>
        </p>
      )}
      {d?.frozen && (
        <p class="frozen-notice" data-testid="dock-frozen">
          The river is frozen. No boats until it thaws in spring; the skaters are delighted.
        </p>
      )}
      {!d || d.boats.length === 0 ? (
        <Empty>No boats on the water just now.</Empty>
      ) : (
        <ul class="boat-list">
          {d.boats.map((b) => (
            <li key={b.id} class={`boat ${b.moored ? 'moored' : ''}`} data-testid={`boat-${b.id}`}>
              <h5>
                {neighborName(b.neighbor)}'s boat{' '}
                <span class="small muted">
                  {b.moored
                    ? `moored, leaves ${inDays(b.departTick, now)}`
                    : b.arriveTick > now
                      ? `due ${inDays(b.arriveTick, now)}`
                      : 'gone downriver'}
                </span>
              </h5>
              <p class="small">
                Selling{' '}
                {b.selling.map(([g, q]) => `${q} ${goodName(g).toLowerCase()}`).join(', ') || 'nothing'}.
                Buying {b.buying.map(([g, q]) => `${q} ${goodName(g).toLowerCase()}`).join(', ') || 'nothing'}
                .
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusLine(c: CommissionView, now: number): string {
  switch (c.status) {
    case 'offered':
      return 'Waiting for an answer';
    case 'accepted':
      return c.deadlineTick ? `Due ${inDays(c.deadlineTick, now)}` : 'Under way';
    case 'done':
      return 'Delivered, with thanks';
    case 'declined':
      return 'Politely declined';
    case 'expired':
      return 'Ran out of time. They were gracious about it.';
  }
}

export function CommissionsTab({ session }: { session: Session }) {
  const m = session.mirror;
  void m.seasonsRevision.value;
  const now = m.tick.value;
  const list = [...m.commissions.values()].sort((a, b) => b.offeredTick - a.offeredTick);
  const open = list.filter((c) => c.status === 'offered' || c.status === 'accepted');
  const past = list.filter((c) => c.status !== 'offered' && c.status !== 'accepted').slice(0, 6);
  if (!list.length)
    return <Empty>No commissions yet. As word of the town spreads, neighbors will ask for things.</Empty>;
  return (
    <div class="commissions" data-testid="commissions">
      {open.map((c) => {
        const def = content.commissionById.get(c.def);
        return (
          <article key={c.id} class={`commission status-${c.status}`} data-testid={`commission-${c.id}`}>
            <h5>
              {def?.name ?? c.name} <span class="small muted">from {neighborName(c.from)}</span>
            </h5>
            <p>{c.ask}</p>
            {def && <p class="small muted">{rewardText(def.reward)}</p>}
            <p class="small">{statusLine(c, now)}</p>
            {c.status === 'accepted' && (
              <Meter value={c.progress / 100} note={`${c.progress}%`} tone="ochre" />
            )}
            {c.status === 'offered' && (
              <div class="row-actions">
                <button
                  type="button"
                  class="primary"
                  data-testid={`commission-accept-${c.id}`}
                  onClick={() => session.submit({ t: 'commission.accept', id: c.id })}
                >
                  Take it on
                </button>
                <button
                  type="button"
                  class="ghost-button"
                  data-testid={`commission-decline-${c.id}`}
                  onClick={() => session.submit({ t: 'commission.decline', id: c.id })}
                >
                  Decline
                </button>
              </div>
            )}
          </article>
        );
      })}
      {past.length > 0 && (
        <>
          <h5 class="small muted">Lately</h5>
          <ul class="commission-past">
            {past.map((c) => (
              <li key={c.id} class="small">
                {c.name}: {statusLine(c, now).toLowerCase()}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins} coins`);
  if (r.renown) parts.push(`renown +${r.renown}`);
  return parts.length ? `Reward: ${parts.join(' and ')}.` : '';
}
