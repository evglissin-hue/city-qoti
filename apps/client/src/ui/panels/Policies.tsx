import { content } from '@qoti/content';
import {
  LOAN_RATE,
  PENNIES_PER_COIN,
  TAX_RATE_RANGE,
  TIERS,
  WAGE_LEVEL_RANGE,
  wagesAt,
  type LoansView,
} from '@qoti/sim';
import { useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { coins, shortDate, thousands } from '../format';
import { TIER_WORD } from '../hamlet';
import { Glyph } from '../icons';
import { RANK_WORD, rankAtLeast } from '../village';
import { Empty, Frame, Heading, Meter } from './parts';
import { Dial, Locked, Stepper } from './villageParts';

const WAGE_STEPS = [80, 90, 100, 110, 120] as const;
const TAX_STEPS = [0, 5, 10, 15, 20] as const;

const WAGE_WORD: Record<number, string> = {
  80: 'Tight. The treasury breathes easier; the households do not.',
  90: 'A touch lean. Nobody is complaining out loud.',
  100: 'The going rate. Fair pay for a fair day.',
  110: 'Generous. Baskets fill up and savings grow.',
  120: 'Lavish. The whole valley is buying cake.',
};

/** Wages paid per day across today's workforce, by the tier of each job, pennies. */
export function wageBill(session: Session, level: number): number {
  const wages = wagesAt(level);
  let bill = 0;
  for (const b of session.mirror.buildings.values()) {
    const workers = b.rt?.workers ?? 0;
    if (!workers) continue;
    const tier = content.buildingById.get(b.def)?.jobs?.tier ?? 'settler';
    bill += workers * (wages[Math.max(0, TIERS.indexOf(tier))] ?? 0);
  }
  return bill;
}

/** The Ledger's levers: wage level, income tax, and the County Bank. */
export function PoliciesPanel({ session }: { session: Session }) {
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame
      id="policies"
      class="book-panel policies"
      icon="policies"
      kicker="The Ledger"
      title="Policies"
      onClose={close}
    >
      <WagesAndTaxes session={session} />
      <Loans session={session} />
    </Frame>
  );
}

export function WagesAndTaxes({ session }: { session: Session }) {
  const levers = session.mirror.levers.value;
  if (!levers) return <Empty>No wages to set in a creative valley. Everyone works for the joy of it.</Empty>;
  const tiers = session.mirror.town.value?.tiers ?? [];
  const shown = TIERS.filter((_, i) => i === 0 || (tiers[i] ?? 0) > 0);
  const bill = wageBill(session, levers.wageLevel);
  const back = Math.round((bill * levers.taxRate) / 100);
  const setWage = (percent: number) => session.submit({ t: 'ledger.setWageLevel', percent });
  const setTax = (percent: number) => session.submit({ t: 'ledger.setTaxRate', percent });
  return (
    <section class="policy" data-testid="wages">
      <Heading>
        <Glyph id="wages" /> Wages
      </Heading>
      <Dial
        label="Wage level"
        testid="wage"
        value={levers.wageLevel}
        options={WAGE_STEPS.map((v) => ({ value: v, label: `${v}%` }))}
        onChange={setWage}
      />
      <p class="policy-word">{WAGE_WORD[levers.wageLevel] ?? 'Somewhere in between.'}</p>
      <ul class="wage-tiers">
        {shown.map((t) => (
          <li key={t}>
            <span>{TIER_WORD[t]}</span>
            <b>{coins(levers.wages[TIERS.indexOf(t)] ?? 0)}</b>
            <span class="muted"> a day</span>
          </li>
        ))}
      </ul>
      {!WAGE_STEPS.includes(levers.wageLevel as (typeof WAGE_STEPS)[number]) && (
        <p class="muted small">Set to {levers.wageLevel}% by hand.</p>
      )}
      <Heading>
        <Glyph id="coin" /> Income tax
      </Heading>
      <p class="lever-line">
        <span>Of every wage, back to the treasury</span>
        <Stepper
          value={levers.taxRate}
          min={TAX_RATE_RANGE[0]}
          max={TAX_RATE_RANGE[1]}
          step={1}
          testid="tax"
          label="Income tax"
          format={(v) => `${v}%`}
          onChange={setTax}
        />
      </p>
      <Dial
        label="Income tax presets"
        testid="tax-preset"
        value={levers.taxRate}
        options={TAX_STEPS.map((v) => ({ value: v, label: `${v}%` }))}
        onChange={setTax}
      />
      <div class="sum-card" data-testid="wage-bill">
        <p>
          <span>Wages, about</span>
          <b>{coins(bill)}</b>
          <span class="muted">a day</span>
        </p>
        <p>
          <span>Back in tax</span>
          <b>{coins(back)}</b>
          <span class="muted">a day</span>
        </p>
      </div>
      <p class="muted small">
        Wages leave the treasury at five in the evening and come back when households shop. Tax takes its
        share on the way out.
      </p>
      <p class="sr-only">
        Wage level ranges from {WAGE_LEVEL_RANGE[0]} to {WAGE_LEVEL_RANGE[1]} percent.
      </p>
    </section>
  );
}

const BORROW_STEPS = [50, 100, 250, 500] as const;

export function Loans({ session }: { session: Session }) {
  const loans = session.mirror.loans.value;
  const town = session.mirror.town.value;
  const treasury = session.mirror.budget.value?.treasury ?? town?.treasury ?? 0;
  const [amount, setAmount] = useState<number>(100);
  if (!loans) return null;
  const open = rankAtLeast(town?.rank, 'village');
  const available = Math.floor(loans.available / PENNIES_PER_COIN);
  const borrow = Math.min(amount, available);
  return (
    <section class="policy loans" data-testid="loans">
      <Heading>
        <Glyph id="loan" /> The County Bank
      </Heading>
      {!open ? (
        <Locked testid="loans-locked">
          The bank lends to villages, not hamlets. Claim the {RANK_WORD.village} Charter and they will find a
          chair for you.
        </Locked>
      ) : (
        <>
          <Meter
            label="Credit"
            value={loans.owed / Math.max(1, loans.owed + loans.available)}
            note={`${coins(loans.owed)} owed, ${coins(loans.available)} more on offer`}
            tone="ochre"
            testid="credit"
          />
          <LoanList session={session} loans={loans} treasury={treasury} />
          {available > 0 ? (
            <div class="borrow" data-testid="borrow">
              <p class="lever-line">
                <span>Borrow</span>
                <Stepper
                  value={borrow}
                  min={10}
                  max={available}
                  step={10}
                  testid="borrow-amount"
                  label="Borrow"
                  format={(v) => `${thousands(v)} coins`}
                  onChange={setAmount}
                />
              </p>
              <Dial
                label="Borrow presets"
                testid="borrow-preset"
                value={borrow}
                options={BORROW_STEPS.map((v) => ({ value: v, label: v, disabled: v > available }))}
                onChange={setAmount}
              />
              <p class="muted small">
                {LOAN_RATE}% added each season until it is paid back. Pay early whenever you like.
              </p>
              <button
                type="button"
                class="primary"
                data-testid="borrow-take"
                onClick={() => session.submit({ t: 'loan.take', coins: borrow })}
              >
                Borrow {thousands(borrow)} coins
              </button>
            </div>
          ) : (
            <p class="muted small">The bank has lent all it cares to for now.</p>
          )}
        </>
      )}
    </section>
  );
}

function LoanList({ session, loans, treasury }: { session: Session; loans: LoansView; treasury: number }) {
  if (!loans.loans.length) return <p class="muted small">Nothing owed. The bank manager sends regards.</p>;
  return (
    <ul class="loan-list">
      {loans.loans.map((l) => {
        const paid = 1 - l.balance / Math.max(1, Math.max(l.principal, l.balance));
        const all = Math.ceil(l.balance / PENNIES_PER_COIN);
        const some = Math.min(all, 50);
        return (
          <li key={l.id} class="loan" data-testid={`loan-${l.id}`}>
            <div class="loan-head">
              <b>{coins(l.balance)}</b>
              <span class="muted small">
                left of {coins(l.principal)}, from {shortDate(l.takenTick)}, {l.rate}% a season
              </span>
            </div>
            <Meter value={paid} tone="sage" />
            <div class="row-actions">
              {all > some && (
                <button
                  type="button"
                  class="small-button"
                  disabled={treasury < some * PENNIES_PER_COIN}
                  data-testid={`repay-some-${l.id}`}
                  onClick={() => session.submit({ t: 'loan.repay', id: l.id, coins: some })}
                >
                  Pay {some}
                </button>
              )}
              <button
                type="button"
                class="small-button"
                disabled={treasury < l.balance}
                title={treasury < l.balance ? 'Not enough in the treasury' : undefined}
                data-testid={`repay-all-${l.id}`}
                onClick={() => session.submit({ t: 'loan.repay', id: l.id, coins: all })}
              >
                Pay it all
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
