// @vitest-environment happy-dom
// I2 (C4F): the village panels against the village mocks (the sim's village fixture through the
// sim's own view builders, plus a story under way, a caravan and a Charter board in progress).
import { content } from '@qoti/content';
import { TICKS_PER_DAY, type Command } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { mockCharter, mockLetters, mockLoans, mockTrade, villageIds } from '../mocks/village';
import { mockVillageSession } from '../mocks/session';
import { button, mount, settle, typeInto, type Mounted } from '../test/dom';
import { CharterPanel } from './Charter';
import { InspectorPanel } from './Inspector';
import { LettersPanel } from './Letters';
import { MarketPanel } from './Market';
import { NotebookPanel } from './Notebook';
import { PlansPanel } from './Plans';
import { PoliciesPanel } from './Policies';
import { RankUpPanel } from './RankUp';
import { AskDialog, RequestsPanel } from './Requests';
import { StoryLetterPanel } from './StoryLetter';
import { TradePanel } from './Trade';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const last = <T extends Command['t']>(submitted: Command[], t: T) =>
  submitted.filter((c): c is Extract<Command, { t: T }> => c.t === t).pop();

describe('market', () => {
  it('lists the goods in play with price and mood, and draws one large with its levers', async () => {
    const { session, submitted } = mockVillageSession();
    view = await mount(h(MarketPanel, { session }));
    const bread = view.get('price-bread');
    expect(bread.textContent).toContain('Bread');
    expect(bread.textContent).toMatch(/dear|steep/);
    // Goods nobody trades stay out of the way until asked for.
    expect(view.find('price-tools')).toBeNull();
    await view.click('prices-all');
    expect(view.find('price-tools')).not.toBeNull();

    await view.click('price-bread');
    expect(session.ui.marketGood.value).toBe('bread');
    expect(view.get('good-card').textContent).toContain('Households wanted');
    expect(view.root.querySelector('[data-testid="price-chart"] .chart-line')).not.toBeNull();
    await view.click('cap-toggle');
    const cap = last(submitted, 'ledger.setPriceCap')!;
    expect(cap.good).toBe('bread');
    expect(cap.cap).toBeGreaterThan(0);
    await view.click('subsidy-more');
    expect(last(submitted, 'ledger.setPriceCap')!.subsidy).toBe(5);
  });

  it('weighs up every workshop on the profit page, best first', async () => {
    const { session } = mockVillageSession();
    session.ui.marketTab.value = 'profit';
    view = await mount(h(MarketPanel, { session }));
    const rows = [...view.root.querySelectorAll('[data-testid^="profit-"] .profit-name')].map(
      (e) => e.textContent,
    );
    expect(rows).toContain('Bakery');
    await view.click(view.get(`profit-${villageIds.buildings.bakery}`).querySelector('button')!);
    expect(view.text()).toContain('Goods made');
    expect(view.text()).toContain('Wages');
  });
});

describe('trade', () => {
  it('shows each neighbor with what they sell and buy, and says when there is no post', async () => {
    const { session } = mockVillageSession();
    view = await mount(h(TradePanel, { session }));
    expect(view.get('no-post').textContent).toContain('No Trading Post yet');
    for (const n of content.neighbors) expect(view.get(`neighbor-${n.id}`).textContent).toContain(n.name);
    const millhaven = view.get('neighbor-millhaven').textContent ?? '';
    expect(millhaven).toContain('They sell');
    expect(millhaven).toContain('Wheat');
    expect(millhaven).toContain('Planks');
  });

  it('edits, adds and drops standing orders', async () => {
    const { session, submitted } = mockVillageSession();
    session.ui.tradeTab.value = 'orders';
    view = await mount(h(TradePanel, { session }));
    const order = mockTrade.orders[0]!;
    expect(view.get(`order-${order.good}`).textContent).toContain(`Keep ${order.min} to ${order.max}`);
    await view.click(button(view.get(`order-${order.good}`), 'Change'));
    await view.click('order-max-more');
    await view.click('order-save');
    expect(last(submitted, 'trade.setStandingOrder')).toMatchObject({
      good: order.good,
      order: { min: order.min, max: order.max + 5 },
    });
    await view.click(button(view.get(`order-${order.good}`), 'Change'));
    await view.click('order-remove');
    expect(last(submitted, 'trade.setStandingOrder')).toEqual({
      t: 'trade.setStandingOrder',
      good: order.good,
      order: null,
    });

    await view.click('order-add');
    await view.click('order-good-wool');
    await view.click('order-min-more');
    await view.click('order-save');
    expect(last(submitted, 'trade.setStandingOrder')).toMatchObject({ good: 'wool', order: { min: 5 } });
  });

  it('follows caravans on the road and keeps the ledger of deals', async () => {
    const { session } = mockVillageSession();
    session.ui.tradeTab.value = 'caravans';
    view = await mount(h(TradePanel, { session }));
    const caravan = mockTrade.caravans[0]!;
    expect(view.get(`caravan-${caravan.id}`).textContent).toContain('To Stonecross');
    const log = view.get('trade-log').textContent ?? '';
    expect(log).toContain('Sold 20 planks');
    expect(log).toContain('Bought 8');
  });
});

describe('policies', () => {
  it('sets wages and income tax from the dials, with the daily bill in words', async () => {
    const { session, submitted } = mockVillageSession();
    view = await mount(h(PoliciesPanel, { session }));
    expect(view.get('wages').textContent).toContain('Craftsfolk');
    expect(view.get('wage-bill').textContent).toContain('coins');
    await view.click('wage-110');
    expect(last(submitted, 'ledger.setWageLevel')).toEqual({ t: 'ledger.setWageLevel', percent: 110 });
    await view.click('tax-15');
    expect(last(submitted, 'ledger.setTaxRate')).toEqual({ t: 'ledger.setTaxRate', percent: 15 });
  });

  it('lists loans with repayments, and borrows within the credit left', async () => {
    const { session, submitted } = mockVillageSession();
    view = await mount(h(PoliciesPanel, { session }));
    const loan = mockLoans.loans[0]!;
    expect(view.get(`loan-${loan.id}`).textContent).toContain('100 coins');
    await view.click(`repay-all-${loan.id}`);
    expect(last(submitted, 'loan.repay')).toEqual({ t: 'loan.repay', id: loan.id, coins: 100 });
    await view.click('borrow-preset-250');
    await view.click('borrow-take');
    expect(last(submitted, 'loan.take')).toEqual({ t: 'loan.take', coins: 250 });
  });

  it('keeps the bank shut before the Village rank', async () => {
    const { session } = mockVillageSession();
    session.mirror.town.value = { ...session.mirror.town.value!, rank: 'hamlet' };
    view = await mount(h(PoliciesPanel, { session }));
    expect(view.get('loans-locked').textContent).toContain('Charter');
    expect(view.find('borrow-take')).toBeNull();
  });
});

describe('the Charter board and the notebook', () => {
  it('shows each goal with its lane and progress, and claims when ready', async () => {
    const { session, submitted } = mockVillageSession(0, { charter: true });
    view = await mount(h(CharterPanel, { session }));
    for (const g of mockCharter.goals) {
      const row = view.get(`goal-${g.id}`);
      expect(row.textContent).toContain(g.text);
      expect(row.querySelector(`.lane-tag.${g.lane}`)).not.toBeNull();
      expect(row.classList.contains('done')).toBe(g.done);
    }
    expect((view.get('charter-claim') as HTMLButtonElement).disabled).toBe(true);
    session.mirror.charter.value = {
      ...mockCharter,
      ready: true,
      goals: mockCharter.goals.map((g) => ({ ...g, done: true })),
    };
    await settle();
    await view.click('charter-claim');
    expect(last(submitted, 'charter.claim')).toEqual({ t: 'charter.claim' });
    await view.click('open-notebook');
    expect(session.ui.panel.value).toBe('notebook');
  });

  it('lists every innovation, brewing ones with their bar and what each brings', async () => {
    const { session } = mockVillageSession();
    view = await mount(h(NotebookPanel, { session }));
    for (const i of content.innovations) expect(view.find(`idea-${i.id}`)).not.toBeNull();
    expect(view.get('idea-cobbles').classList.contains('unlocked')).toBe(true);
    expect(view.get('idea-wheelbarrows').textContent).toContain('66%');
    expect(view.get('idea-wheelbarrows').textContent).toContain('Porters carry six');
  });

  it('celebrates a rank-up with the proclamation and what it opens', async () => {
    const { session } = mockVillageSession();
    session.ui.rankUp.value = { rank: 'village', text: '' };
    view = await mount(h(RankUpPanel, { session }));
    const text = view.get('rank-up').textContent ?? '';
    expect(text).toContain('Thistlecombe is a Village');
    expect(text).toContain('Zoning');
    await view.click('rank-up-close');
    expect(session.ui.rankUp.value).toBeNull();
  });
});

describe('letters', () => {
  it('lists story characters with their step and hint, and opens a letter on the desk', async () => {
    const { session } = mockVillageSession();
    view = await mount(h(LettersPanel, { session }));
    const card = view.get('story-pippa-quill');
    expect(card.textContent).toContain('Pippa Quill');
    expect(card.textContent).toContain('Step 2 of 5');
    expect(card.textContent).toContain('sawpit');
    const newest = mockLetters[mockLetters.length - 1]!;
    await view.click(`envelope-${newest.arc}-${newest.step}`);
    expect(session.ui.storyLetter.value).toEqual(newest);
    expect(session.ui.lettersRead.value.has(`${newest.arc}:${newest.step}`)).toBe(true);
  });

  it('shows a letter as a letter: salutation, lines, signature and the hint as a P.S.', async () => {
    const { session } = mockVillageSession();
    session.ui.storyLetter.value = mockLetters[mockLetters.length - 1]!;
    view = await mount(h(StoryLetterPanel, { session }));
    const text = view.get('story-letter').textContent ?? '';
    expect(text).toContain('Dear neighbors,');
    expect(text).toContain('Put a sawpit near it');
    expect(text).toContain('Pippa Quill');
    expect(view.get('letter-ps').textContent).toContain('P.S.');
    await view.click('letter-visit');
    expect(session.ui.selection.value).toEqual({ kind: 'resident', id: mockLetters[0]!.residentId });
    expect(session.ui.storyLetter.value).toBeNull();
  });
});

describe('requests', () => {
  it('lists the open requests, with withdraw for mine and done for the partner', async () => {
    const mine = mockVillageSession(0);
    view = await mount(h(RequestsPanel, { session: mine.session }));
    const id = villageIds.request;
    expect(view.get(`request-${id}`).textContent).toContain('You asked');
    expect(view.get(`request-${id}`).textContent).toContain('12 cheese at the market stall');
    await view.click(`request-withdraw-${id}`);
    expect(last(mine.submitted, 'request.resolve')).toEqual({
      t: 'request.resolve',
      id,
      status: 'withdrawn',
    });
    view.unmount();

    const theirs = mockVillageSession(1);
    view = await mount(h(RequestsPanel, { session: theirs.session }));
    expect(view.get(`request-${id}`).textContent).toContain('Ada asks');
    expect(view.get(`request-${id}`).classList.contains('for-me')).toBe(true);
    await view.click(`request-done-${id}`);
    expect(last(theirs.submitted, 'request.resolve')).toEqual({ t: 'request.resolve', id, status: 'done' });
  });

  it('asks for goods by a day at a stall, or for anything in a note', async () => {
    const { session, submitted } = mockVillageSession();
    session.ui.asking.value = true;
    view = await mount(h(AskDialog, { session }));
    expect(view.get('ask-dialog').textContent).toContain('Ask Bo');
    await view.click('ask-good-cheese');
    await view.click('ask-qty-more');
    await view.click('ask-send');
    const today = Math.floor(session.mirror.tick.value / TICKS_PER_DAY);
    expect(last(submitted, 'request.add')).toEqual({
      t: 'request.add',
      ask: { kind: 'goods', good: 'cheese', qty: 11, byDay: today + 2, at: 0 },
    });
    expect(session.ui.asking.value).toBe(false);

    session.ui.asking.value = true;
    view.unmount();
    view = await mount(h(AskDialog, { session }));
    await view.click('ask-text');
    await typeInto(view.get('ask-note'), 'More benches by the river, please.');
    await view.click('ask-send');
    expect(last(submitted, 'request.add')!.ask).toEqual({
      kind: 'text',
      text: 'More benches by the river, please.',
    });
  });
});

describe('plans', () => {
  it('shows a plan with its author, contents and thread; comments and approves', async () => {
    const { session, submitted } = mockVillageSession(0);
    view = await mount(h(PlansPanel, { session }));
    const id = villageIds.plan;
    const card = view.get(`plan-${id}`);
    expect(card.textContent).toContain('A bench by the well');
    expect(card.textContent).toContain("Bo's plan");
    expect(card.textContent).toContain('a bench');
    expect(card.textContent).toContain('Somewhere to sit');
    // Opening the book on a plan counts as seeing it.
    expect(last(submitted, 'plan.seen')).toEqual({ t: 'plan.seen', id });
    await typeInto(view.get(`plan-comment-${id}`), 'Yes, and a lantern.');
    await view.click(`plan-say-${id}`);
    expect(last(submitted, 'plan.comment')).toEqual({ t: 'plan.comment', id, text: 'Yes, and a lantern.' });
    await view.click(`plan-show-${id}`);
    expect(session.ui.planFocus.value).toBe(id);
    await view.click(`plan-approve-${id}`);
    expect(last(submitted, 'plan.approve')).toEqual({ t: 'plan.approve', id });
  });

  it("marks the author's own plan as not yet seen by the partner", async () => {
    const { session } = mockVillageSession(1);
    view = await mount(h(PlansPanel, { session }));
    expect(view.get(`plan-unseen-${villageIds.plan}`).textContent).toContain('Not yet seen by Ada');
  });

  it('sketches: names the pieces and proposes them as one plan', async () => {
    const { session, submitted } = mockVillageSession();
    view = await mount(h(PlansPanel, { session }));
    await view.click('sketch-start');
    expect(session.ui.sketch.value).toEqual({ items: [], basedOn: null });
    session.ui.sketch.value = {
      basedOn: null,
      items: [
        { cmd: { t: 'build.place', def: 'bakery', x: 50, z: 52, rot: 0 } },
        {
          cmd: {
            t: 'road.paint',
            kind: 'lane',
            tiles: [
              [50, 51],
              [51, 51],
              [52, 51],
            ],
          },
        },
      ],
    };
    await settle();
    expect(view.get('sketch-card').textContent).toContain('3 tiles of lane');
    await view.click('sketch-undo');
    expect(view.get('sketch-card').textContent).toContain('a bakery');
    await typeInto(view.get('sketch-name'), 'Bread for the south side');
    await view.click('sketch-propose');
    expect(last(submitted, 'plan.add')).toEqual({
      t: 'plan.add',
      name: 'Bread for the south side',
      items: [{ cmd: { t: 'build.place', def: 'bakery', x: 50, z: 52, rot: 0 } }],
    });
    expect(session.ui.sketch.value).toBeNull();
  });
});

describe('inspectors in the village', () => {
  it('a resident: partner, savings, tier and a story in letters', async () => {
    const { session } = mockVillageSession();
    session.ui.selection.value = { kind: 'resident', id: villageIds.residents[0]! };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('resident-partner').textContent).toContain('Married to');
    expect(view.get('resident-partner').textContent).toContain('Bluebell');
    expect(view.text()).toContain('Family savings');
    expect(view.get('resident-story').textContent).toContain('Step 2 of 5'.toLowerCase());
    await view.click('resident-story-tab');
    expect(view.get('resident-family').textContent).toContain('Married to Bluebell');
    await view.click('resident-letter');
    expect(session.ui.storyLetter.value?.arc).toBe('pippa-quill');
  });

  it('a workshop in the Ledger lens: profit per work day, opening to its lines', async () => {
    const { session } = mockVillageSession();
    session.ui.lens.value = 'ledger';
    session.ui.selection.value = { kind: 'building', id: villageIds.buildings.bakery };
    view = await mount(h(InspectorPanel, { session }));
    const card = view.get('building-profit');
    expect(card.textContent).toContain('a work day');
    await view.click(card.querySelector('button')!);
    expect(view.get('building-profit').textContent).toContain('Upkeep');
    session.ui.lens.value = 'hearth';
    view.unmount();
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('building-profit')).toBeNull();
  });

  it('a grown cottage: its lot and its street style', async () => {
    const { session } = mockVillageSession();
    session.ui.selection.value = { kind: 'building', id: villageIds.buildings.grown };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('building-lot').textContent).toContain('homes lot');
    expect(view.get('building-lot').textContent).toContain('timber');
  });
});
