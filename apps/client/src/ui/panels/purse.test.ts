// @vitest-environment happy-dom
// R1C: the Purse book (budget, taxes and wages, loans), carried over from the Reports budget tab and
// the Policies book.
import { type Command } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { mockSession, mockSeasonsSession, mockVillageSession, mockView } from '../mocks/session';
import { mockLoans } from '../mocks/village';
import { mount, settle, type Mounted } from '../test/dom';
import { panels } from './index';
import { PursePanel } from './Purse';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const last = <T extends Command['t']>(submitted: Command[], t: T) =>
  submitted.filter((c): c is Extract<Command, { t: T }> => c.t === t).pop();

describe('the Purse book', () => {
  it('is the ledger book on key p, and Reports and Policies are gone', () => {
    expect(panels.find((p) => p.id === 'purse')).toMatchObject({
      lens: 'ledger',
      key: 'p',
      label: 'Purse',
      order: 20,
    });
    for (const gone of ['reports', 'policies']) expect(panels.find((p) => p.id === gone)).toBeUndefined();
  });

  it('budget: treasury, income and expenses, today and the season', async () => {
    const { session } = mockSession();
    view = await mount(h(PursePanel, { session }));
    const text = view.text();
    expect(text).toContain('412 coins');
    expect(text).toContain('Exports');
    expect(view.get('budget-net').textContent).toBe('16 coins');
    expect(text).toContain('Behind by');
    await view.click('budget-season');
    expect(view.get('budget-net').textContent).toBe('64 coins');
    expect((view.get('budget-lastSeason') as HTMLButtonElement).disabled).toBe(true);
  });

  it('budget: lean times read as a gentle note', async () => {
    const { session } = mockSession(
      mockView({
        budget: {
          treasury: -1200,
          leanTimes: true,
          today: [],
          yesterday: [],
          season: [],
          lastSeason: null,
        },
      }),
    );
    view = await mount(h(PursePanel, { session }));
    expect(view.text()).toContain('-12 coins');
    expect(view.text()).toContain('Lean times');
  });

  it('taxes and wages: sets wages and income tax from the dials, with the daily bill in words', async () => {
    const { session, submitted } = mockVillageSession();
    session.ui.purseTab.value = 'taxes';
    view = await mount(h(PursePanel, { session }));
    expect(view.get('wages').textContent).toContain('Craftsfolk');
    expect(view.get('wage-bill').textContent).toContain('coins');
    await view.click('wage-110');
    expect(last(submitted, 'ledger.setWageLevel')).toEqual({ t: 'ledger.setWageLevel', percent: 110 });
    await view.click('tax-15');
    expect(last(submitted, 'ledger.setTaxRate')).toEqual({ t: 'ledger.setTaxRate', percent: 15 });
  });

  it('taxes and wages: market day and quiet hours at Village rank', async () => {
    const { session, submitted } = await mockSeasonsSession('winter');
    session.ui.purseTab.value = 'taxes';
    view = await mount(h(PursePanel, { session }));
    expect(view.find('town-rhythm')).not.toBeNull();
    (view.get('quiet-hours') as HTMLInputElement).click();
    await settle();
    expect(last(submitted, 'ledger.setQuietHours')!.on).toBe(true);
  });

  it('loans: lists them with repayments, borrows within the credit left, and shows the County tab', async () => {
    const { session, submitted } = mockVillageSession();
    session.ui.purseTab.value = 'loans';
    view = await mount(h(PursePanel, { session }));
    const loan = mockLoans.loans[0]!;
    expect(view.get(`loan-${loan.id}`).textContent).toContain('100 coins');
    expect(view.find('purse-county')).not.toBeNull();
    await view.click(`repay-all-${loan.id}`);
    expect(last(submitted, 'loan.repay')).toEqual({ t: 'loan.repay', id: loan.id, coins: 100 });
    await view.click('borrow-preset-250');
    await view.click('borrow-take');
    expect(last(submitted, 'loan.take')).toEqual({ t: 'loan.take', coins: 250 });
  });

  it('loans: the bank stays shut before the Village rank', async () => {
    const { session } = mockVillageSession();
    session.mirror.town.value = { ...session.mirror.town.value!, rank: 'hamlet' };
    session.ui.purseTab.value = 'loans';
    view = await mount(h(PursePanel, { session }));
    expect(view.get('loans-locked').textContent).toContain('Charter');
    expect(view.find('borrow-take')).toBeNull();
  });

  it('the tabs switch between the three sections', async () => {
    const { session } = mockVillageSession();
    view = await mount(h(PursePanel, { session }));
    expect(view.find('budget')).not.toBeNull();
    await view.click('purse-taxes');
    expect(session.ui.purseTab.value).toBe('taxes');
    expect(view.find('wages')).not.toBeNull();
    await view.click('purse-loans');
    expect(view.find('loans')).not.toBeNull();
  });
});
