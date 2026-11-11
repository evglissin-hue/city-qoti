// The Neighbors tab of the Balances book: who the carrier trades with, the trade log, the River
// Dock's boats and commissions. What the old Trade book showed that still exists after R1.
import { content, type Reward } from '@qoti/content';
import type { CommissionView, TradeView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { goodName, shortDate } from '../format';
import { GoodIcon } from '../goodIcons';
import { Glyph } from '../icons';
import { inDays, neighborName } from '../seasons';
import { goodOrder } from '../village';
import { Empty, Meter } from './parts';
import { Price } from './villageParts';

function localPrice(session: Session, good: string): number | null {
  return session.mirror.market.value?.lines.find((l) => l.good === good)?.price ?? null;
}

export function Neighbors({ session, trade }: { session: Session; trade: TradeView }) {
  if (!trade.neighbors.length) return <Empty>Nobody trades with a hamlet this small. Yet.</Empty>;
  return (
    <div class="neighbors" data-testid="neighbors">
      {trade.neighbors.map((n) => {
        const sells = n.prices.filter((p) => p.buy !== null).sort((a, b) => goodOrder(a.good, b.good));
        const buys = n.prices.filter((p) => p.sell !== null).sort((a, b) => goodOrder(a.good, b.good));
        return (
          <article key={n.id} class="neighbor-card" data-testid={`neighbor-${n.id}`}>
            <header>
              <span class="neighbor-crest" aria-hidden="true">
                {n.name.slice(0, 1)}
              </span>
              <div>
                <h4>{n.name}</h4>
                <p class="small muted">{n.blurb}</p>
              </div>
            </header>
            <div class="neighbor-goods">
              <div>
                <span class="label">They sell</span>
                <ul>
                  {sells.map((p) => {
                    const home = localPrice(session, p.good);
                    const cheap = home !== null && p.buy! < home;
                    return (
                      <li key={p.good} title={cheap ? 'Cheaper than at home' : undefined}>
                        <GoodIcon good={p.good} />
                        <span>{goodName(p.good)}</span>
                        <Price pennies={p.buy!} />
                        {cheap && <i class="deal" aria-label="Cheaper than at home" />}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <span class="label">They buy</span>
                <ul>
                  {buys.map((p) => {
                    const home = localPrice(session, p.good);
                    const keen = home !== null && p.sell! > home;
                    return (
                      <li key={p.good} title={keen ? 'Pays better than home' : undefined}>
                        <GoodIcon good={p.good} />
                        <span>{goodName(p.good)}</span>
                        <Price pennies={p.sell!} />
                        {keen && <i class="deal" aria-label="Pays better than home" />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </article>
        );
      })}
      <p class="muted small foot">
        You buy at a little over their price and sell at a little under it. The carrier has to eat.
      </p>
    </div>
  );
}

/** What the carrier and the boats bought and sold, newest first. */
export function TradeLog({ trade }: { trade: TradeView }) {
  const name = (id: string) => content.neighborById.get(id)?.name ?? id;
  const log = [...trade.log].reverse().slice(0, 12);
  return (
    <div class="trade-ledger" data-testid="trade-ledger">
      {log.length === 0 ? (
        <Empty>Not a single deal written down yet.</Empty>
      ) : (
        <table class="ledger-table trade-log" data-testid="trade-log-table">
          <tbody>
            {log.map((e, i) => (
              <tr key={i}>
                <td class="muted">{shortDate(e.tick)}</td>
                <th scope="row">
                  <GoodIcon good={e.good} /> {e.qty < 0 ? 'Sold' : 'Bought'} {Math.abs(e.qty)}{' '}
                  {goodName(e.good).toLowerCase()}
                </th>
                <td class="muted small">{name(e.neighbor)}</td>
                <td class={`num ${e.pennies >= 0 ? 'plus' : 'minus'}`}>
                  <Price pennies={e.pennies} signed />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

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
