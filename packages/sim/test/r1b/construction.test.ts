// Construction in R1B (docs/spec/13-ledger.md, Construction): where to build first, the words a site
// short of a material uses, and Townhouses taking brick.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, TICKS_PER_HOUR } from '../../src/constants';
import type { Lot } from '../../src/contracts';
import { buildsFirst } from '../../src/systems/construction/first';
import { inspect } from '../../src/view/inspect';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run, S } from '../helpers';
import { everyoneToWork, ticks, ticksUntil, untilHour, withoutStall } from '../ledger/helpers';

const H = TICKS_PER_HOUR;
const zoneValue = (id: string) => content.zoneById.get(id)!.layerValue;

function lotAt(state: ReturnType<typeof hamletFixture>['state'], zone: number, x: number, z: number): Lot {
  const lot: Lot = {
    id: state.nextId++,
    zone,
    x,
    z,
    w: 2,
    d: 2,
    rot: 0,
    frontage: (z + 2) * S + x,
    desirability: 50,
    style: '',
    buildingId: 0,
    tick: 0,
  };
  state.lots.push(lot);
  // The lot pass drops lots the map does not show, so paint it as the cutter would.
  for (let tz = z; tz < z + lot.d; tz++) {
    for (let tx = x; tx < x + lot.w; tx++) {
      state.map.lot[tz * S + tx] = lot.id;
      state.map.zone[tz * S + tx] = zone;
    }
  }
  return lot;
}

describe('where to build first', () => {
  function twoSites() {
    const f = withoutStall();
    run(f.state, { t: 'build.place', def: 'cottage', x: 84, z: 48, rot: 0 });
    const plain = f.state.buildings[f.state.buildings.length - 1]!;
    expect(
      rejection(run(f.state, { t: 'build.place', def: 'cottage', x: 88, z: 48, rot: 0 })),
    ).toBeUndefined();
    const wanted = f.state.buildings[f.state.buildings.length - 1]!;
    for (const [site, zone] of [
      [wanted, 'crafts'],
      [plain, 'homes-low'],
    ] as const) {
      const lot = lotAt(f.state, zoneValue(zone), site.x, site.z);
      lot.buildingId = site.id;
      site.lot = lot.id;
    }
    // Both sites stand fully supplied, so builders may work on either.
    for (const site of [plain, wanted]) {
      const c = site.rt!.construction!;
      for (let g = 0; g < c.needs.length; g++) {
        c.delivered[g]! += c.needs[g]!;
        c.needs[g] = 0;
      }
    }
    return { f, plain, wanted };
  }

  function crewAt(f: ReturnType<typeof hamletFixture>, id: number): number {
    return f.state.residents.filter((r) => r.activity.kind === 'task' && r.activity.taskId === -id).length;
  }

  it('reads the lot of a site against the plan', () => {
    const { f, plain, wanted } = twoSites();
    expect(buildsFirst(f.state, wanted)).toBe(false);
    f.state.seasonPlan.buildFirst = 'crafts';
    expect(buildsFirst(f.state, wanted)).toBe(true);
    expect(buildsFirst(f.state, plain)).toBe(false);
  });

  it('sends builders to the site on the named zone before an older site', () => {
    const { f, plain, wanted } = twoSites();
    untilHour(f.state, 7);
    f.state.seasonPlan.buildFirst = 'crafts';
    everyoneToWork(f.state);
    ticksUntil(f.state, () => crewAt(f, plain.id) + crewAt(f, wanted.id) > 0, 10 * H);
    expect(crewAt(f, wanted.id)).toBeGreaterThan(0);
    expect(crewAt(f, plain.id)).toBe(0);
  });

  it('keeps placement order when the plan names nothing', () => {
    const { f, plain, wanted } = twoSites();
    untilHour(f.state, 7);
    everyoneToWork(f.state);
    ticksUntil(f.state, () => crewAt(f, plain.id) + crewAt(f, wanted.id) > 0, 10 * H);
    expect(crewAt(f, plain.id)).toBeGreaterThan(0);
    expect(crewAt(f, wanted.id)).toBe(0);
  });
});

describe('a site short of a material', () => {
  function waiting() {
    const f = hamletFixture();
    run(f.state, { t: 'build.place', def: 'cottage', x: 84, z: 48, rot: 0 });
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    ticks(f.state, H);
    site.rt!.status |= BuildingStatus.waitingMaterials;
    return { f, site };
  }
  const lines = (f: ReturnType<typeof hamletFixture>, id: number): string[] => {
    const d = inspect(f.state, 'building', id) as { status: string[] };
    return d.status;
  };

  it('names the material and says the carrier brings some while its rule allows', () => {
    const { f, site } = waiting();
    f.state.carrier.families[2]!.rule = 'essentials';
    expect(lines(f, site.id)).toContain('Waiting for 16 timber and 6 stone; the carrier brings some at ten');
  });

  it('leaves the carrier out when the Materials rule is never', () => {
    const { f, site } = waiting();
    f.state.carrier.families[2]!.rule = 'never';
    expect(lines(f, site.id)).toContain('Waiting for 16 timber and 6 stone');
  });
});

describe('Townhouses', () => {
  it('cost brick, and a cottage upgrades into one for 10 brick and 6 timber', () => {
    const t = content.buildingById.get('townhouse')!;
    expect(t.grows?.zone).toBe('homes-medium');
    const brick = t.cost!.goods!.find(([g]) => g === 'brick')?.[1] ?? 0;
    const timber = t.cost!.goods!.find(([g]) => g === 'timber')?.[1] ?? 0;
    expect(brick).toBeGreaterThanOrEqual(Math.max(4, Math.floor(timber / 3)));
    const up = content.buildingById.get('cottage')!.upgradesTo!;
    expect(up.def).toBe('townhouse');
    expect(up.goods).toEqual([
      ['brick', 10],
      ['timber', 6],
    ]);
    for (const d of content.buildings) {
      if (d.upgradesTo?.def === 'townhouse') {
        expect(d.upgradesTo.goods.find(([g]) => g === 'brick')?.[1]).toBeGreaterThanOrEqual(10);
      }
    }
  });
});
