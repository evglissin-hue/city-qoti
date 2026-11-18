// R3A: the tavern's Treats (docs/build/r3-wave-notes.md, the tavern ruling). Its pouring stock
// (rt.input) is its shelf on the evening round; stalls and shops still sell from their store.
import { content } from '@qoti/content';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { placeServes } from '../../src/systems/places/api';
import { sellsTreats, shelfOf, treatsOnShelf } from '../../src/systems/market/round';
import { outletFree } from '../../src/systems/market/api';
import { takeFromOutlet } from '../../src/systems/economy/outlets';
import { tradePass } from '../../src/systems/market/trade';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { place, setStubPlaces } from '../r2b/stubPlaces';
import {
  doorOf,
  goodIx,
  owe,
  resident,
  standAt,
  stockTreats,
  stop,
  tickAt,
  treatCount,
} from '../r2b/tradeKit';

/* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-imports -- a test's mock factory */
vi.mock('../../src/systems/places/api', async (orig) => {
  const { stubPlacesApi } = await import('../r2b/stubPlaces');
  return stubPlacesApi(await orig<typeof import('../../src/systems/places/api')>());
});
/* eslint-enable no-restricted-syntax, @typescript-eslint/consistent-type-imports */

beforeEach(() => setStubPlaces([]));

function withTavern() {
  const f = villageFixture();
  const s = f.state;
  const tavern = insertBuilding(s, null, content.buildingById.get('tavern')!, 50, 56, 0, 0, { site: false });
  tavern.rt!.input.fill(0);
  tavern.rt!.store.fill(0);
  tavern.rt!.reservedOut.fill(0);
  return { f, s, tavern };
}

const CIDER = () => goodIx('cider');

describe("the tavern's pouring stock is its shelf", () => {
  it('serves a place beside it while cider is in its input, and not when the input is empty', () => {
    const { s, tavern } = withTavern();
    const p = place({ id: 'seats:t', tile: doorOf(tavern), outlets: [tavern.id] });
    expect(sellsTreats(s, tavern)).toBe(true);
    expect(treatsOnShelf(s, tavern)).toBe(false);
    expect(placeServes(s, p)).toEqual([]);
    tavern.rt!.input[CIDER()] = 3;
    expect(treatsOnShelf(s, tavern)).toBe(true);
    expect(placeServes(s, p)).toEqual([tavern.id]);
    tavern.rt!.input[CIDER()] = 0;
    expect(treatsOnShelf(s, tavern)).toBe(false);
  });

  it('ignores a tavern store, and any reservation, which it does not have', () => {
    const { s, tavern } = withTavern();
    tavern.rt!.store[CIDER()] = 5;
    expect(treatsOnShelf(s, tavern)).toBe(false);
    tavern.rt!.input[CIDER()] = 2;
    tavern.rt!.reservedOut[CIDER()] = 2;
    expect(treatsOnShelf(s, tavern)).toBe(true);
    expect(shelfOf(tavern)!.reserved).toBeNull();
  });

  it('hands out cider from the input (outletFree, takeFromOutlet)', () => {
    const { s, tavern } = withTavern();
    tavern.rt!.input[CIDER()] = 4;
    expect(outletFree(s, tavern.id, CIDER())).toBe(4);
    expect(takeFromOutlet(s, tavern.id, CIDER(), 3)).toBe(3);
    expect(tavern.rt!.input[CIDER()]).toBe(1);
    expect(takeFromOutlet(s, tavern.id, CIDER(), 3)).toBe(1);
    expect(tavern.rt!.input[CIDER()]).toBe(0);
    expect(tavern.rt!.store[CIDER()]).toBe(0);
  });

  it('sells a resident on the round a cider out of its input', () => {
    const { f, s, tavern } = withTavern();
    tavern.rt!.input[CIDER()] = 6;
    const door = doorOf(tavern);
    setStubPlaces([place({ id: 'seats:t', tile: door, outlets: [tavern.id] })]);
    s.tick = tickAt(2, 18);
    const h = findById(s.households, f.households[0]!)!;
    const r = resident(s, h.members[0]!);
    owe(h, 1);
    standAt(r, door, [stop('seats:t', door, s.tick - 8)], s);
    const before = tavern.rt!.input.reduce((a, n) => a + n, 0);
    tradePass(s, createTickCtx(s));
    expect(tavern.rt!.input.reduce((a, n) => a + n, 0)).toBe(before - 1);
    expect(s.evenings.tonight.treatsAtStops).toBe(1);
  });

  it('leaves a stall and a shop selling from their store, as before', () => {
    const f = villageFixture();
    const s = f.state;
    const stall = findById(s.buildings, f.b.stalls[0])!;
    stockTreats(stall, 5);
    expect(shelfOf(stall)!.stock).toBe(stall.rt!.store);
    expect(shelfOf(stall)!.reserved).toBe(stall.rt!.reservedOut);
    expect(treatsOnShelf(s, stall)).toBe(true);
    stall.rt!.reservedOut[CIDER()] = 5;
    stall.rt!.reservedOut[goodIx('honey')] = 5;
    expect(treatsOnShelf(s, stall)).toBe(false);
    stall.rt!.reservedOut.fill(0);
    stall.rt!.input[CIDER()] = 9;
    const before = treatCount(stall);
    expect(takeFromOutlet(s, stall.id, CIDER(), 2)).toBe(2);
    expect(treatCount(stall)).toBe(before - 2);
    expect(stall.rt!.input[CIDER()]).toBe(9);
    const shop = insertBuilding(s, null, content.buildingById.get('corner-shop')!, 70, 56, 0, 0, {
      site: false,
      trade: 'shop',
    });
    shop.level = 2;
    shop.rt!.input[CIDER()] = 4;
    expect(treatsOnShelf(s, shop)).toBe(false);
    shop.rt!.store[CIDER()] = 1;
    expect(treatsOnShelf(s, shop)).toBe(true);
  });

  // pieceRests is still a stub returning null in this branch, so the cafe and festival tables are
  // not tested here; their served read goes through treatsOnShelf, which the tests above cover.
});
