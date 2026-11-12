// A good drawn large: its price chart, how much is in store, and, for food, the price cap and the
// subsidy. These levers belong to the Purse book (R1C, later); until it lands they live here, one
// click from a flavor in the Balances book.
import { content } from '@qoti/content';
import { MAX_SUBSIDY, type MarketLine } from '@qoti/sim';
import type { Session } from '../../app/session';
import { GoodIcon } from '../goodIcons';
import { coverText, MOOD_WORD, priceMood } from '../village';
import { Toggle } from './parts';
import { Price, PriceChart, Stepper } from './villageParts';

/** One good drawn large: its chart, how much is in store, and the cap and subsidy on food. */
export function GoodCard({ session, line }: { session: Session; line: MarketLine }) {
  const good = content.goodById.get(line.good);
  const mood = priceMood(line.price, line.base);
  const history = [...line.history, line.price];
  const food = good?.family === 'food';
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
            <Price pennies={line.price} /> today (usually <Price pennies={line.base} />){' '}
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
