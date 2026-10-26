import { content } from '@qoti/content';
import { MAX_SUBSIDY, type BuildingDetail, type MarketLine } from '@qoti/sim';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { buildingName, goodName } from '../format';
import { GoodIcon } from '../goodIcons';
import { Glyph } from '../icons';
import { coverText, goodOrder, inPlay, MOOD_WORD, priceMood } from '../village';
import { Empty, Frame, Sparkline, Toggle } from './parts';
import { Price, PriceChart, Stepper } from './villageParts';

/** The Ledger's market: what things cost today and lately, price caps on food, and profit per building. */
export function MarketPanel({ session }: { session: Session }) {
  const tab = session.ui.marketTab.value;
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame
      id="market"
      class="book-panel market"
      icon="market"
      kicker="The Ledger"
      title="Market"
      onClose={close}
    >
      <div class="tabs" role="tablist">
        {(
          [
            ['prices', 'Prices'],
            ['profit', 'Profit'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            class={tab === id ? 'active' : ''}
            data-testid={`market-${id}`}
            onClick={() => (session.ui.marketTab.value = id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="tab-body">
        {tab === 'prices' ? <Prices session={session} /> : <Profit session={session} />}
      </div>
    </Frame>
  );
}

export function Prices({ session }: { session: Session }) {
  const market = session.mirror.market.value;
  const [all, setAll] = useState(false);
  if (!market) return <Empty>No market in a creative valley. Everything is free and nobody haggles.</Empty>;
  const focus = session.ui.marketGood.value;
  const lines = market.lines
    .filter((l) => all || inPlay(l) || l.good === focus)
    .sort((a, b) => goodOrder(a.good, b.good));
  const selected = focus ? market.lines.find((l) => l.good === focus) : undefined;
  return (
    <div class="prices" data-testid="prices">
      {selected ? (
        <GoodCard session={session} line={selected} />
      ) : (
        <p class="intro muted small">
          Prices follow the stalls: short goods grow dear, plenty grows cheap. Pick one for its story.
        </p>
      )}
      {lines.length === 0 ? (
        <Empty>Nobody is buying anything yet. The stallholders are doing crosswords.</Empty>
      ) : (
        <ul class="price-list">
          {lines.map((l) => {
            const mood = priceMood(l.price, l.base);
            return (
              <li key={l.good}>
                <button
                  type="button"
                  class={`price-row ${focus === l.good ? 'active' : ''}`}
                  data-testid={`price-${l.good}`}
                  aria-pressed={focus === l.good}
                  onClick={() => (session.ui.marketGood.value = focus === l.good ? null : l.good)}
                >
                  <GoodIcon good={l.good} />
                  <span class="price-name">{goodName(l.good)}</span>
                  <Sparkline values={[...l.history, l.price]} width={64} height={18} />
                  <Price pennies={l.price} />
                  <span class={`mood-chip mood-${mood}`}>{MOOD_WORD[mood]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Toggle
        on={all}
        label={all ? 'Showing every good' : 'Show goods nobody is trading yet'}
        testid="prices-all"
        onChange={setAll}
      />
    </div>
  );
}

/** One good drawn large: its chart, how much is in store, and the cap and subsidy on food. */
function GoodCard({ session, line }: { session: Session; line: MarketLine }) {
  const good = content.goodById.get(line.good);
  const mood = priceMood(line.price, line.base);
  const history = [...line.history, line.price];
  const food = !!good?.food;
  const set = (cap: number, subsidy: number) =>
    session.submit({ t: 'ledger.setPriceCap', good: line.good, cap, subsidy });
  const capOn = line.cap > 0;
  return (
    <div class="good-card" data-testid="good-card">
      <header>
        <GoodIcon good={line.good} class="big" />
        <div>
          <h4>{good?.name ?? line.good}</h4>
          <p class="small muted">
            <Price pennies={line.price} /> today, usually <Price pennies={line.base} />.{' '}
            <span class={`mood-chip mood-${mood}`}>{MOOD_WORD[mood]}</span>
          </p>
        </div>
        <button
          type="button"
          class="close"
          title="Back to the list"
          data-testid="good-card-close"
          onClick={() => (session.ui.marketGood.value = null)}
        >
          ×
        </button>
      </header>
      <PriceChart values={history} base={line.base} cap={line.cap} />
      <p class="small">
        Households wanted <b>{line.demand}</b> yesterday, with {coverText(line.cover, line.demand)}.
      </p>
      {food && (
        <div class="levers-box" data-testid="price-levers">
          <Toggle
            on={capOn}
            label={capOn ? 'Price capped' : 'Cap the price at the stalls'}
            testid="cap-toggle"
            onChange={(on) =>
              set(on ? Math.max(line.base, Math.round(line.price / 10) * 10) : 0, line.subsidy)
            }
          />
          {capOn && (
            <p class="lever-line">
              <span>No dearer than</span>
              <Stepper
                value={line.cap}
                min={10}
                max={line.base * 3}
                step={10}
                testid="cap"
                label="Price cap"
                format={(v) => <Price pennies={v} />}
                onChange={(v) => set(v, line.subsidy)}
              />
            </p>
          )}
          <p class="lever-line">
            <span>The treasury pays</span>
            <Stepper
              value={line.subsidy}
              min={0}
              max={MAX_SUBSIDY}
              step={5}
              testid="subsidy"
              label="Subsidy"
              format={(v) => `${v}%`}
              onChange={(v) => set(line.cap, v)}
            />
          </p>
          <p class="muted small">
            {line.subsidy > 0
              ? `Households pay ${100 - line.subsidy}% at the stall; the treasury covers the rest.`
              : 'A subsidy takes a share of the price off every basket, paid from the treasury.'}
          </p>
        </div>
      )}
    </div>
  );
}

interface ProfitRow {
  id: number;
  def: string;
  perDay: number;
  lines: { label: string; pennies: number }[];
}

/** Asks the worker for every workplace's profit, refreshed while the page is open. */
function useProfits(session: Session): ProfitRow[] | null {
  const m = session.mirror;
  const [rows, setRows] = useState<ProfitRow[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const ids = [...m.buildings.values()]
        .filter((b) => b.stage === 'built' && (b.rt?.jobs ?? 0) > 0)
        .filter((b) => content.buildingById.get(b.def)?.methods?.length)
        .map((b) => b.id);
      const out: ProfitRow[] = [];
      for (const id of ids) {
        const d = (await session.inspect('building', id)) as BuildingDetail | null;
        if (d?.profit) out.push({ id, def: d.b.def, perDay: d.profit.perDay, lines: d.profit.lines });
      }
      if (live) setRows(out.sort((a, b) => b.perDay - a.perDay || a.id - b.id));
    };
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [session]);
  return rows;
}

export function Profit({ session }: { session: Session }) {
  const rows = useProfits(session);
  const [open, setOpen] = useState<number | null>(null);
  if (!rows) return <Empty>Totting up the workshops...</Empty>;
  if (!rows.length) return <Empty>No workshops to weigh up yet.</Empty>;
  const most = Math.max(1, ...rows.map((r) => Math.abs(r.perDay)));
  const select = (id: number) => {
    const b = session.mirror.buildings.get(id);
    if (!b) return;
    session.ui.selection.value = { kind: 'building', id };
    session.render?.focus(b.x, b.z);
  };
  return (
    <div class="profit" data-testid="profit">
      <p class="intro muted small">
        A day of each workshop: what it makes at today&apos;s prices, less what it uses, its wages and upkeep.
      </p>
      <ul class="profit-list">
        {rows.map((r) => {
          const share = Math.abs(r.perDay) / most;
          return (
            <li key={r.id} class={r.perDay >= 0 ? 'gain' : 'loss'} data-testid={`profit-${r.id}`}>
              <button type="button" class="profit-row" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span class="profit-name">{buildingName(r.def)}</span>
                <span class="profit-bar" aria-hidden="true">
                  <i style={{ width: `${(share * 50).toFixed(1)}%` }} />
                </span>
                <b class={r.perDay >= 0 ? 'plus' : 'minus'}>
                  {r.perDay >= 0 ? '+' : '−'}
                  <Price pennies={Math.abs(r.perDay)} />
                </b>
              </button>
              {open === r.id && (
                <div class="profit-lines">
                  {r.lines.map((l) => (
                    <p key={l.label}>
                      <span>{l.label}</span>
                      <span class={l.pennies >= 0 ? 'plus' : 'minus'}>
                        {l.pennies >= 0 ? '+' : '−'}
                        <Price pennies={Math.abs(l.pennies)} />
                      </span>
                    </p>
                  ))}
                  <button type="button" class="link small" onClick={() => select(r.id)}>
                    <Glyph id="inspect" /> Show me
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p class="muted small foot">
        Everything belongs to the town, so this is a signal, not a till. A workshop in the red may still be
        the only one making bread.
      </p>
    </div>
  );
}
