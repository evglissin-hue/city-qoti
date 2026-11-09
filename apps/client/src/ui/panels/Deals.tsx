import { content } from '@qoti/content';
import type { TradeView } from '@qoti/sim';
import type { Session } from '../../app/session';
import {
  dealOrder,
  isManagedDeal,
  orderSide,
  stockOf,
  toggleDeal,
  townFor,
  type DealSide,
  type DealVia,
} from '../deals';
import { goodName } from '../format';
import { GoodIcon } from '../goodIcons';
import { Glyph } from '../icons';
import { goodOrder } from '../village';
import { Empty } from './parts';
import { Price } from './villageParts';

/** One neighbor's goods as deals: what they want of ours, what they sell us, a toggle on each. */
export function DealList({
  session,
  neighborId,
  via,
  trade,
  off,
}: {
  session: Session;
  neighborId: string;
  via: DealVia;
  trade: TradeView | null;
  /** A reason the toggles cannot be used right now (a frozen river), or null. */
  off?: string | null;
}) {
  const def = content.neighborById.get(neighborId);
  if (!def) return null;
  const prices = trade?.neighbors.find((n) => n.id === neighborId)?.prices ?? [];
  const orders = via === 'dock' ? (session.mirror.dock.value?.orders ?? []) : (trade?.orders ?? []);
  const row = (good: string, factor: number, side: DealSide) => {
    const town = townFor(session, good);
    const stock = stockOf(session, good);
    const sellMax = dealOrder(good, 'sell', town, neighborId).max;
    const buyMin = dealOrder(good, 'buy', town, neighborId).min;
    const live = orders.find((o) => o.good === good);
    const nbr = live && 'neighbor' in live ? String(live.neighbor) : '';
    const on = !!live && orderSide(live) === side && (via === 'dock' || nbr === neighborId);
    const hand =
      on && !isManagedDeal(good, { ...live, neighbor: nbr }, session.ui.dealMarks.get(`${via}:${good}`));
    const price = prices.find((p) => p.good === good);
    const coin = side === 'sell' ? price?.sell : price?.buy;
    const flag =
      side === 'sell' && stock > sellMax
        ? `${stock - sellMax} spare`
        : side === 'buy' && stock < buyMin
          ? 'running short'
          : '';
    const gap = factor - 100;
    return (
      <li
        key={`${side}-${good}`}
        class={on ? 'deal-row on' : 'deal-row'}
        data-testid={`deal-${neighborId}-${good}`}
      >
        <GoodIcon good={good} />
        <span class="deal-name">
          {goodName(good)}
          <i class="small muted">{` ${gap >= 0 ? '+' : '-'}${Math.abs(gap)}%`}</i>
        </span>
        {via === 'post' && coin != null ? <Price pennies={coin} /> : <span />}
        <span class={`deal-flag small ${flag ? 'yes' : ''}`} data-testid={`deal-flag-${neighborId}-${good}`}>
          {flag}
        </span>
        <button
          type="button"
          class={`small-button deal-toggle ${on ? 'primary' : ''}`}
          aria-pressed={on}
          disabled={!!off}
          title={off ?? (hand ? 'Set by hand in Standing orders; the post leaves it be' : undefined)}
          data-testid={`deal-toggle-${neighborId}-${good}`}
          onClick={() => toggleDeal(session, via, good, side, neighborId)}
        >
          {on ? 'On: ' : ''}
          {side === 'sell' ? 'Sell our spare' : 'Keep us stocked'}
        </button>
        {hand && <span class="small muted deal-hand">set by hand</span>}
      </li>
    );
  };
  const wants = [...def.buys].sort((a, b) => b[1] - a[1] || goodOrder(a[0], b[0]));
  const sells = [...def.sells].sort((a, b) => a[1] - b[1] || goodOrder(a[0], b[0]));
  return (
    <div class="deal-lists">
      <div>
        <span class="label">They want</span>
        <ul class="deal-rows">{wants.map(([g, f]) => row(g, f, 'sell'))}</ul>
      </div>
      <div>
        <span class="label">They sell</span>
        <ul class="deal-rows">{sells.map(([g, f]) => row(g, f, 'buy'))}</ul>
      </div>
    </div>
  );
}

/** The overview: each neighbor in a line, what they want, what they sell, one switch for each. */
export function Deals({ session, trade }: { session: Session; trade: TradeView }) {
  return (
    <div class="deals" data-testid="deals">
      <p class="intro muted small">
        Switch a deal on and the post does the haggling. It works out how much to keep and what price is worth
        taking, and keeps those numbers fresh as the town grows. You never touch a price.
      </p>
      {!trade.postId && (
        <p class="post-note" data-testid="deals-peddler">
          <Glyph id="caravan" />
          <span>
            Until there is a Trading Post, the peddler fills a little of this at a worse price; build the post
            for caravans.
          </span>
        </p>
      )}
      {trade.neighbors.length === 0 && <Empty>Nobody trades with a hamlet this small. Yet.</Empty>}
      {trade.neighbors.map((n) => {
        const def = content.neighborById.get(n.id);
        return (
          <article key={n.id} class="neighbor-card deal-card" data-testid={`deals-${n.id}`}>
            <header>
              <span class="neighbor-crest" aria-hidden="true">
                {n.name.slice(0, 1)}
              </span>
              <div>
                <h4>
                  {n.name}
                  {def && (
                    <span class="small muted trip-days">
                      {` ${def.days} ${def.days === 1 ? 'day' : 'days'} away`}
                    </span>
                  )}
                </h4>
                <p class="small muted">{def?.character ?? n.blurb}</p>
              </div>
            </header>
            <DealList session={session} neighborId={n.id} via="post" trade={trade} />
          </article>
        );
      })}
    </div>
  );
}
