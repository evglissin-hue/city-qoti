// @vitest-environment happy-dom
// P2-D: the Ledger's feed says what the town is waiting for (sites, zones, builders, hands), each
// line with something to click. Words, order, keys and the click on a zone line.
import {
  BuildingStatus,
  type BalancesView,
  type BuildingView,
  type DemandBarView,
  type DemandKind,
  type DemandReason,
} from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { alertsForLens, computeAlerts, FEED_FIT } from './alerts';
import { mockSession, type MockSession } from './mocks/session';
import { AlertsPanel } from './panels/Alerts';
import { mount, type Mounted } from './test/dom';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const rt = (status: number, extra: Partial<NonNullable<BuildingView['rt']>> = {}) => ({
  jobs: 0,
  workers: 0,
  present: 0,
  status,
  condition: 100,
  paused: false,
  progress: 0,
  input: [],
  output: [],
  store: [],
  ...extra,
});

function site(id: number, needs: [string, number][], status: number): BuildingView {
  return {
    id,
    def: 'cottage',
    x: 10 + id,
    z: 10,
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage: 'construction',
    foundation: false,
    rt: rt(status, { construction: { stage: 0, progress: 0, needs, delivered: [], priority: false } }),
  };
}

function built(id: number, def: string, status: number, jobs = 2): BuildingView {
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
    rt: rt(status, { jobs, workers: status & BuildingStatus.noWorkers ? 0 : jobs }),
  };
}

function bar(
  kind: DemandKind,
  value: number,
  lit: boolean,
  reasons: DemandReason[],
  why: string[],
): DemandBarView {
  return { kind, value, lit, reasons, why };
}

const QUIET_BARS = (): DemandBarView[] => [
  bar('homes', 0, false, [], []),
  bar('shops', 0, false, [], []),
  bar('workshops', 0, false, [], []),
  bar('farmland', 0, false, [], []),
];

/** A session with only the buildings, stocks and bars given: nothing else to make noise. */
function world(
  opts: {
    buildings?: BuildingView[];
    stock?: Record<string, number>;
    bars?: DemandBarView[];
    hour?: number;
  } = {},
): MockSession {
  const mock = mockSession();
  const m = mock.session.mirror;
  m.buildings.clear();
  for (const b of opts.buildings ?? []) m.buildings.set(b.id, b);
  m.stocks.value = {
    lines: m.stocks.value!.lines.map((l) => ({ ...l, stock: opts.stock?.[l.good] ?? 500 })),
  };
  m.demand.value = { bars: opts.bars ?? QUIET_BARS() };
  m.clock.value = { ...m.clock.value, hour: opts.hour ?? 10 };
  return mock;
}

const ledger = (mock: MockSession, dismissed = new Set<string>()) =>
  alertsForLens(computeAlerts(mock.session.mirror, [], { seat: 0 }), 'ledger', dismissed);
const texts = (mock: MockSession) => ledger(mock).map((a) => a.text);

describe('sites waiting for materials', () => {
  it('says one site, one good, with the maker and the carrier', () => {
    const mock = world({
      buildings: [site(1, [['timber', 12]], BuildingStatus.waitingMaterials)],
      stock: { timber: 4 },
    });
    const a = ledger(mock).find((x) => x.key.startsWith('sites-materials'))!;
    expect(a.text).toBe("A site needs 12 more timber; the stores hold 4. A Forester's lodge cuts timber.");
    expect(a.tone).toBe('warn');
    expect(a.icon).toBe('good:timber');
    expect(a.key).toBe('sites-materials-timber');
    expect(a.action).toEqual({ kind: 'building', id: 1 });
  });

  it('says several sites and goods, worst shortfall first, and drops the stone-low line', () => {
    const mock = world({
      buildings: [
        site(1, [['timber', 30]], BuildingStatus.waitingMaterials),
        site(
          2,
          [
            ['timber', 12],
            ['stone', 10],
          ],
          BuildingStatus.waitingMaterials,
        ),
        site(3, [['timber', 0]], BuildingStatus.waitingMaterials),
      ],
      stock: { timber: 6, stone: 4 },
    });
    const all = ledger(mock);
    const a = all.find((x) => x.key.startsWith('sites-materials'))!;
    expect(
      a.text.startsWith(
        "3 sites need 42 timber, 10 stone; 6 and 4 in store. A Forester's lodge cuts timber.",
      ),
    ).toBe(true);
    expect(a.key).toBe('sites-materials-stone+timber');
    // Stone is said once.
    expect(all.some((x) => x.key === 'stone-low')).toBe(false);
    expect(all.filter((x) => /stone/i.test(x.text))).toHaveLength(1);
  });

  it('keeps the old stone line when the sites line does not name stone', () => {
    const mock = world({
      buildings: [site(1, [['timber', 12]], BuildingStatus.waitingMaterials), site(2, [], 0)],
      stock: { timber: 4, stone: 2 },
    });
    mock.session.mirror.buildings.set(2, { ...site(2, [['stone', 0]], 0), def: 'granary' });
    const all = ledger(mock);
    expect(all.some((x) => x.key.startsWith('sites-materials-timber'))).toBe(true);
    expect(all.filter((x) => /stone/i.test(x.text)).length).toBeLessThanOrEqual(1);
  });

  it('names the carrier honestly when the treasury is empty or the rule is never', () => {
    const mock = world({
      buildings: [site(1, [['timber', 12]], BuildingStatus.waitingMaterials)],
      stock: { timber: 4 },
    });
    const m = mock.session.mirror;
    m.balances.value = {
      lines: [{ family: 'materials', rule: 'never' }],
    } as unknown as BalancesView;
    expect(texts(mock).find((t) => t.startsWith('A site'))).toContain(
      'The carrier is told never to buy materials.',
    );
    m.town.value = { ...m.town.value!, treasury: 0 };
    expect(texts(mock).find((t) => t.startsWith('A site'))).toContain(
      'The carrier buys none: the purse is empty.',
    );
  });

  it('says nothing when the stores cover what the sites need', () => {
    const mock = world({
      buildings: [site(1, [['timber', 12]], BuildingStatus.waitingMaterials)],
      stock: { timber: 40 },
    });
    expect(ledger(mock).some((x) => x.key.startsWith('sites-materials'))).toBe(false);
  });
});

describe('sites waiting for a builder', () => {
  const sites = (n: number) =>
    Array.from({ length: n }, (_, i) => site(i + 1, [], BuildingStatus.waitingBuilders));

  it('speaks by day, singular and plural, and is quiet at night', () => {
    expect(texts(world({ buildings: sites(1) }))).toContain(
      "A site is waiting for a builder. A Builder's Yard adds more of them.",
    );
    const two = world({ buildings: sites(2) });
    const a = ledger(two).find((x) => x.key === 'sites-builders')!;
    expect(a.text).toBe("2 sites are waiting for a builder. A Builder's Yard adds more of them.");
    expect(a.tone).toBe('quiet');
    expect(a.action).toEqual({ kind: 'building', id: 1 });
    for (const hour of [7, 19, 23, 2]) {
      expect(ledger(world({ buildings: sites(2), hour })).some((x) => x.key === 'sites-builders')).toBe(
        false,
      );
    }
    expect(ledger(world({ buildings: sites(2), hour: 8 })).some((x) => x.key === 'sites-builders')).toBe(
      true,
    );
  });
});

describe('zones the town wants', () => {
  const lit = (kind: DemandKind, reasons: DemandReason[], why: string[]) =>
    QUIET_BARS().map((b) => (b.kind === kind ? bar(kind, 80, true, reasons, why) : b));

  it("asks for more zoned land with the sim's first reason", () => {
    const mock = world({
      bars: lit(
        'homes',
        [{ code: 'newcomers' }, { code: 'needsLand' }],
        [
          'Newcomers would come: there is work, and the town draws them.',
          'The town needs more zoned land for it.',
        ],
      ),
    });
    const a = ledger(mock).find((x) => x.key === 'zone-homes-needsLand')!;
    expect(a.text).toBe('Zone more Homes. Newcomers would come: there is work, and the town draws them.');
    expect(a.tone).toBe('warn');
    expect(a.action).toEqual({ kind: 'tool', tool: 'zone', variant: 'homes-low' });
  });

  it("says why a lit bar cannot be answered, in the zone's name", () => {
    const cases: [DemandKind, string, string, string, string][] = [
      [
        'farmland',
        'outOfReach',
        'Lots are free, but too far from any storehouse for the porters. Zone nearer, or build a storehouse by them.',
        "Farmland: free lots lie beyond the porters' reach. Zone nearer, or add a storehouse.",
        'farms',
      ],
      [
        'workshops',
        'unsuitable',
        'Lots are free, but none suits a maker of timber.',
        'Workshops: lots are free, but none suits a maker of timber.',
        'crafts',
      ],
      [
        'homes',
        'noRoad',
        'Land is zoned for it, but no street runs along it. Lots are cut along streets.',
        'Homes: land is zoned for it, but no street runs along it. Lots are cut along streets.',
        'street',
      ],
    ];
    for (const [kind, code, why, text, tool] of cases) {
      const mock = world({ bars: lit(kind, [{ code: 'newcomers' }, { code: code as never }], ['x', why]) });
      const a = ledger(mock).find((x) => x.key === `zone-${kind}-${code}`)!;
      expect(a.text).toBe(text);
      expect(a.action).toMatchObject({ kind: 'tool', tool: tool === 'street' ? 'street' : 'zone' });
    }
  });

  it('points Shops before the Village at the Market Stall', () => {
    const mock = world({
      bars: lit(
        'shops',
        [{ code: 'noOutlet' }, { code: 'marketStall' }],
        ['x', 'Shops open with the Village charter. Until then, a Market Stall does the job.'],
      ),
    });
    const a = ledger(mock).find((x) => x.key === 'zone-shops-marketStall')!;
    expect(a.text).toBe('Shops wait for the Village charter. Until then, a Market Stall does the job.');
    expect(a.action).toEqual({ kind: 'tool', tool: 'zone' });
  });

  it('keeps a quiet bar quiet', () => {
    expect(ledger(world()).some((x) => x.key.startsWith('zone-'))).toBe(false);
  });
});

describe('growth on its way or held', () => {
  const quiet = (kind: DemandKind, value: number, code: DemandReason, why: string) =>
    QUIET_BARS().map((b) => (b.kind === kind ? bar(kind, value, false, [code], [why]) : b));

  it('tells the Ledger when homes wait on good evenings (R2X), even with the bar at nothing', () => {
    const why =
      'Newcomers ask what there is to do of an evening, and nobody has an answer. Places to go would bring them.';
    const m = world({ bars: quiet('homes', 0, { code: 'quietEvenings', value: 0 }, why) });
    const a = ledger(m).find((x) => x.key === 'growth-homes-quietEvenings')!;
    expect(a.text.startsWith('Homes: newcomers')).toBe(true);
    expect(a.tone).toBe('quiet');
  });

  it('says when a free lot will start, and what holds one back', () => {
    const waiting = world({
      bars: quiet(
        'homes',
        40,
        { code: 'lotWaiting', value: 13 },
        'A lot is free and waiting. Building starts at 13:00.',
      ),
    });
    const a = ledger(waiting).find((x) => x.key === 'growth-homes-lotWaiting')!;
    expect(a.text).toBe('Homes: a lot is free and waiting. Building starts at 13:00.');
    expect(a.tone).toBe('quiet');

    const held = world({
      bars: quiet(
        'workshops',
        40,
        { code: 'materials', good: 'timber' },
        'A lot is free, but the stores are too short of timber to start on it.',
      ),
    });
    const b = ledger(held).find((x) => x.key === 'growth-workshops-materials')!;
    expect(b.text).toBe('Workshops: a lot is free, but the stores are too short of timber to start on it.');
    expect(b.tone).toBe('warn');

    const busy = world({
      bars: quiet(
        'homes',
        40,
        { code: 'sitesBusy', value: 3 },
        '3 sites are going up already. The next lot starts when one is done.',
      ),
    });
    expect(texts(busy)).toContain(
      'Homes: 3 sites are going up already. The next lot starts when one is done.',
    );
  });

  it('says nothing for hands, for a bar at zero, or for a lot waiting with no hour', () => {
    expect(
      ledger(world({ bars: quiet('homes', 40, { code: 'hands' }, 'Businesses already stand empty.') }))
        .length,
    ).toBe(0);
    expect(ledger(world({ bars: quiet('homes', 0, { code: 'sitesBusy', value: 3 }, 'x') })).length).toBe(0);
    expect(ledger(world({ bars: quiet('homes', 40, { code: 'lotWaiting' }, 'x') })).length).toBe(0);
  });
});

describe('hands', () => {
  const empty = (id: number, def: string) => built(id, def, BuildingStatus.noWorkers, 2);

  it('says one workplace with nobody, then the jobs open in town', () => {
    const mock = world({ buildings: [empty(1, 'granary')] });
    const a = ledger(mock).find((x) => x.key === 'hands-empty')!;
    expect(a.text).toBe('Granary: nobody works here yet. 2 jobs are open; more Homes bring more folk.');
    expect(a.tone).toBe('quiet');
    expect(a.action).toEqual({ kind: 'building', id: 1 });
    // The one line stands in for the per-building line.
    expect(ledger(mock).filter((x) => x.key.startsWith('idle-'))).toHaveLength(0);
  });

  it('never suggests Homes while homes wait on good evenings (R2X), and points at the gap', () => {
    const quietWhy = 'Newcomers ask what there is to do of an evening, and nobody has an answer.';
    const bars = QUIET_BARS().map((b) =>
      b.kind === 'homes' ? bar('homes', 0, false, [{ code: 'quietEvenings', value: 0 }], [quietWhy]) : b,
    );
    for (const buildings of [[empty(1, 'granary')], [empty(1, 'granary'), empty(2, 'quarry')]]) {
      const mock = world({ bars, buildings });
      const lines = ledger(mock).filter((x) => x.key === 'hands-empty' || x.key.startsWith('growth-homes'));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines)
        expect(`${l.text} ${l.title ?? ''}`).not.toMatch(/\bHomes bring\b|zone more Homes/i);
      expect(lines.find((x) => x.key === 'hands-empty')!.text).toMatch(/somewhere to go of an evening/);
    }
  });

  it('never says "0 jobs are open" beside a workplace with nobody', () => {
    const mock = world({ buildings: [built(1, 'granary', BuildingStatus.noWorkers, 0)] });
    const a = ledger(mock).find((x) => x.key === 'hands-empty');
    if (a) expect(a.text).not.toMatch(/\b0 jobs/);
  });

  it('groups several, names three, and counts the rest', () => {
    const three = world({ buildings: [empty(1, 'granary'), empty(2, 'market-stall'), empty(3, 'quarry')] });
    expect(texts(three)[0]).toBe(
      '3 workplaces have nobody yet. 6 jobs are open; more Homes bring more folk.',
    );
    const five = world({
      buildings: [
        empty(1, 'granary'),
        empty(2, 'market-stall'),
        empty(3, 'quarry'),
        empty(4, 'granary'),
        empty(5, 'granary'),
      ],
    });
    const line = ledger(five).find((x) => x.key === 'hands-empty')!;
    expect(line.text).toContain('5 workplaces have nobody yet.');
    // The names are for the hover: up to three, then the count.
    expect(line.title).toBe(
      'Nobody works at the Granary, the Market stall, the Quarry and 2 more yet. 10 jobs are open in town; more Homes bring more folk.',
    );
  });

  it('counts a single open job in the singular', () => {
    const mock = world({ buildings: [built(1, 'granary', BuildingStatus.noWorkers, 1)] });
    expect(texts(mock)[0]).toContain('1 job is open;');
  });

  it('keeps the other reasons of a building on its own line', () => {
    const mock = world({
      buildings: [built(1, 'foresters-lodge', BuildingStatus.noWorkers | BuildingStatus.noTrees)],
    });
    const all = ledger(mock);
    expect(all.some((x) => x.key === 'hands-empty')).toBe(true);
    const own = all.find((x) => x.key.startsWith('idle-1-'))!;
    expect(own.text).toBe("Forester's lodge: no mature trees in reach.");
  });
});

describe('fit', () => {
  it('keeps every line within what three lines of the panel hold, even with the longest names', () => {
    const bars = QUIET_BARS();
    bars[2] = bar(
      'workshops',
      80,
      true,
      [{ code: 'newcomers' }, { code: 'outOfReach' }],
      [
        'Newcomers would come: there is work, and the town draws them.',
        'Lots are free, but too far from any storehouse for the porters. Zone nearer, or build a storehouse by them.',
      ],
    );
    bars[3] = bar(
      'farmland',
      80,
      true,
      [{ code: 'newcomers' }, { code: 'needsLand' }],
      ['Newcomers would come: there is work, and the town draws them.', 'x'],
    );
    bars[0] = bar(
      'homes',
      40,
      false,
      [{ code: 'materials', good: 'firewood' }],
      ['A lot is free, but the stores are too short of firewood to start on it.'],
    );
    const mock = world({
      buildings: [
        site(1, [['timber', 120]], BuildingStatus.waitingMaterials),
        site(
          2,
          [
            ['stone', 100],
            ['firewood', 90],
          ],
          BuildingStatus.waitingMaterials,
        ),
        site(3, [], BuildingStatus.waitingBuilders),
        built(4, 'market-stall', BuildingStatus.noWorkers),
        built(5, 'granary', BuildingStatus.noWorkers),
      ],
      stock: { timber: 6, stone: 4, firewood: 2 },
      bars,
    });
    for (const a of ledger(mock)) expect(a.text.length, a.text).toBeLessThanOrEqual(FEED_FIT);
  });
});

describe('order and keys', () => {
  it('runs sites, zones, builders, hands, shortages, other idle lines, growth', () => {
    const bars = QUIET_BARS();
    bars[0] = bar('homes', 80, true, [{ code: 'needsLand' }], ['Newcomers would come.']);
    bars[1] = bar(
      'shops',
      30,
      false,
      [{ code: 'lotWaiting', value: 1 }],
      ['A lot is free and waiting. Building starts at 1:00.'],
    );
    const mock = world({
      buildings: [
        site(1, [['timber', 12]], BuildingStatus.waitingMaterials),
        site(2, [], BuildingStatus.waitingBuilders),
        built(3, 'granary', BuildingStatus.noWorkers),
        built(4, 'foresters-lodge', BuildingStatus.noTrees, 2),
      ],
      stock: { timber: 4 },
      bars,
    });
    mock.session.mirror.town.value = { ...mock.session.mirror.town.value!, leanTimes: true };
    const keys = ledger(mock).map((a) => a.key.replace(/-\d.*$/, ''));
    expect(keys).toEqual([
      'lean',
      'sites-materials-timber',
      'zone-homes-needsLand',
      'sites-builders',
      'hands-empty',
      'idle',
      'growth-shops-lotWaiting',
    ]);
  });

  it('keeps keys stable from one reading to the next, so a dismissal sticks', () => {
    const mock = world({
      buildings: [
        site(1, [['timber', 12]], BuildingStatus.waitingMaterials),
        built(3, 'granary', BuildingStatus.noWorkers),
      ],
      stock: { timber: 4 },
    });
    const before = ledger(mock);
    // Numbers move, the keys do not.
    const m = mock.session.mirror;
    m.stocks.value = {
      lines: m.stocks.value!.lines.map((l) => ({ ...l, stock: l.good === 'timber' ? 9 : l.stock })),
    };
    m.buildings.set(4, built(4, 'granary', BuildingStatus.noWorkers));
    const after = ledger(mock);
    for (const k of ['sites-materials-timber', 'hands-empty']) {
      expect(after.some((a) => a.key === k)).toBe(true);
      expect(before.some((a) => a.key === k)).toBe(true);
    }
    expect(ledger(mock, new Set(['hands-empty'])).some((a) => a.key === 'hands-empty')).toBe(false);
  });
});

describe('the panel', () => {
  it('selects the zone brush when a zone line is clicked', async () => {
    const bars = QUIET_BARS();
    bars[3] = bar(
      'farmland',
      80,
      true,
      [{ code: 'newcomers' }, { code: 'outOfReach' }],
      [
        'x',
        'Lots are free, but too far from any storehouse for the porters. Zone nearer, or build a storehouse by them.',
      ],
    );
    const mock = world({ bars });
    const picked: [string, string | undefined][] = [];
    (mock.session as unknown as { tools: unknown }).tools = {
      select: (id: string, variant?: string) => picked.push([id, variant]),
    };
    mock.session.ui.lens.value = 'ledger';
    view = await mount(h(AlertsPanel, { session: mock.session }));
    const row = view.get('alert-zone-farmland-outOfReach');
    expect(row.textContent).toContain('Farmland: free lots lie beyond');
    await view.click(row.querySelector('.alert-body')!);
    expect(picked).toEqual([['zone', 'farms']]);
  });

  it('shows three lines at rest, counts the rest and unfolds them (P3B)', async () => {
    const mock = world({
      buildings: [
        site(1, [['timber', 12]], BuildingStatus.waitingMaterials),
        site(2, [], BuildingStatus.waitingBuilders),
        built(3, 'granary', BuildingStatus.noWorkers),
        built(4, 'quarry', BuildingStatus.missingInput, 2),
        built(5, 'foresters-lodge', BuildingStatus.noTrees, 2),
        built(6, 'granary', BuildingStatus.outputFull, 2),
      ],
      stock: { timber: 4 },
    });
    mock.session.ui.lens.value = 'ledger';
    view = await mount(h(AlertsPanel, { session: mock.session }));
    expect(view.root.querySelectorAll('li.alert')).toHaveLength(3);
    expect(view.text()).toMatch(/and \d+ more/);
    const total = 3 + Number(/and (\d+) more/.exec(view.text())![1]);
    await view.click(view.get('feed-more'));
    expect(view.root.querySelectorAll('li.alert')).toHaveLength(total);
    expect(view.text()).toContain('Fold the rest away');
  });
});
