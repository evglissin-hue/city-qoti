// @vitest-environment happy-dom
// R2D: a feed never says a thing twice. Identical idle lines fold into one counted line at the
// source, gap rows come in both lenses, and across every fixture no two lines of a lens read alike.
import { BuildingStatus, TICKS_PER_DAY, type BuildingView, type GapsView, type Lens } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { alertsForLens, computeAlerts, foldSame, type Alert } from './alerts';
import { pluralName } from './format';
import { gapAlerts, gapLabel, gapSpot } from './gaps';
import { mockSession, mockVillageSession, mockSeasonsSession, type MockSession } from './mocks/session';
import { overlayEveningMocks } from './mocks/evening';

function idle(id: number, def: string, status: number): BuildingView {
  return {
    id,
    def,
    x: 30 + id,
    z: 30,
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage: 'built',
    foundation: false,
    rt: {
      jobs: 2,
      workers: 2,
      present: 0,
      status,
      condition: 100,
      paused: false,
      progress: 0,
      input: [],
      output: [],
      store: [],
    },
  };
}

const feed = (mock: MockSession, lens: Lens, seat = 0): Alert[] =>
  alertsForLens(computeAlerts(mock.session.mirror, [], { seat }), lens, new Set());

describe('pluralName', () => {
  it('pluralizes the last word, sensibly', () => {
    expect(pluralName("Forester's lodge")).toBe("Forester's lodges");
    expect(pluralName('Cottage')).toBe('Cottages');
    expect(pluralName('Market stall')).toBe('Market stalls');
    expect(pluralName('Bakery')).toBe('Bakeries');
    expect(pluralName('Granary')).toBe('Granaries');
    expect(pluralName('Bath House')).toBe('Bath Houses');
    expect(pluralName('Sawmill')).toBe('Sawmills');
    expect(pluralName('Hives')).toBe('Hives');
    expect(pluralName('Brickworks')).toBe('Brickworks');
    expect(pluralName('Glass')).toBe('Glasses');
    expect(pluralName('Key')).toBe('Keys');
  });
});

describe('identical idle lines fold', () => {
  const trees = BuildingStatus.noTrees;
  it('two idle lodges read as one counted line', () => {
    const mock = mockSession();
    const m = mock.session.mirror;
    m.buildings.clear();
    m.buildings.set(1, idle(1, 'foresters-lodge', trees));
    m.buildings.set(2, idle(2, 'foresters-lodge', trees));
    const lines = feed(mock, 'ledger').filter((a) => a.key.startsWith('idle-'));
    expect(lines.map((a) => a.text)).toEqual(["2 Forester's lodges: no mature trees in reach."]);
    expect(lines[0]!.action).toEqual({ kind: 'panel', panel: 'businesses' });
  });

  it('one lodge stays singular and goes to its building', () => {
    const mock = mockSession();
    const m = mock.session.mirror;
    m.buildings.clear();
    m.buildings.set(1, idle(1, 'foresters-lodge', trees));
    const lines = feed(mock, 'ledger').filter((a) => a.key.startsWith('idle-'));
    expect(lines.map((a) => a.text)).toEqual(["Forester's lodge: no mature trees in reach."]);
    expect(lines[0]!.action).toEqual({ kind: 'building', id: 1 });
  });

  it('counts a hidden tail by buildings, not lines', () => {
    const mock = mockSession();
    const m = mock.session.mirror;
    m.buildings.clear();
    const defs = ['foresters-lodge', 'granary', 'quarry', 'windmill', 'market-stall'];
    let id = 1;
    for (const d of defs) {
      m.buildings.set(id, idle(id, d, trees));
      id++;
      m.buildings.set(id, idle(id, d, trees));
      id++;
    }
    const lines = feed(mock, 'ledger').filter((a) => a.key.startsWith('idle-'));
    expect(lines).toHaveLength(5);
    expect(lines.at(-1)!.text).toBe('And 2 more buildings standing about.');
  });

  it('foldSame keeps one of any two same-lens lines that read alike', () => {
    const a: Alert = { key: 'a', lens: 'ledger', tone: 'quiet', icon: 'x', text: 'Same.' };
    const folded = foldSame([a, { ...a, key: 'b' }, { ...a, key: 'c', lens: 'hearth' }]);
    expect(folded.map((x) => `${x.lens}:${x.key}`)).toEqual(['ledger:a', 'hearth:c']);
  });
});

describe('gap rows', () => {
  it('lists each open gap in both lenses, with what would close it, and clicks to its place', () => {
    const mock = mockSession();
    const m = mock.session.mirror;
    overlayEveningMocks(mock.session);
    const open = m.gaps.value!.open;
    expect(open.length).toBeGreaterThan(0);
    for (const lens of ['hearth', 'ledger'] as const) {
      for (const g of open) {
        const row = feed(mock, lens).find((a) => a.key === `gap-${g.id}`)!;
        expect(row.text).toBe(g.text);
        expect(row.note).toBe(g.closes);
        expect(row.title).toContain(g.closes);
        expect(row.tone).toBe(g.lane === 'ledger' ? 'warn' : 'news');
        expect(row.action).toEqual({ kind: 'place', ...gapSpot(g) });
      }
    }
  });

  it('shows a gap closed today once, crediting the closer by name', () => {
    const mock = mockSession();
    const m = mock.session.mirror;
    overlayEveningMocks(mock.session);
    const closed = m.gaps.value!.closed[0]!;
    const name = m.seats.value.find((s) => s.seat === 1)!.name;
    const rows = feed(mock, 'ledger').filter((a) => a.key.startsWith('gap-closed-'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe(`Closed by ${name}: ${closed.text}`);
    expect(rows[0]!.tone).toBe('quiet');
    // A day later it is gone.
    m.tick.value += TICKS_PER_DAY;
    expect(gapAlerts(m, { seat: 0 }).filter((a) => a.key.startsWith('gap-closed-'))).toHaveLength(0);
  });

  it('says nothing without gaps', () => {
    const mock = mockSession();
    mock.session.mirror.gaps.value = {
      open: [],
      closed: [],
      closedCount: 0,
      closedBySeat: [0, 0],
    } as GapsView;
    expect(gapAlerts(mock.session.mirror, { seat: 0 })).toEqual([]);
  });

  it('shortens a tag label at a word', () => {
    expect(gapLabel({ text: 'Mill Lane stays in of an evening.' })).toBe('Mill Lane stays in of an…');
    expect(gapLabel({ text: 'Short one.' })).toBe('Short one');
  });
});

describe('no two feed lines read the same', () => {
  const cases: [string, () => Promise<MockSession>][] = [
    ['hamlet', () => Promise.resolve(mockSession())],
    ['hamlet with the evening', () => Promise.resolve(withEvening(mockSession()))],
    ['village', () => Promise.resolve(mockVillageSession(0, { charter: true }))],
    [
      'village with the evening',
      () => Promise.resolve(withEvening(mockVillageSession(0, { charter: true }))),
    ],
    ['winter', () => mockSeasonsSession('winter')],
    ['winter with the evening', async () => withEvening(await mockSeasonsSession('winter'))],
  ];
  function withEvening(mock: MockSession): MockSession {
    overlayEveningMocks(mock.session);
    return mock;
  }
  for (const [name, make] of cases) {
    it(`in ${name}, in both lenses and from both seats`, async () => {
      const mock = await make();
      for (const seat of [0, 1])
        for (const lens of ['hearth', 'ledger'] as const) {
          const texts = feed(mock, lens, seat).map((a) => a.text);
          expect(texts, `${name} ${lens} seat ${seat}`).toEqual([...new Set(texts)]);
          const keys = feed(mock, lens, seat).map((a) => a.key);
          expect(keys).toEqual([...new Set(keys)]);
        }
    });
  }
});
