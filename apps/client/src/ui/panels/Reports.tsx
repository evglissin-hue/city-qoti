import { content } from '@qoti/content';
import type { BudgetLine, BuildingView } from '@qoti/sim';
import { useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { buildingName, coinCount, coins, goodName } from '../format';
import { statusWords } from '../hamlet';
import type { ReportTab } from '../state';
import { Empty, Frame, Sparkline, Toggle } from './parts';

const TABS: [ReportTab, string][] = [
  ['stocks', 'Stocks'],
  ['workforce', 'Workforce'],
  ['budget', 'Budget'],
  ['buildings', 'Buildings'],
];

const CATEGORY_LABEL: Record<string, string> = {
  taxes: 'Resident taxes',
  peddler: 'Peddler sales',
  refunds: 'Refunds',
  upkeep: 'Upkeep',
  construction: 'Construction',
  roads: 'Roads',
  fields: 'Fields',
};

/** The Ledger's reports: stocks, workforce, budget and building status, one tab at a time. */
export function ReportsPanel({ session }: { session: Session }) {
  const tab = session.ui.reportTab.value;
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame
      id="reports"
      class="book-panel reports"
      icon="reports"
      kicker="The Ledger"
      title="Reports"
      onClose={close}
    >
      <div class="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            class={tab === id ? 'active' : ''}
            data-testid={`report-${id}`}
            onClick={() => (session.ui.reportTab.value = id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="tab-body">
        {tab === 'stocks' && <Stocks session={session} />}
        {tab === 'workforce' && <Workforce session={session} />}
        {tab === 'budget' && <Budget session={session} />}
        {tab === 'buildings' && <Buildings session={session} />}
      </div>
    </Frame>
  );
}

export function Stocks({ session }: { session: Session }) {
  const stocks = session.mirror.stocks.value;
  if (!stocks || stocks.lines.length === 0) return <Empty>The storehouse ledger is still blank.</Empty>;
  const order = new Map(content.goods.map((g, i) => [g.id, i]));
  const lines = [...stocks.lines].sort((a, b) => (order.get(a.good) ?? 99) - (order.get(b.good) ?? 99));
  return (
    <>
      <table class="ledger-table stocks" data-testid="stocks">
        <thead>
          <tr>
            <th>Good</th>
            <th class="num">Stock</th>
            <th class="num" title="Produced and used today">
              Today
            </th>
            <th>Last days</th>
            <th title="The peddler buys goods marked for sale">Sell</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const net = l.producedToday - l.consumedToday;
            return (
              <tr key={l.good} class={l.stock === 0 ? 'out' : ''}>
                <th scope="row">
                  <i class={`good-dot good-${l.good}`} /> {goodName(l.good)}
                </th>
                <td class="num stock">{l.stock}</td>
                <td class="num flow" title={`${l.producedToday} made, ${l.consumedToday} used today`}>
                  <span class={l.producedToday ? 'plus' : 'idle'}>+{l.producedToday}</span>{' '}
                  <span class={l.consumedToday ? 'minus' : 'idle'}>-{l.consumedToday}</span>
                  <span class={`net ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`}>
                    {net > 0 ? '▲' : net < 0 ? '▼' : '·'}
                  </span>
                </td>
                <td>
                  <Sparkline values={[...l.history, l.stock]} />
                </td>
                <td>
                  <Toggle
                    on={l.forSale}
                    label={<span class="sr-only">Sell {goodName(l.good).toLowerCase()}</span>}
                    testid={`sell-${l.good}`}
                    onChange={(on) => session.submit({ t: 'ledger.setForSale', good: l.good, forSale: on })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="muted small foot">
        The peddler calls at 10:00 and buys up to 40 units of whatever is marked to sell.
      </p>
    </>
  );
}

export function Workforce({ session }: { session: Session }) {
  const m = session.mirror;
  void m.revision.value;
  void m.hamletRevision.value;
  const rows = [...m.buildings.values()]
    .filter((b) => (b.rt?.jobs ?? 0) > 0 && b.stage === 'built')
    .sort((a, b) => buildingName(a.def).localeCompare(buildingName(b.def)) || a.id - b.id);
  const jobs = rows.reduce((n, b) => n + b.rt!.jobs, 0);
  const filled = rows.reduce((n, b) => n + b.rt!.workers, 0);
  const idle = [...m.residents.values()].filter(
    (r) => !r.jobId && (r.stage === 'adult' || r.stage === 'young'),
  );
  if (!rows.length) return <Empty>No workplaces yet.</Empty>;
  return (
    <>
      <p class="summary" data-testid="workforce-summary">
        <b>{filled}</b> of <b>{jobs}</b> jobs filled, <b>{jobs - filled}</b> open.{' '}
        {idle.length > 0
          ? `${idle.length} ${idle.length === 1 ? 'resident is' : 'residents are'} looking for work.`
          : 'Everyone who can work, does.'}
      </p>
      <table class="ledger-table workforce">
        <thead>
          <tr>
            <th>Workplace</th>
            <th class="num">Filled</th>
            <th class="num">In now</th>
            <th>Open</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} class="clickable" onClick={() => select(session, b)}>
              <th scope="row">{buildingName(b.def)}</th>
              <td class="num">
                {b.rt!.workers}/{b.rt!.jobs}
              </td>
              <td class="num">{b.rt!.present}</td>
              <td>
                <span class="seats-dots" aria-label={`${b.rt!.jobs - b.rt!.workers} open`}>
                  {Array.from({ length: b.rt!.jobs }, (_, i) => (
                    <i key={i} class={i < b.rt!.workers ? 'filled' : 'open'} />
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

type Period = 'today' | 'yesterday' | 'season' | 'lastSeason';

export function Budget({ session }: { session: Session }) {
  const [period, setPeriod] = useState<Period>('today');
  const b = session.mirror.budget.value;
  if (!b) return <Empty>No books kept in a creative valley.</Empty>;
  const lines: BudgetLine[] = (period === 'lastSeason' ? b.lastSeason : b[period]) ?? [];
  const income = lines.filter((l) => l.kind === 'income');
  const expense = lines.filter((l) => l.kind === 'expense');
  const sum = (ls: BudgetLine[]) => ls.reduce((n, l) => n + l.pennies, 0);
  const net = sum(income) - sum(expense);
  const periods: [Period, string][] = [
    ['today', 'Today'],
    ['yesterday', 'Yesterday'],
    ['season', 'This season'],
    ['lastSeason', 'Last season'],
  ];
  return (
    <div class="budget" data-testid="budget">
      <div class={`treasury-card ${b.leanTimes ? 'lean' : ''}`}>
        <span class="muted">Treasury</span>
        <strong>{coins(b.treasury)}</strong>
        {b.leanTimes && (
          <p class="lean-note">
            Lean times. New building waits until the books are back above zero, and upkeep that goes unpaid
            wears buildings down. Nobody is going anywhere; it just gets a little drafty.
          </p>
        )}
      </div>
      <div class="dial small" role="radiogroup">
        {periods.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={period === id}
            class={period === id ? 'active' : ''}
            disabled={id === 'lastSeason' && !b.lastSeason}
            data-testid={`budget-${id}`}
            onClick={() => setPeriod(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <table class="ledger-table money">
        <tbody>
          <tr class="group">
            <th colSpan={2}>Coming in</th>
          </tr>
          {income.map((l) => (
            <tr key={l.category}>
              <th scope="row">{CATEGORY_LABEL[l.category] ?? l.category}</th>
              <td class="num plus">{l.pennies ? `+${coinCount(l.pennies)}` : '·'}</td>
            </tr>
          ))}
          <tr class="group">
            <th colSpan={2}>Going out</th>
          </tr>
          {expense.map((l) => (
            <tr key={l.category}>
              <th scope="row">{CATEGORY_LABEL[l.category] ?? l.category}</th>
              <td class="num minus">{l.pennies ? `-${coinCount(l.pennies)}` : '·'}</td>
            </tr>
          ))}
          <tr class="total">
            <th scope="row">{net >= 0 ? 'Ahead by' : 'Behind by'}</th>
            <td class={`num ${net >= 0 ? 'plus' : 'minus'}`} data-testid="budget-net">
              {coins(Math.abs(net))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function Buildings({ session }: { session: Session }) {
  const m = session.mirror;
  void m.revision.value;
  const rows = [...m.buildings.values()]
    .map((b) => ({ b, words: statusWords(b.rt?.status ?? 0) }))
    .filter((r) => r.words.length > 0)
    .sort((a, b) => a.b.id - b.b.id);
  if (!rows.length) return <Empty>Every building is getting on with it.</Empty>;
  return (
    <ul class="status-list" data-testid="building-statuses">
      {rows.map(({ b, words }) => (
        <li key={b.id}>
          <button type="button" onClick={() => select(session, b)}>
            <strong>{buildingName(b.def)}</strong>
            <span class="muted">{words.join(', ')}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function select(session: Session, b: BuildingView): void {
  session.ui.selection.value = { kind: 'building', id: b.id };
  session.render?.focus(b.x, b.z);
}
