// R3E: the R3 health kinds (view/health.ts). Each flags its case on a village fixture built by hand
// (a stub def passed into content, a stock put in a building, a hint pushed into the Town Book) and
// stays quiet on a normal town. Nothing here depends on a stand-in's body: R3A's, R3B's and R3C's
// systems are not run, and the cases are driven through the contracts' state.
import { content, type DecorDef, type SpecialtyDef } from '@qoti/content';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Gap, WorldState } from '../../src/contracts';
import { MASTER_GOOD_IDS } from '../../src/state/masters';
import * as achievableModule from '../../src/systems/gaps/achievable';
import * as suppliesModule from '../../src/systems/supplies/api';
import { HealthWatch, type HealthKind } from '../../src/view/health';
import { villageFixture } from '../fixtures/village';

const DAY = TICKS_PER_DAY;
const HOUR = TICKS_PER_HOUR;
const PIES = content.goodIndex.get('pies')!;

const ofKind = (w: HealthWatch, s: WorldState, kind: HealthKind) => w.check(s).filter((i) => i.kind === kind);

/** An hourly look from `from` to `to` ticks, collecting the kind's issues from every look. */
function look(w: HealthWatch, s: WorldState, kind: HealthKind, from: number, to: number) {
  const all: ReturnType<typeof ofKind> = [];
  for (let t = from; t <= to; t += HOUR) {
    s.tick = t;
    all.push(...ofKind(w, s, kind));
  }
  return all;
}

// Content stubs are removed after each test.
const stubDecor: string[] = [];
const stubSpecialties: string[] = [];
afterEach(() => {
  for (const id of stubDecor.splice(0)) (content.decorById as Map<string, DecorDef>).delete(id);
  for (const id of stubSpecialties.splice(0)) (content.specialtyById as Map<string, SpecialtyDef>).delete(id);
  vi.restoreAllMocks();
});

function stubLantern(id: string, good: string): void {
  const base = content.decor.find((d) => d.supply?.kind === 'nightly')!;
  (content.decorById as Map<string, DecorDef>).set(id, {
    ...base,
    id,
    supply: { kind: 'nightly', good, qty: 1, per: 4, rests: 'unlit' },
  });
  stubDecor.push(id);
}

function placeDecor(s: WorldState, def: string): number {
  const id = s.nextId++;
  s.decor.push({ id, def, fx: 61 * 256 + 128, fz: 53 * 256 + 128, rot: 0, builtBy: 0 });
  return id;
}

describe('supply-unsuppliable', () => {
  it('flags a lantern whose good has no maker and no neighbor, once, from Village rank', () => {
    const { state: s } = villageFixture();
    stubLantern('stub-lantern', 'moonbeams');
    const piece = placeDecor(s, 'stub-lantern');
    const w = new HealthWatch();
    const issues = look(w, s, 'supply-unsuppliable', 0, 2 * DAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.id).toBe(piece);
    expect(issues[0]!.text).toContain('moonbeams');
  });

  it('stays quiet below the supplies rank', () => {
    const { state: s } = villageFixture();
    s.charter.rank = 'hamlet';
    stubLantern('stub-lantern', 'moonbeams');
    placeDecor(s, 'stub-lantern');
    expect(look(new HealthWatch(), s, 'supply-unsuppliable', 0, 2 * DAY)).toHaveLength(0);
  });

  it('stays quiet on every real supplied piece standing in a Village', () => {
    const { state: s } = villageFixture();
    for (const d of content.decor) if (d.supply) placeDecor(s, d.id);
    expect(look(new HealthWatch(), s, 'supply-unsuppliable', 0, 2 * DAY)).toHaveLength(0);
  });
});

describe('master-good-unsold', () => {
  const stripOutlets = (s: WorldState) => {
    s.buildings = s.buildings.filter((b) => {
      const tags = content.buildingById.get(b.def)?.tags ?? [];
      return !tags.includes('market') && !tags.includes('tavern');
    });
  };

  it('flags pies in stock for a whole day while no outlet in town takes Treats', () => {
    const { state: s, b } = villageFixture();
    stripOutlets(s);
    const bakery = s.buildings.find((x) => x.id === b.bakery)!;
    bakery.rt!.output[PIES] = 4;
    const w = new HealthWatch();
    expect(look(w, s, 'master-good-unsold', 0, DAY - HOUR)).toHaveLength(0);
    const issues = look(w, s, 'master-good-unsold', DAY, DAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.text).toContain('pies');
    expect(MASTER_GOOD_IDS.has('pies')).toBe(true);
  });

  it('stays quiet while a stall can shelve Treats', () => {
    const { state: s, b } = villageFixture();
    const bakery = s.buildings.find((x) => x.id === b.bakery)!;
    bakery.rt!.output[PIES] = 4;
    expect(look(new HealthWatch(), s, 'master-good-unsold', 0, 3 * DAY)).toHaveLength(0);
  });

  it('stays quiet when the stock is sold off before the day is out', () => {
    const { state: s, b } = villageFixture();
    stripOutlets(s);
    const bakery = s.buildings.find((x) => x.id === b.bakery)!;
    bakery.rt!.output[PIES] = 4;
    const w = new HealthWatch();
    look(w, s, 'master-good-unsold', 0, DAY - 2 * HOUR);
    bakery.rt!.output[PIES] = 0;
    expect(look(w, s, 'master-good-unsold', DAY - HOUR, 3 * DAY)).toHaveLength(0);
  });
});

describe('page-unproducible', () => {
  it('stays quiet on content and on a hint of a real page', () => {
    const { state: s } = villageFixture();
    s.townBook.hints = [content.specialties[0]!.id, content.customs[0]!.id];
    expect(look(new HealthWatch(), s, 'page-unproducible', 0, DAY)).toHaveLength(0);
  });

  it('flags a hint at a page content does not have, once', () => {
    const { state: s } = villageFixture();
    s.townBook.hints = ['no-such-page'];
    const issues = look(new HealthWatch(), s, 'page-unproducible', 0, 2 * DAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.text).toContain('no-such-page');
  });

  it('flags a hint at a specialty whose flavor is not a Treat', () => {
    const { state: s } = villageFixture();
    (content.specialtyById as Map<string, SpecialtyDef>).set('stub-bread', {
      ...content.specialties[0]!,
      id: 'stub-bread',
      good: 'bread',
    });
    stubSpecialties.push('stub-bread');
    s.townBook.hints = ['stub-bread'];
    const issues = look(new HealthWatch(), s, 'page-unproducible', 0, DAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.text).toContain('not a Treat');
  });
});

describe('the fourth gap under both rules', () => {
  const gap = (s: WorldState): Gap => {
    const g: Gap = {
      id: s.nextId++,
      kind: 'shortOfSupplies',
      subject: 'place:stub',
      tile: 0,
      openedDay: 0,
      n: 9,
    };
    s.gaps.open.push(g);
    return g;
  };

  it('is gap-unmeetable when R3A says the valley cannot meet it', () => {
    const { state: s } = villageFixture();
    vi.spyOn(suppliesModule, 'supplyGapAchievable').mockReturnValue(false);
    gap(s);
    const issues = look(new HealthWatch(), s, 'gap-unmeetable', 0, DAY);
    expect(issues.map((i) => i.text).join()).toContain('shortOfSupplies');
  });

  it('is gap-dead-end when it is achievable but nothing could close it', () => {
    const { state: s } = villageFixture();
    vi.spyOn(suppliesModule, 'supplyGapAchievable').mockReturnValue(true);
    vi.spyOn(suppliesModule, 'supplyGapClosable').mockReturnValue(false);
    gap(s);
    const w = new HealthWatch();
    const issues = look(w, s, 'gap-dead-end', 0, DAY);
    expect(issues.map((i) => i.text).join()).toContain('shortOfSupplies');
    expect(look(w, s, 'gap-unmeetable', DAY, DAY)).toHaveLength(0);
  });

  it('is quiet when it is achievable and closable', () => {
    const { state: s } = villageFixture();
    vi.spyOn(suppliesModule, 'supplyGapAchievable').mockReturnValue(true);
    vi.spyOn(suppliesModule, 'supplyGapClosable').mockReturnValue(true);
    gap(s);
    const w = new HealthWatch();
    expect(look(w, s, 'gap-dead-end', 0, 2 * DAY)).toHaveLength(0);
    expect(look(w, s, 'gap-unmeetable', 2 * DAY, 3 * DAY)).toHaveLength(0);
  });

  it('goes through gapAchievable, not around it: every R3 gap kind in content is handled', () => {
    const { state: s } = villageFixture();
    const spy = vi.spyOn(suppliesModule, 'supplyGapAchievable').mockReturnValue(true);
    for (const g of content.gaps.filter((x) => x.from === 'R3')) {
      expect(achievableModule.gapAchievable(s, g.kind)).toBe(true);
    }
    expect(spy).toHaveBeenCalled();
  });
});
