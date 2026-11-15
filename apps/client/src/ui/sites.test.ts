// P2: the count of what open sites still wait for, which the Materials chip and the feed both read.
import { BuildingStatus, type BuildingView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { mockSession } from './mocks/session';
import { readSites } from './sites';

function site(id: number, needs: [string, number][], status: number, paused = false): BuildingView {
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
    rt: {
      jobs: 0,
      workers: 0,
      present: 0,
      status: status | (paused ? BuildingStatus.paused : 0),
      condition: 100,
      paused,
      progress: 0,
      input: [],
      output: [],
      store: [],
      construction: { stage: 0, progress: 0, needs, delivered: [], priority: false },
    },
  };
}

function mirrorWith(sites: BuildingView[], stock: Record<string, number>) {
  const { session } = mockSession();
  const m = session.mirror;
  for (const b of [...m.buildings.values()]) if (b.stage === 'construction') m.buildings.delete(b.id);
  for (const b of sites) m.buildings.set(b.id, b);
  m.stocks.value = {
    lines: m.stocks.value!.lines.map((l) => ({ ...l, stock: stock[l.good] ?? 0 })),
  };
  return m;
}

describe('readSites', () => {
  it('sums what open sites still need and sets it beside the stores', () => {
    const m = mirrorWith(
      [
        site(101, [['timber', 12]], BuildingStatus.waitingMaterials),
        site(
          100,
          [
            ['timber', 30],
            ['stone', 10],
          ],
          BuildingStatus.waitingMaterials,
        ),
        site(102, [], BuildingStatus.waitingBuilders),
      ],
      { timber: 6, stone: 40 },
    );
    const r = readSites(m);
    expect(r.open).toBe(3);
    expect(r.waitingMaterials).toEqual([100, 101]);
    expect(r.waitingBuilders).toEqual([102]);
    // Timber is 36 short, stone is covered: the worst shortfall leads.
    expect(r.goods).toEqual([
      { good: 'timber', need: 42, stock: 6 },
      { good: 'stone', need: 10, stock: 40 },
    ]);
    expect(r.need).toBe(52);
    expect(r.covered).toBe(16);
  });

  it('counts a paused site as open and leaves its needs out', () => {
    const m = mirrorWith([site(100, [['timber', 12]], BuildingStatus.waitingMaterials, true)], { timber: 0 });
    const r = readSites(m);
    expect(r.open).toBe(1);
    expect(r.waitingMaterials).toEqual([]);
    expect(r.goods).toEqual([]);
    expect(r.need).toBe(0);
  });

  it('reads an empty town as nothing waiting', () => {
    const m = mirrorWith([], {});
    expect(readSites(m)).toEqual({
      open: 0,
      waitingMaterials: [],
      waitingBuilders: [],
      goods: [],
      need: 0,
      covered: 0,
    });
  });
});
