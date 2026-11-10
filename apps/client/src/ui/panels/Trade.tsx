import { content } from '@qoti/content';
import type { TradeView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { goodName, shortDate } from '../format';
import { GoodIcon } from '../goodIcons';
import { Glyph } from '../icons';
import type { TradeTab } from '../state';
import { goodOrder } from '../village';
import { Empty, Frame } from './parts';
import { Price } from './villageParts';
import { CommissionsTab, DockTab } from './Dock';

const TABS: [TradeTab, string][] = [
  ['neighbors', 'Neighbors'],
  ['log', 'Trade log'],
  // I3 (C5F)
  ['dock', 'River Dock'],
  ['commissions', 'Commissions'],
];

/**
 * The Trade book: neighbors and their prices, the trade log, the River Dock and commissions. R1.0
 * keeps it a stand-in: the carrier's terms live in the Balances book R1C builds.
 */
export function TradePanel({ session }: { session: Session }) {
  const tab = session.ui.tradeTab.value;
  const trade = session.mirror.trade.value;
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame id="trade" class="book-panel trade" icon="trade" kicker="The Ledger" title="Trade" onClose={close}>
      {trade && !trade.postId && (
        <p class="post-note" data-testid="no-post">
          <Glyph id="caravan" />
          <span>
            No Trading Post yet. The carrier still calls at the valley gate; a post by the valley road gets
            better prices.
          </span>
        </p>
      )}
      <div class="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            class={tab === id ? 'active' : ''}
            data-testid={`trade-${id}`}
            onClick={() => (session.ui.tradeTab.value = id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="tab-body">
        {!trade ? (
          <Empty>No trade in a creative valley.</Empty>
        ) : tab === 'neighbors' ? (
          <Neighbors session={session} trade={trade} />
        ) : tab === 'dock' ? (
          <DockTab session={session} />
        ) : tab === 'commissions' ? (
          <CommissionsTab session={session} />
        ) : (
          <TradeLog trade={trade} />
        )}
      </div>
    </Frame>
  );
}

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
