import { content } from '@qoti/content';
import { LEANINGS, type BuildingDetail, type ResidentDetail } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { eveningMocks } from './evening';
import { r3Detail, r3Mocks } from './r3';
import { mockVillageSession } from './session';

function village() {
  const { session } = mockVillageSession();
  const m = session.mirror;
  m.setPlaces({ places: eveningMocks(m).places });
  return { session, m, mocks: r3Mocks(m) };
}

describe('the R3 mocks', () => {
  it('keep the pages, the leanings and the callings in agreement', () => {
    const { mocks } = village();
    const book = mocks.townBook;
    expect(book.pages).toHaveLength(4);
    expect(book.pages.filter((p) => p.kind === 'specialty')).toHaveLength(2);
    expect(book.pages.filter((p) => p.together)).toHaveLength(1);
    expect(book.hints).toHaveLength(content.townBook.hints);
    LEANINGS.forEach((l, i) =>
      expect(book.leanings[i]).toBe(book.pages.filter((p) => p.leaning === l).length),
    );
    expect(book.callings.map((c) => c.id)).toEqual(['mill-town']);
    expect(book.callings[0]!.leaning).toBe('industry');
    expect(book.pages.every((p) => !!p.name && !!p.text && !p.name.includes('{'))).toBe(true);
    expect(new Set(book.pages.map((p) => p.id)).size).toBe(4);
  });

  it('put the pages at real places and the priorities on real ones', () => {
    const { m, mocks } = village();
    for (const p of mocks.townBook.pages) {
      expect(m.places.has(p.place)).toBe(true);
      expect(p.placeName).toBe(m.places.get(p.place)!.name);
    }
    const priorities = mocks.places.filter((p) => p.priority).map((p) => p.priority);
    expect(priorities.sort()).toEqual(['keep', 'rest']);
    const rest = mocks.places.find((p) => p.priority === 'rest')!;
    expect(rest.resting?.length).toBeGreaterThan(0);
    for (const r of rest.resting ?? []) expect(rest.members).toContain(r.id);
    for (const p of mocks.places)
      expect(p.supplies?.reduce((t, s) => t + s.resting, 0) ?? 0).toBe(p.resting?.length ?? 0);
  });

  it('light every lantern but two, rest one fire and give two homes a candle', () => {
    const { m, mocks } = village();
    const s = mocks.supplies;
    const lanterns = [...m.decor.values(), ...mocks.decor].filter(
      (d) => content.decorById.get(d.def)?.supply?.kind === 'nightly',
    );
    expect(s.resting.filter((r) => r.kind === 'unlit')).toHaveLength(2);
    expect(s.resting.filter((r) => r.kind === 'cold')).toHaveLength(1);
    expect(s.lamps.length).toBe(lanterns.length - 2);
    expect(s.lamps.some((l) => s.resting.some((r) => r.id === l.id))).toBe(false);
    expect(s.candles).toHaveLength(2);
    for (const h of s.candles) expect(m.buildings.get(h)?.def).toBeTruthy();
  });

  it('name masters who work where they are named, with their good from content', () => {
    const { m, mocks } = village();
    const mm = mocks.masters;
    expect(mm).not.toBeNull();
    expect(m.residents.get(mm!.master)?.jobId).toBe(mm!.business);
    for (const a of mm!.apprentices) expect(m.residents.get(a)?.jobId).toBe(mm!.business);
    const b = mocks.businesses.find((x) => x.id === mm!.business)!;
    expect(b.masterId).toBe(mm!.master);
    expect(content.masters.find((d) => d.of === b.trade)?.good).toBe(b.masterGood);
    expect(mocks.businesses.filter((x) => x.graceDays !== undefined).length).toBeLessThanOrEqual(1);
  });

  it('answer inspect for the master, the apprentice, the building, the Town Hall and a candle home', () => {
    const { session, m, mocks } = village();
    const mm = mocks.masters!;
    const ask = async (kind: 'resident' | 'building', id: number) =>
      r3Detail(m, mocks, kind, id, await session.inspect(kind, id));
    return Promise.all([
      ask('resident', mm.master),
      ask('building', mm.business),
      ask('building', mocks.supplies.candles[0]!),
      ...[...m.buildings.values()].filter((b) => b.def === 'town-hall').map((b) => ask('building', b.id)),
      ...(mm.apprentices[0] ? [ask('resident', mm.apprentices[0])] : []),
    ]).then(([master, building, home, hall, apprentice]) => {
      expect((master as ResidentDetail).master?.trade).toBe(mm.trade);
      expect((master as ResidentDetail).craft?.[0]?.trade).toBe(mm.trade);
      expect((building as BuildingDetail).master?.id).toBe(mm.master);
      expect((home as BuildingDetail).candle).toBeGreaterThan(0);
      if (hall) expect((hall as BuildingDetail).lamplighter?.jobs).toBeGreaterThan(0);
      if (apprentice) expect((apprentice as ResidentDetail).apprenticeOf?.id).toBe(mm.master);
    });
  });
});
