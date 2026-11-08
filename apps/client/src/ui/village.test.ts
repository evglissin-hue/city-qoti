// @vitest-environment happy-dom
// I2 (C4F): village alerts, the rank pennant, plan words and shapes, and the minimap's paint,
// against the village mocks.
import { MAP_SIZE, type Command } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { computeAlerts, alertsForLens } from './alerts';
import { paintMinimap } from './Minimap';
import { mockVillageSession } from './mocks/session';
import { mockCharter, villageIds } from './mocks/village';
import { planCovers, planSummary, shapesOf, sketchWith } from './plans';
import { mount, type Mounted } from './test/dom';
import { TopBar } from './TopBar';
import { priceMood, priceText } from './village';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

describe('village alerts', () => {
  it('tells the Ledger about steep prices and goods a tier cannot find', () => {
    const { session } = mockVillageSession();
    const m = session.mirror;
    m.market.value = {
      lines: m.market.value!.lines.map((l) => (l.good === 'bread' ? { ...l, price: l.base * 2 } : l)),
    };
    m.stocks.value = {
      lines: m.stocks.value!.lines.map((l) => (l.good === 'cloth' ? { ...l, stock: 0 } : l)),
    };
    const ledger = alertsForLens(computeAlerts(m, [], { seat: 0 }), 'ledger', new Set());
    const price = ledger.find((a) => a.key === 'price-bread-dear');
    expect(price?.text).toContain('Bread is dear');
    expect(price?.action).toEqual({ kind: 'market', good: 'bread' });
    expect(ledger.find((a) => a.key === 'tier-short-craftsfolk-cloth')?.text).toContain('Craftsfolk');
    // The Hearth hears none of it.
    const hearth = alertsForLens(computeAlerts(m, [], { seat: 0 }), 'hearth', new Set());
    expect(hearth.some((a) => a.key.startsWith('price-') || a.key.startsWith('tier-short'))).toBe(false);
  });

  it('brings story letters, requests and plans from the partner, and an open Charter to both lanes', () => {
    const { session } = mockVillageSession(1, { charter: true });
    const m = session.mirror;
    m.charter.value = { ...mockCharter, ready: true };
    // Seat 1 reads: seat 0 asked for cheese; the plan is seat 1's own, so no plan alert.
    const all = computeAlerts(m, [], { seat: 1 });
    const letters = all.filter((a) => a.key.startsWith('story-pippa-quill'));
    expect(letters.map((a) => a.lens).sort()).toEqual(['hearth', 'ledger']);
    expect(letters[0]!.text).toBe('Two letters from Pippa Quill.');
    expect(all.find((a) => a.key === `request-${villageIds.request}`)).toMatchObject({ lens: 'ledger' });
    expect(all.some((a) => a.key.startsWith('plan-'))).toBe(false);
    expect(all.filter((a) => a.key.startsWith('charter-ready')).length).toBe(2);

    // Seat 0 has not seen seat 1's plan, and has read one letter.
    const mine = computeAlerts(m, [], { seat: 0, lettersRead: new Set(['pippa-quill:1']) });
    expect(mine.find((a) => a.key === `plan-${villageIds.plan}`)?.text).toContain('Bo sketched a plan');
    expect(mine.find((a) => a.key.startsWith('story-'))?.text).toBe('A letter from Pippa Quill.');
    expect(mine.some((a) => a.key.startsWith('request-'))).toBe(false);
  });
});

describe('the rank pennant', () => {
  it('shows the rank with a pip per Charter goal and opens the board', async () => {
    const { session } = mockVillageSession(0, { charter: true });
    view = await mount(h(TopBar, { session, onLeave: () => {} }));
    const chip = view.get('rank');
    expect(chip.textContent).toContain('Hamlet');
    expect(chip.querySelectorAll('.pips i')).toHaveLength(mockCharter.goals.length);
    expect(chip.querySelectorAll('.pips i.on')).toHaveLength(mockCharter.goals.filter((g) => g.done).length);
    await view.click('rank');
    expect(session.ui.panel.value).toBe('charter');
  });
});

describe('plans', () => {
  it('reads a plan in words and knows where it lies', () => {
    const { session } = mockVillageSession();
    const items = [
      { cmd: { t: 'build.place', def: 'cottage', x: 50, z: 52, rot: 0 } as Command },
      { cmd: { t: 'build.place', def: 'cottage', x: 53, z: 52, rot: 0 } as Command },
      { cmd: { t: 'decor.place', def: 'bench', fx: 60 * 256, fz: 54 * 256, rot: 0 } as Command },
      {
        cmd: {
          t: 'road.paint',
          kind: 'lane',
          tiles: [
            [50, 51],
            [51, 51],
          ],
        } as Command,
      },
      { cmd: { t: 'build.remove', ids: [villageIds.buildings.wells[0]] } as Command },
    ];
    expect(planSummary(items)).toBe('2 cottages, a bench, 2 tiles of lane and 1 thing cleared away');
    expect(planCovers(items, session.mirror, 50, 52)).toBe(true);
    expect(planCovers(items, session.mirror, 70, 70)).toBe(false);
    const removal = shapesOf(items[4]!.cmd, session.mirror)[0]!;
    expect(removal).toMatchObject({ kind: 'rect', removal: true });
  });

  it('keeps building commands in the sketch while one is open, and lets the rest through', () => {
    const place: Command = { t: 'build.place', def: 'cottage', x: 50, z: 52, rot: 0 };
    const speed: Command = { t: 'time.setSpeed', speed: 2 };
    expect(sketchWith(null, place)).toBeNull();
    const sketch = sketchWith({ items: [], basedOn: null }, place);
    expect(sketch?.items).toEqual([{ cmd: place }]);
    expect(sketchWith(sketch, speed)).toBeNull();
  });
});

describe('words and the minimap', () => {
  it('prices read as coins and moods', () => {
    expect(priceText(200)).toBe('2');
    expect(priceText(260)).toBe('2.6');
    expect(priceText(245)).toBe('2.45');
    expect(priceMood(400, 200)).toBe('steep');
    expect(priceMood(260, 200)).toBe('dear');
    expect(priceMood(200, 200)).toBe('fair');
    expect(priceMood(150, 200)).toBe('cheap');
    expect(priceMood(100, 200)).toBe('bargain');
  });

  it('paints roads, buildings and zones in their own inks', () => {
    const { session } = mockVillageSession();
    const data = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4);
    paintMinimap(session, data);
    const px = (x: number, z: number) => [...data.slice((z * MAP_SIZE + x) * 4, (z * MAP_SIZE + x) * 4 + 3)];
    const grass = px(10, 10);
    const lane = px(40, 50);
    const hall = px(35, 47);
    const shopLot = px(66, 52);
    expect(lane).not.toEqual(grass);
    expect(hall).not.toEqual(grass);
    expect(hall).not.toEqual(lane);
    expect(shopLot).not.toEqual(grass);
    expect(data[3]).toBe(255);
  });
});
