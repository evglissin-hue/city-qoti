import { describe, expect, it } from 'vitest';
import { BuildingStatus, TICKS_PER_HOUR } from '../../src/constants';
import type { BuildingDetail } from '../../src/contracts';
import { buildingView, runtimeView, stocksView, workforceView } from '../../src/view';
import { inspect } from '../../src/view/inspect';
import { hamletFixture } from '../fixtures/hamlet';
import { run } from '../helpers';
import { building, everyoneToWork, good, ticks, toWork, untilHour } from './helpers';

const detail = (f: ReturnType<typeof hamletFixture>, id: number) =>
  inspect(f.state, 'building', id) as BuildingDetail;

describe('building views', () => {
  it('shows how far through its cycle a producer is', () => {
    const f = hamletFixture();
    // R1: the baker's workshop, one hand on a 2-hour cycle, is halfway after an hour.
    const bakery = building(f.state, f.b.bakery);
    toWork(f.state, bakery.rt!.workers);
    ticks(f.state, TICKS_PER_HOUR);
    expect(runtimeView(bakery.def, bakery.rt!, bakery).progress).toBeCloseTo(0.5, 2);
  });

  it('tells the inspector what a building makes and what it waits for', () => {
    const f = hamletFixture();
    const bakery = building(f.state, f.b.bakery);
    bakery.rt!.input[good('grain')] = 0;
    ticks(f.state, TICKS_PER_HOUR);
    const d = detail(f, bakery.id);
    expect(d.method).toEqual({ name: 'Bake bread', hours: 2 });
    // A 9-hour work day is 4.5 cycles of 2 grain into 3 bread.
    expect(d.rates).toEqual({ inputs: [['grain', 9]], outputs: [['bread', 13.5]] });
    // In spring, before any field turns golden, the baker says when the grain comes in.
    expect(d.status).toContain(
      'Waiting for grain: the first of it ripens in summer, so the ovens rest until then',
    );
    expect(d.producedToday).toEqual([]);
  });

  it('lists what a site still needs', () => {
    const f = hamletFixture();
    run(f.state, { t: 'build.place', def: 'cottage', x: 84, z: 48, rot: 0 });
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    ticks(f.state, TICKS_PER_HOUR);
    const d = detail(f, site.id);
    expect(site.rt!.status & BuildingStatus.noPorters).toBeFalsy();
    expect(d.status).toContain('Waiting for 16 timber and 6 stone');
    expect(d.status).toContain(
      'Far from every storehouse: porters make the long walk, so deliveries come slowly',
    );
    expect(buildingView(site).rt!.construction!.stage).toBe(0);
  });

  it('counts residents a well serves', () => {
    const f = hamletFixture();
    expect(detail(f, f.b.well).served).toEqual({ residents: 9, capacity: 30 });
  });

  it('marks porters out on a trip as present at work', () => {
    const f = hamletFixture();
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 6);
    const d = detail(f, f.b.storehouse);
    expect(d.workers.every((w) => w.present)).toBe(true);
  });
});

describe('reports', () => {
  it('builds the workforce report', () => {
    const f = hamletFixture();
    const w = workforceView(f.state);
    const th = w.lines.find((l) => l.def === 'town-hall')!;
    expect(th).toMatchObject({ role: 'builder', jobs: 4, workers: 2 });
    expect(w.employed).toBe(6);
    expect(w.unemployed).toBe(1);
    // Town hall 4, storehouse 4, granary 2, the baker 1, windmill 1, Forester's Lodge 3, stall 1.
    expect(w.jobs).toBe(4 + 4 + 2 + 1 + 1 + 3 + 1);
    expect(w.vacancies).toBe(w.jobs - 6);
  });

  it('keeps produced and consumed per day in the stocks view', () => {
    const f = hamletFixture();
    const bakery = building(f.state, f.b.bakery);
    toWork(f.state, bakery.rt!.workers);
    ticks(f.state, 2 * TICKS_PER_HOUR);
    const bread = stocksView(f.state).lines.find((l) => l.good === 'bread')!;
    expect(bread.producedToday).toBe(3);
    const grain = stocksView(f.state).lines.find((l) => l.good === 'grain')!;
    expect(grain.consumedToday).toBe(2);
  });
});
