// R3X: the County's crate at the Charter. The day the town is made a Village its lanterns begin to burn
// candles; the County sends `charterCrateNights` nights of them for the lanterns then standing, in the
// Town Hall's store, which the lanterns' settling draws first, so the fortnight is lit under the households' Wares floor. The letter and the Hearth's one line come once.
import { content, lifePhrases } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { findById } from '../../src/state/entities';
import { bumpPlaceInputs } from '../../src/systems/places/inputs';
import { placesWant } from '../../src/systems/supplies/want';
import { townStock } from '../../src/view/hamlet';
import {
  crateHeld,
  crateSize,
  nightDraw,
  sendCharterCrate,
  takeFromCrate,
} from '../../src/systems/supplies/crate';
import { settle } from '../../src/systems/supplies/settle';
import { tickAt } from '../../src/systems/supplies/time';
import { createTickCtx } from '../../src/turn';
import { eveningView } from '../../src/view/evening';
import { hamletFixture } from '../fixtures/hamlet';
import { decor } from '../hearth/helpers';
import { run } from '../helpers';

const CANDLES = content.goodIndex.get('candles')!;
const NIGHTS = content.supplies.charterCrateNights!;
const PER = content.decorById.get('lantern')!.supply!.per!;

/** A hamlet with `n` lanterns standing, its Charter ready to claim, the day at `hour`. */
function setup(n: number, hour = 12) {
  const f = hamletFixture();
  const s = f.state;
  while (s.decor.filter((d) => d.def === 'lantern').length < n) {
    decor(s, 'lantern', 50 + (s.decor.length % 30), 40 + Math.floor(s.decor.length / 30));
  }
  bumpPlaceInputs(s);
  const store = findById(s.buildings, f.b.storehouse)!;
  store.rt!.store.fill(0);
  // The households keep a Wares reserve far above what the town holds: a lantern draws nothing on its own.
  for (const fam of s.carrier.families) fam.reserve = 1000;
  s.charter.ready = true;
  s.tick = tickAt(3, hour);
  return { f, s, store };
}

const letters = (events: readonly { e: string; kind?: string; text?: string }[]) =>
  events.filter((e) => e.e === 'notify' && e.kind === 'letter' && e.text?.includes('candles'));

describe('the County crate', () => {
  it('is a night of the lanterns for each of the nights, rounded up a night at a time', () => {
    expect(nightDraw(1)).toBe(1);
    expect(nightDraw(PER)).toBe(1);
    expect(nightDraw(PER + 1)).toBe(2);
    expect(crateSize(0)).toBe(0);
    expect(crateSize(1)).toBe(NIGHTS);
    expect(crateSize(5 * PER)).toBe(5 * NIGHTS);
    expect(crateSize(5 * PER + 1)).toBe(6 * NIGHTS);
  });

  it('is sized to the lanterns standing at the claim and set down at the Town Hall, outside the town stock', () => {
    for (const n of [3, 20, 61]) {
      const { f, s, store } = setup(n);
      const lanterns = s.decor.filter((d) => d.def === 'lantern').length;
      expect(lanterns).toBeGreaterThanOrEqual(n);
      run(s, { t: 'charter.claim' });
      expect(s.charter.rank).toBe('village');
      expect(findById(s.buildings, f.b.townHall)!.rt!.store[CANDLES], `lanterns ${lanterns}`).toBe(
        crateSize(lanterns),
      );
      expect(crateHeld(s)).toBe(crateSize(lanterns));
      // The households' shelves and the carrier never see it: it is no part of the stock they count.
      expect(townStock(s)[CANDLES]).toBe(0);
      expect(store.rt!.store[CANDLES]).toBe(0);
    }
  });

  it('lands where the lanterns draw it: the first night lights every lantern under any Wares floor, and each night of the fortnight', () => {
    const { s, store } = setup(20);
    const lanterns = s.decor.filter((d) => d.def === 'lantern').length;
    run(s, { t: 'charter.claim' });
    for (let night = 0; night < NIGHTS; night++) {
      s.tick = tickAt(3 + night, 17, 30);
      settle(s, createTickCtx(s));
      expect(s.supplies.lamps, `night ${night + 1}`).toHaveLength(lanterns);
    }
    expect(crateHeld(s)).toBe(0);
    // The fortnight is over: the town's stock is under the floor and the lanterns go dark.
    s.tick = tickAt(3 + NIGHTS, 17, 30);
    settle(s, createTickCtx(s));
    expect(s.supplies.lamps).toHaveLength(0);
    expect(store.rt!.store[CANDLES]).toBe(0);
  });

  it('is drawn before the stock, which keeps for the nights after, and a town that wants none buys none', () => {
    const { s, store } = setup(20);
    const lanterns = s.decor.filter((d) => d.def === 'lantern').length;
    for (const fam of s.carrier.families) fam.reserve = 0;
    store.rt!.store[CANDLES] = 5;
    run(s, { t: 'charter.claim' });
    expect(placesWant(s)[CANDLES]).toBe(0);
    s.tick = tickAt(3, 17, 30);
    settle(s, createTickCtx(s));
    expect(s.supplies.lamps).toHaveLength(lanterns);
    expect(store.rt!.store[CANDLES]).toBe(5);
    expect(crateHeld(s)).toBe(crateSize(lanterns) - nightDraw(lanterns));
  });

  it('a claim after the settling is for the next day, and its first night is lit too', () => {
    const { s } = setup(12, 19);
    s.supplies.night = 3;
    const lanterns = s.decor.filter((d) => d.def === 'lantern').length;
    run(s, { t: 'charter.claim' });
    s.tick = tickAt(4, 17, 30);
    settle(s, createTickCtx(s));
    expect(s.supplies.lamps).toHaveLength(lanterns);
  });

  it('without the crate the same lanterns stay dark under the floor', () => {
    const { s } = setup(20);
    run(s, { t: 'charter.claim' });
    takeFromCrate(s, 10_000);
    s.tick = tickAt(3, 17, 30);
    settle(s, createTickCtx(s));
    expect(s.supplies.lamps).toHaveLength(0);
  });

  it('comes with one letter from the County and one line in the Hearth edition, never again', () => {
    const { s } = setup(20);
    const lanterns = s.decor.filter((d) => d.def === 'lantern').length;
    const ctx = run(s, { t: 'charter.claim' });
    const sent = letters(ctx.events as never);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain(String(crateSize(lanterns)));
    expect(sent[0]!.text).toContain(String(lanterns));
    expect(sent[0]!.text).toContain('County');
    // The evening of the claim: the edition leads with the line; the day after, it is gone.
    const edition = (day: number) => {
      s.evenings.tonight = { ...s.evenings.tonight, day };
      return eveningView(s)!.lines.map((l) => l.text);
    };
    expect(edition(3).filter((t) => t === lifePhrases.charterCrate.news[0])).toHaveLength(1);
    expect(edition(3)[0]).toBe(lifePhrases.charterCrate.news[0]);
    expect(edition(4)).not.toContain(lifePhrases.charterCrate.news[0]);
    expect(edition(2)).not.toContain(lifePhrases.charterCrate.news[0]);
  });

  it('sends the words for a town with no lanterns and no crate', () => {
    const f = hamletFixture();
    const s = f.state;
    s.decor = s.decor.filter((d) => d.def !== 'lantern');
    findById(s.buildings, f.b.storehouse)!.rt!.store.fill(0);
    s.charter.ready = true;
    s.tick = tickAt(3, 12);
    const ctx = run(s, { t: 'charter.claim' });
    expect(crateHeld(s)).toBe(0);
    const note = (ctx.events as { e: string; text?: string }[]).filter(
      (e) => e.e === 'notify' && e.text?.startsWith('From the County Office of Lamps'),
    );
    expect(note).toHaveLength(1);
    expect(note[0]!.text).toContain('no lanterns');
  });

  it('is sent at the Village Charter only', () => {
    const { s } = setup(20);
    const ctx = createTickCtx(s);
    sendCharterCrate(s, ctx, 'town');
    expect(crateHeld(s)).toBe(0);
    expect(ctx.events).toHaveLength(0);
  });
});
