import { content } from '@qoti/content';
import type { StandingOrderInput, TradeView } from '@qoti/sim';
import { useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { goodName, shortDate } from '../format';
import { GoodIcon } from '../goodIcons';
import { Glyph } from '../icons';
import type { TradeTab } from '../state';
import { goodOrder, priceText } from '../village';
import { Empty, Frame, Meter } from './parts';
import { Price, Stepper } from './villageParts';

type Order = TradeView['orders'][number];

const TABS: [TradeTab, string][] = [
  ['neighbors', 'Neighbors'],
  ['orders', 'Standing orders'],
  ['caravans', 'Caravans'],
];

/** The Trading Post: neighbors and their prices, standing orders, caravans on the road and the log. */
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
            No Trading Post yet. Build one by the valley gate and the neighbors will start sending carts.
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
        ) : tab === 'orders' ? (
          <Orders session={session} trade={trade} />
        ) : (
          <Caravans session={session} trade={trade} />
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
        const def = content.neighborById.get(n.id);
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
            {def && (
              <p class="small muted trip">
                A caravan takes {def.days} {def.days === 1 ? 'day' : 'days'} there and back.
              </p>
            )}
          </article>
        );
      })}
      <p class="muted small foot">
        You buy at a little over their price and sell at a little under it. The carts have to eat.
      </p>
    </div>
  );
}

const BLANK: StandingOrderInput = { min: 0, max: 40, floor: 0, ceiling: 0, neighbor: '' };

export function Orders({ session, trade }: { session: Session; trade: TradeView }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const tradable = new Set(trade.neighbors.flatMap((n) => n.prices.map((p) => p.good)));
  const free = [...tradable].filter((g) => !trade.orders.some((o) => o.good === g)).sort(goodOrder);
  const save = (good: string, order: StandingOrderInput | null) => {
    session.submit({ t: 'trade.setStandingOrder', good, order });
    setEditing(null);
    setAdding(false);
  };
  return (
    <div class="orders" data-testid="orders">
      <p class="intro muted small">
        Tell the post what to keep on hand. It sells the surplus and buys the shortfall, when the price suits.
      </p>
      {trade.orders.length === 0 && !adding && (
        <Empty>No standing orders. The post is twiddling its thumbs.</Empty>
      )}
      <ul class="order-list">
        {trade.orders.map((o) =>
          editing === o.good ? (
            <li key={o.good}>
              <OrderEditor
                session={session}
                good={o.good}
                start={o}
                onSave={save}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={o.good} class="order" data-testid={`order-${o.good}`}>
              <GoodIcon good={o.good} />
              <div class="order-text">
                <b>{goodName(o.good)}</b>
                <span class="small">{orderLine(o)}</span>
              </div>
              <button type="button" class="small-button" onClick={() => setEditing(o.good)}>
                Change
              </button>
            </li>
          ),
        )}
      </ul>
      {adding ? (
        <AddOrder session={session} goods={free} onSave={save} onCancel={() => setAdding(false)} />
      ) : (
        free.length > 0 && (
          <button
            type="button"
            class="small-button add"
            data-testid="order-add"
            onClick={() => setAdding(true)}
          >
            + A new standing order
          </button>
        )
      )}
    </div>
  );
}

function orderLine(o: Order): string {
  const where = o.neighbor ? ` with ${content.neighborById.get(o.neighbor)?.name ?? o.neighbor}` : '';
  const parts = [`Keep ${o.min} to ${o.max}${where}.`];
  if (o.floor) parts.push(`Sell only at ${priceText(o.floor)} coins or better.`);
  if (o.ceiling) parts.push(`Buy only at ${priceText(o.ceiling)} coins or less.`);
  return parts.join(' ');
}

function AddOrder({
  session,
  goods,
  onSave,
  onCancel,
}: {
  session: Session;
  goods: string[];
  onSave: (good: string, order: StandingOrderInput | null) => void;
  onCancel: () => void;
}) {
  const [good, setGood] = useState(goods[0] ?? '');
  return (
    <div class="order-add" data-testid="order-new">
      <div class="good-pick" role="radiogroup" aria-label="Good">
        {goods.map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={good === g}
            class={good === g ? 'active' : ''}
            title={goodName(g)}
            data-testid={`order-good-${g}`}
            onClick={() => setGood(g)}
          >
            <GoodIcon good={g} />
          </button>
        ))}
      </div>
      {good && (
        <OrderEditor session={session} good={good} start={BLANK} onSave={onSave} onCancel={onCancel} />
      )}
    </div>
  );
}

function OrderEditor({
  session,
  good,
  start,
  onSave,
  onCancel,
}: {
  session: Session;
  good: string;
  start: StandingOrderInput;
  onSave: (good: string, order: StandingOrderInput | null) => void;
  onCancel: () => void;
}) {
  const [o, setO] = useState<StandingOrderInput>({ ...start });
  const neighbors = session.mirror.trade.value?.neighbors ?? [];
  const base = content.goodById.get(good)?.basePrice ?? 100;
  const isNew = start === BLANK;
  return (
    <div class="order-editor" data-testid="order-editor">
      <h5>
        <GoodIcon good={good} /> {goodName(good)}
      </h5>
      <p class="lever-line">
        <span>Keep at least</span>
        <Stepper
          value={o.min}
          min={0}
          max={o.max}
          step={5}
          testid="order-min"
          onChange={(min) => setO({ ...o, min })}
        />
      </p>
      <p class="lever-line">
        <span>and at most</span>
        <Stepper
          value={o.max}
          min={o.min}
          max={500}
          step={5}
          testid="order-max"
          onChange={(max) => setO({ ...o, max })}
        />
      </p>
      <p class="lever-line">
        <span>Sell no cheaper than</span>
        <Stepper
          value={o.floor}
          min={0}
          max={base * 4}
          step={10}
          testid="order-floor"
          format={(v) => (v ? <Price pennies={v} /> : 'any')}
          onChange={(floor) => setO({ ...o, floor })}
        />
      </p>
      <p class="lever-line">
        <span>Buy no dearer than</span>
        <Stepper
          value={o.ceiling}
          min={0}
          max={base * 4}
          step={10}
          testid="order-ceiling"
          format={(v) => (v ? <Price pennies={v} /> : 'any')}
          onChange={(ceiling) => setO({ ...o, ceiling })}
        />
      </p>
      <p class="lever-line">
        <span>Deal with</span>
        <select
          value={o.neighbor}
          data-testid="order-neighbor"
          onChange={(e) => setO({ ...o, neighbor: (e.target as HTMLSelectElement).value })}
        >
          <option value="">whoever pays best</option>
          {neighbors.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </p>
      <div class="row-actions">
        {!isNew && (
          <button
            type="button"
            class="danger small-button"
            data-testid="order-remove"
            onClick={() => onSave(good, null)}
          >
            Drop it
          </button>
        )}
        <span class="spacer" />
        <button type="button" class="small-button" onClick={onCancel}>
          Never mind
        </button>
        <button
          type="button"
          class="primary small-button"
          data-testid="order-save"
          onClick={() => onSave(good, o)}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}

export function Caravans({ session, trade }: { session: Session; trade: TradeView }) {
  const now = session.mirror.tick.value;
  const name = (id: string) => content.neighborById.get(id)?.name ?? id;
  const log = [...trade.log].reverse().slice(0, 12);
  return (
    <div class="caravans" data-testid="caravans">
      {trade.caravans.length === 0 ? (
        <Empty>No caravans on the road. They leave at 8 in the morning when there is business.</Empty>
      ) : (
        <ul class="caravan-list">
          {trade.caravans.map((c) => {
            const span = Math.max(1, c.returnTick - c.departTick);
            const along = Math.max(0, Math.min(1, (now - c.departTick) / span));
            return (
              <li key={c.id} class="caravan" data-testid={`caravan-${c.id}`}>
                <header>
                  <Glyph id="caravan" />
                  <b>To {name(c.neighbor)}</b>
                  <span class="muted small">back {shortDate(c.returnTick)}</span>
                </header>
                <Meter value={along} tone="ochre" />
                <div class="caravan-goods small">
                  {c.selling.length > 0 && (
                    <span>
                      Taking{' '}
                      {c.selling.map(([g, q]) => (
                        <span key={g} class="good-inline">
                          <GoodIcon good={g} /> {q} {goodName(g).toLowerCase()}
                        </span>
                      ))}
                    </span>
                  )}
                  {c.buying.length > 0 && (
                    <span>
                      Bringing{' '}
                      {c.buying.map(([g, q]) => (
                        <span key={g} class="good-inline">
                          <GoodIcon good={g} /> {q} {goodName(g).toLowerCase()}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <h4 class="flourish">
        <span>The post&apos;s ledger</span>
      </h4>
      {log.length === 0 ? (
        <Empty>Not a single deal written down yet.</Empty>
      ) : (
        <table class="ledger-table trade-log" data-testid="trade-log">
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
                  {e.pennies >= 0 ? '+' : '−'}
                  <Price pennies={Math.abs(e.pennies)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
