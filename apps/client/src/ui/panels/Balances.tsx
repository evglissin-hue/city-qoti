// R1C: the Balances book. Where the five families stand (days of cover, what is on offer, what it
// costs, what the carrier moved), the carrier's terms for each, its purse and this season's deals,
// and, on the second tab, the neighbors it trades with. It replaces the Market, Trade and Dock books.
import { content } from '@qoti/content';
import {
  CARRIER_BUDGET_MAX,
  CARRIER_RESERVE_MAX,
  GOOD_FAMILIES,
  PENNIES_PER_COIN,
  calendar,
  methodOf,
  type BalanceLine,
  type BalancesView,
  type CarrierRule,
  type DealOffer,
} from '@qoti/sim';
import { useEffect } from 'preact/hooks';
import type { Session } from '../../app/session';
import { coins, goodName } from '../format';
import { GoodIcon } from '../goodIcons';
import { Glyph } from '../icons';
import { neighborName } from '../seasons';
import type { BalancesTab } from '../state';
import { FAMILY_WORD } from '../village';
import './balances.css';
import { CommissionsTab, DockTab, Neighbors, TradeLog } from './balancesNeighbors';
import { GoodCard } from './GoodCard';
import { Empty, Frame, Heading, Sparkline, Toggle } from './parts';
import { Dial, Price, Stepper } from './villageParts';

import { FAMILY_ICON } from '../topbar/families';
export { FAMILY_ICON };

export const RULE_WORD: Record<CarrierRule, string> = {
  always: 'Always',
  essentials: 'Essentials only',
  never: 'Never',
};

const RULES: CarrierRule[] = ['always', 'essentials', 'never'];
/** Days of cover a bar shows full. */
const FULL_DAYS = 10;

/** Cover as the small number: "4", "99+". */
export function daysText(line: Pick<BalanceLine, 'cover' | 'use' | 'stock'>): string {
  if (line.use <= 0) return line.stock > 0 ? '99+' : '0';
  const d = Math.floor(line.cover / 100);
  return d > 99 ? '99+' : String(d);
}

/** True while the family sits under its reserve (Materials hold units, not days). */
export function underReserve(line: BalanceLine): boolean {
  if (line.family === 'materials') return false;
  const goal = line.mark ?? line.reserve;
  return line.use > 0 && line.cover < goal * 100;
}

function plural(name: string, n: number): string {
  return n === 1 || name.endsWith('s') ? name : `${name}s`;
}

/** "2 bakers, 1 grain farm": who makes a good here, from the built businesses and specialized buildings. */
export function makersText(session: Session, good: string): string {
  const m = session.mirror;
  void m.villageRevision.value;
  const counts = new Map<string, number>();
  for (const b of m.buildings.values()) {
    if (b.stage !== 'built') continue;
    let name: string | null = null;
    if (b.trade) {
      const t = content.tradeById.get(b.trade);
      if (t?.makes === good) name = t.name.toLowerCase();
    } else {
      const def = content.buildingById.get(b.def);
      if (def?.specialized && methodOf(b)?.outputs.some(([g]) => g === good)) name = def.name.toLowerCase();
    }
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, n]) => `${n} ${plural(name, n)}`).join(', ');
}

export function BalancesPanel({ session }: { session: Session }) {
  const ui = session.ui;
  const tab = ui.balancesTab.value;
  const view = session.mirror.balances.value;
  const close = () => (ui.panel.value = null);
  // A chip that opens a family wants the Families tab.
  const waiting = ui.balancesFamily.value;
  useEffect(() => {
    if (waiting && ui.balancesTab.value !== 'families') ui.balancesTab.value = 'families';
  }, [waiting]);
  return (
    <Frame
      id="balances"
      class="book-panel balances"
      icon="chart"
      kicker="The Ledger"
      title="Balances"
      onClose={close}
    >
      <CarrierHead session={session} view={view} />
      <div class="tabs" role="tablist">
        {(
          [
            ['families', 'Families'],
            ['neighbors', 'Neighbors'],
          ] as [BalancesTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            class={tab === id ? 'active' : ''}
            data-testid={`balances-${id}`}
            onClick={() => (ui.balancesTab.value = id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="tab-body">
        {tab === 'neighbors' ? (
          <NeighborsTab session={session} />
        ) : !view ? (
          <Empty>No Ledger in a creative valley. Everything is free and nobody haggles.</Empty>
        ) : (
          <Families session={session} view={view} />
        )}
      </div>
    </Frame>
  );
}

function CarrierHead({ session, view }: { session: Session; view: BalancesView | null }) {
  if (!view) return null;
  const hour = calendar(session.mirror.tick.value).hour;
  const spent = Math.round(view.spentToday / PENNIES_PER_COIN);
  const budget = Math.round(view.budget / PENNIES_PER_COIN);
  return (
    <p class="intro muted small carrier-head" data-testid="carrier-head">
      {view.passClosed
        ? 'Snow has closed the pass: no carrier today.'
        : `The carrier ${hour < 10 ? 'comes' : 'came'} at ten. ${spent} of ${budget} coins spent today.`}
    </p>
  );
}

function Families({ session, view }: { session: Session; view: BalancesView }) {
  const open = session.ui.balancesFamily.value;
  return (
    <div class="families" data-testid="families">
      <ul class="family-list">
        {view.lines.map((line) => (
          <FamilyRow key={line.family} session={session} line={line} open={open === line.family} />
        ))}
      </ul>
      <CarrierPurse session={session} view={view} />
      <Deals session={session} view={view} />
    </div>
  );
}

function CoverBar({ line }: { line: BalanceLine }) {
  const pct = (days: number) => `${(Math.max(0, Math.min(1, days / FULL_DAYS)) * 100).toFixed(1)}%`;
  const showReserve = line.family !== 'materials' && line.reserve > 0;
  return (
    <span class={`cover-bar ${underReserve(line) ? 'low' : ''}`} aria-hidden="true">
      <i class="fill" style={{ width: pct(line.cover / 100) }} />
      {showReserve && <i class="tick reserve" style={{ left: pct(line.reserve) }} />}
      {line.mark !== null && <i class="tick mark" style={{ left: pct(line.mark) }} />}
    </span>
  );
}

function FamilyRow({ session, line, open }: { session: Session; line: BalanceLine; open: boolean }) {
  const toggle = () => (session.ui.balancesFamily.value = open ? null : line.family);
  const history = line.history.slice(-365);
  return (
    <li class={`family-row ${open ? 'open' : ''}`} data-testid={`balance-row-${line.family}`}>
      <button type="button" class="family-head" aria-expanded={open} onClick={toggle}>
        <span class="family-name">
          <GoodIcon good={FAMILY_ICON[line.family]} />
          <b>{FAMILY_WORD[line.family]}</b>
        </span>
        <CoverBar line={line} />
        <span class="days" title={`${(line.cover / 100).toFixed(1)} days of cover`}>
          {daysText(line)}
        </span>
        <Price pennies={line.price} />
        <span class="pips" aria-label="Flavors on offer">
          {line.flavors.map((f) => (
            <span
              key={f.good}
              class={`pip ${f.onOffer ? 'on' : 'off'}`}
              title={`${goodName(f.good)}: ${f.onOffer ? 'on offer' : 'not on offer'}`}
            >
              <GoodIcon good={f.good} />
            </span>
          ))}
        </span>
        <span class="carried small muted">
          +{line.carriedIn} in, {line.carriedOut} out
        </span>
        <Sparkline values={history} width={64} height={18} />
      </button>
      {open && <FamilyDetail session={session} line={line} />}
    </li>
  );
}

function FamilyDetail({ session, line }: { session: Session; line: BalanceLine }) {
  const f = GOOD_FAMILIES.indexOf(line.family);
  const focus = session.ui.marketGood.value;
  const selected = line.flavors.find((x) => x.good === focus);
  const marketLine = selected
    ? session.mirror.market.value?.lines.find((l) => l.good === selected.good)
    : undefined;
  const setTerms = (rule: CarrierRule, sell: boolean) =>
    session.submit({ t: 'carrier.setRule', family: line.family, rule, sell });
  const materials = line.family === 'materials';
  const makers = line.flavors.map((fl) => makersText(session, fl.good)).filter(Boolean);
  return (
    <div class="family-detail" data-testid={`balance-detail-${line.family}`}>
      <p class="small muted">
        {line.stock} in store, {line.use} used a day.
        {line.carriedInYesterday + line.carriedOutYesterday > 0 &&
          ` Yesterday the carrier brought ${line.carriedInYesterday} and took ${line.carriedOutYesterday}.`}
      </p>
      <ul class="flavor-list">
        {line.flavors.map((fl) => {
          const by = makersText(session, fl.good);
          return (
            <li key={fl.good}>
              <button
                type="button"
                class={`flavor ${focus === fl.good ? 'active' : ''}`}
                data-testid={`flavor-${fl.good}`}
                aria-pressed={focus === fl.good}
                onClick={() => (session.ui.marketGood.value = focus === fl.good ? null : fl.good)}
              >
                <GoodIcon good={fl.good} />
                <span class="flavor-name">{goodName(fl.good)}</span>
                <span class="flavor-stock">{fl.stock}</span>
                <span class={`flavor-offer ${fl.onOffer ? 'on' : ''}`}>
                  {fl.onOffer ? 'on offer' : 'not on offer'}
                </span>
                <span class="flavor-made small muted">
                  {fl.made || by ? 'made here' : 'comes by carrier'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p class="small muted who-makes" data-testid={`makers-${line.family}`}>
        {makers.length ? `Made here by ${makers.join('; ')}.` : 'Nobody makes it here yet.'}
      </p>
      {marketLine && <GoodCard session={session} line={marketLine} />}
      <div class="terms" data-testid={`terms-${line.family}`}>
        <h5 class="small muted">The carrier&apos;s terms</h5>
        <Dial
          label={`${FAMILY_WORD[line.family]}: the carrier's rule`}
          testid={`rule-${line.family}`}
          value={line.rule}
          options={RULES.map((r) => ({ value: r, label: RULE_WORD[r] }))}
          onChange={(rule) => setTerms(rule, line.sell)}
        />
        <p class="lever-line">
          <span>{materials ? 'Hold, beyond what sites need' : 'Hold'}</span>
          <Stepper
            value={line.reserve}
            min={0}
            max={CARRIER_RESERVE_MAX[f]!}
            step={materials ? 5 : 1}
            testid={`reserve-${line.family}`}
            label="Reserve"
            format={(v) => (materials ? `${v}` : `${v} ${v === 1 ? 'day' : 'days'}`)}
            onChange={(reserve) => session.submit({ t: 'carrier.setReserve', family: line.family, reserve })}
          />
        </p>
        <Toggle
          on={line.sell}
          label="Sell the surplus"
          testid={`sell-${line.family}`}
          onChange={(sell) => setTerms(line.rule, sell)}
        />
        <p class="small muted">
          {line.mark !== null
            ? `A winter mark of ${line.mark} days stands in for the reserve until the thaw.`
            : 'It sells what is over twice the reserve, never what a festival put by.'}
        </p>
      </div>
    </div>
  );
}

function CarrierPurse({ session, view }: { session: Session; view: BalancesView }) {
  const budget = Math.round(view.budget / PENNIES_PER_COIN);
  const post = [...session.mirror.buildings.values()].some(
    (b) => b.stage === 'built' && content.buildingById.get(b.def)?.tags?.includes('trading-post'),
  );
  return (
    <section class="carrier-purse" data-testid="carrier-purse">
      <Heading>The carrier&apos;s purse</Heading>
      <p class="lever-line">
        <span>Spend up to</span>
        <Stepper
          value={budget}
          min={0}
          max={CARRIER_BUDGET_MAX}
          step={5}
          testid="budget"
          label="Carrier budget"
          format={(v) => `${v} ${v === 1 ? 'coin' : 'coins'}`}
          onChange={(c) => session.submit({ t: 'carrier.setBudget', coins: c })}
        />
        <span class="small muted">a day</span>
      </p>
      {view.tab > 0 && (
        <p class="small tab-line" data-testid="county-tab">
          {coins(view.tab)} owed on the County tab, of {coins(view.tabCap)} it allows. It is paid back like a
          loan.
        </p>
      )}
      <p class="small muted">
        {post
          ? 'The Trading Post gives the carrier a bigger cart and better terms.'
          : 'The peddler carries little and takes a fat cut. A Trading Post by the valley road would help.'}
      </p>
    </section>
  );
}

function offerText(o: DealOffer): string {
  const who = neighborName(o.neighbor);
  const fam = FAMILY_WORD[o.family];
  return o.side === 'sell'
    ? `${who} buys our ${fam} at ${o.percent}% this season`
    : `${who} sells us ${fam} at ${o.percent}% this season`;
}

function Deals({ session, view }: { session: Session; view: BalancesView }) {
  return (
    <section class="deals" data-testid="deals">
      <Heading>Deals this season</Heading>
      {view.offers.length === 0 ? (
        <p class="small muted">No offers this season.</p>
      ) : (
        <ul class="deal-list">
          {view.offers.map((o) => (
            <li key={o.id}>
              <Toggle
                on={view.plan.deal === o.id}
                label={offerText(o)}
                testid={`deal-${o.id}`}
                onChange={(on) => session.submit({ t: 'season.setPlan', plan: { deal: on ? o.id : null } })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NeighborsTab({ session }: { session: Session }) {
  const trade = session.mirror.trade.value;
  if (!trade) return <Empty>No trade in a creative valley.</Empty>;
  return (
    <div class="neighbors-tab">
      {!trade.postId && (
        <p class="post-note" data-testid="no-post">
          <Glyph id="caravan" />
          <span>
            No Trading Post yet. The carrier still calls at the valley gate; a post by the valley road gets
            better prices.
          </span>
        </p>
      )}
      <Neighbors session={session} trade={trade} />
      <Heading>The river</Heading>
      <DockTab session={session} />
      <Heading>Commissions</Heading>
      <CommissionsTab session={session} />
      <Heading>Trade log</Heading>
      <TradeLog trade={trade} />
    </div>
  );
}
