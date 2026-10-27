// C4C: the hiring and hauling changes the Village needed once the whole town ran (found with the
// autoplayer): elders hand their jobs on, open services and Village shortages hire first, porters
// skip destinations they cannot walk to, and grown-only or locked defs cannot be hand-placed.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { assignJobs, auditJobs, slotPriority, shortages } from '../../src/systems/residents/jobs';
import { tierShortages } from '../../src/systems/tiers/api';
import { townStock } from '../../src/view/hamlet';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';
import { ticks, toWork } from '../ledger/helpers';
import { place, villageWith } from './helpers';

describe('hiring in a Village', () => {
  it('an elder hands the job on', () => {
    const { state, b } = villageWith();
    const bakery = findById(state.buildings, b.bakery)!;
    const baker = findById(state.residents, bakery.rt!.workers[0]!)!;
    baker.stage = 'elder';
    auditJobs(state);
    expect(baker.jobId).toBe(0);
    expect(bakery.rt!.workers).not.toContain(baker.id);
  });

  it('an open tavern hires before a workshop, even out of cider', () => {
    const tavern = content.buildingById.get('tavern')!;
    const sawpit = content.buildingById.get('sawpit')!;
    expect(slotPriority(tavern, 0)).toBeLessThan(slotPriority(sawpit, 0));
    const { state } = villageWith();
    const t = place(state, 'tavern', 40, 58);
    t.rt!.status = 2; // missing input: still worth staffing
    const seeker = state.residents.find((r) => r.stage === 'adult' && r.jobId === 0 && r.tier === 'settler')!;
    assignJobs(state, createTickCtx(state), seeker);
    expect(seeker.jobId).toBe(t.id);
  });

  it('names what the Craftsfolk basket is short of, with what its workshops need, only in a Village', () => {
    const { state } = villageWith();
    for (const b of state.buildings) if (b.rt) b.rt.store.fill(0);
    const short = tierShortages(state, townStock(state));
    for (const g of ['firewood', 'cloth', 'yarn', 'wool', 'logs', 'bread', 'flour', 'cider', 'apples'])
      expect(short, g).toContain(g);
    expect(shortages(state).goods.has('cloth')).toBe(true);
    const hamlet = hamletFixture().state;
    expect(tierShortages(hamlet, townStock(hamlet))).toEqual([]);
  });
});

describe('hauling in a Village', () => {
  it('porters skip a site across the river and serve the one they can reach', { timeout: 60_000 }, () => {
    const { state, b } = villageWith();
    const cottage = content.buildingById.get('cottage')!;
    const far = insertBuilding(state, null, cottage, 104, 66, 0, 0); // east of the river, no bridge
    const near = insertBuilding(state, null, cottage, 88, 72, 0, 0);
    const store = findById(state.buildings, b.storehouses[1])!;
    toWork(state, store.rt!.workers);
    state.tick = 2 * TICKS_PER_HOUR;
    ticks(state, 2 * TICKS_PER_HOUR);
    const planks = content.goodIndex.get('planks')!;
    expect(near.rt!.construction!.delivered[planks]).toBeGreaterThan(0);
    expect(far.rt!.construction!.delivered[planks]).toBe(0);
    expect(state.logistics.jobs.every((j) => j.to !== far.id)).toBe(true);
  });
});

describe('relays between storehouses', () => {
  it(
    "carries planks to the storehouse that reaches a site beyond this one's range",
    { timeout: 60_000 },
    () => {
      const { state, b } = villageWith();
      const a = findById(state.buildings, b.storehouses[0])!;
      const bStore = findById(state.buildings, b.storehouses[1])!;
      bStore.rt!.paused = true;
      const c = insertBuilding(state, null, content.buildingById.get('storehouse')!, 55, 55, 0, 0, {
        site: false,
      });
      const site = insertBuilding(state, null, content.buildingById.get('cottage')!, 68, 60, 0, 0);
      const porters = [...a.rt!.workers];
      // Two porters for the new storehouse, from the households at hand.
      for (const r of state.residents.filter((x) => x.stage === 'adult' && !x.jobId).slice(0, 2)) {
        r.jobId = c.id;
        c.rt!.workers.push(r.id);
        porters.push(r.id);
      }
      toWork(state, porters);
      state.tick = 2 * TICKS_PER_HOUR;
      ticks(state, 5 * TICKS_PER_HOUR);
      const planks = content.goodIndex.get('planks')!;
      expect(state.logistics.flows.some(([f, t]) => f === a.id && t === c.id)).toBe(true);
      expect(site.rt!.construction!.delivered[planks]).toBeGreaterThan(0);
    },
  );
});

describe('placing Village buildings', () => {
  it('waits for the rank or the innovation, and leaves grown-only defs to the lots', () => {
    const hamlet = hamletFixture().state;
    expect(rejection(run(hamlet, { t: 'build.place', def: 'tavern', x: 70, z: 40, rot: 0 }))).toBe('LOCKED');
    const { state } = villageWith();
    expect(rejection(run(state, { t: 'build.place', def: 'tavern', x: 40, z: 36, rot: 0 }))).toBeUndefined();
    expect(rejection(run(state, { t: 'build.place', def: 'workshop', x: 50, z: 36, rot: 0 }))).toBe(
      'NOT_ALLOWED',
    );
    expect(rejection(run(state, { t: 'build.place', def: 'sawmill', x: 96, z: 36, rot: 1 }))).toBe('LOCKED');
  });
});
