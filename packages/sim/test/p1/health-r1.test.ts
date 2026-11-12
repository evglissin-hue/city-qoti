// The zones-first Ledger's health kinds (view/health.ts, R1F): each fires on a hand-built state
// and stays quiet where the town is fine.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, MAP_SIZE, TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Road, TREE_SPECIES, treeValue } from '../../src/map/layers';
import { insertBuilding } from '../../src/state/place';
import { HealthWatch } from '../../src/view/health';
import { hamletFixture } from '../fixtures/hamlet';

const DAY = TICKS_PER_DAY;
const SUMMER = DAYS_PER_SEASON * DAY;
const TIMBER = content.goodIndex.get('timber')!;
const GRAIN = content.goodIndex.get('grain')!;
const MATERIALS = 2;

const kinds = (w: HealthWatch, s: WorldState) => w.check(s).map((i) => i.kind);
const find = (w: HealthWatch, s: WorldState, kind: string) => w.check(s).find((i) => i.kind === kind);

/** Plants mature oaks near the point so a woods rule holds. */
function plant(s: WorldState, cx: number, cz: number, n: number): void {
  let left = n;
  for (let z = cz - 6; z <= cz + 6 && left > 0; z++)
    for (let x = cx - 6; x <= cx + 6 && left > 0; x++) {
      const i = z * MAP_SIZE + x;
      if (s.map.occupant[i] || s.map.road[i] || s.map.tree[i]) continue;
      s.map.tree[i] = treeValue(TREE_SPECIES.oak, 3);
      left--;
    }
}

/** A hamlet with no timber in any store and a lodge site waiting on it. */
function lodgeSite() {
  const f = hamletFixture();
  const s = f.state;
  for (const b of s.buildings) {
    if (!b.rt) continue;
    b.rt.store[TIMBER] = 0;
    b.rt.output[TIMBER] = 0;
  }
  const lodge = s.buildings.find((b) => b.id === f.b.sawpit)!;
  plant(s, lodge.x, lodge.z, 14);
  const site = insertBuilding(s, null, content.buildingById.get('foresters-lodge')!, 60, 56, 0, 0, {
    site: true,
  });
  return { s, lodge, site };
}

describe('the zones-first health kinds', () => {
  describe('site-unsupplied', () => {
    it('fires when a site waits a day on timber with no maker and the carrier on never', () => {
      const { s, lodge, site } = lodgeSite();
      s.carrier.families[MATERIALS]!.rule = 'never';
      // The built lodge would make the timber: take it away.
      s.buildings.splice(s.buildings.indexOf(lodge), 1);
      const w = new HealthWatch();
      s.tick = 0;
      expect(kinds(w, s)).not.toContain('site-unsupplied');
      s.tick = DAY + 1;
      const issue = find(w, s, 'site-unsupplied');
      expect(issue?.id).toBe(site.id);
      expect(issue?.text).toContain('timber');
    });

    it('stays quiet while a built lodge makes the timber', () => {
      const { s } = lodgeSite();
      s.carrier.families[MATERIALS]!.rule = 'never';
      const w = new HealthWatch();
      s.tick = 0;
      w.check(s);
      s.tick = DAY + 1;
      expect(kinds(w, s)).not.toContain('site-unsupplied');
    });

    it('fires when the carrier may buy timber and has not, and stays quiet once it has', () => {
      const { s, lodge } = lodgeSite();
      s.buildings.splice(s.buildings.indexOf(lodge), 1);
      s.carrier.families[MATERIALS]!.rule = 'always';
      const w = new HealthWatch();
      s.tick = 0;
      w.check(s);
      s.tick = DAY + 1;
      expect(kinds(w, s)).toContain('site-unsupplied');
      s.carrier.bought[s.carrier.bought.length - 1]![TIMBER] = 6;
      expect(kinds(w, s)).not.toContain('site-unsupplied');
    });
  });

  describe('business-short', () => {
    function shortBaker() {
      const f = hamletFixture();
      const s = f.state;
      const bakery = s.buildings.find((b) => b.id === f.b.bakery)!;
      expect(bakery.rt!.workers.length).toBeGreaterThan(0);
      bakery.rt!.input[GRAIN] = 0;
      return { s, bakery };
    }

    it('fires after a whole day short of grain while the carrier may buy it', () => {
      const { s } = shortBaker();
      const w = new HealthWatch();
      s.tick = SUMMER;
      expect(kinds(w, s)).not.toContain('business-short');
      s.tick = SUMMER + DAY;
      const issue = find(w, s, 'business-short');
      expect(issue?.text).toContain('baker');
      expect(issue?.text).toContain('grain');
    });

    it('stays quiet when food is on never', () => {
      const { s } = shortBaker();
      s.carrier.families[0]!.rule = 'never';
      const w = new HealthWatch();
      s.tick = SUMMER;
      w.check(s);
      s.tick = SUMMER + 2 * DAY;
      expect(kinds(w, s)).not.toContain('business-short');
    });

    it('stays quiet while grain is out of season (winter)', () => {
      const { s } = shortBaker();
      const w = new HealthWatch();
      s.tick = 3 * SUMMER;
      w.check(s);
      s.tick = 3 * SUMMER + 2 * DAY;
      expect(kinds(w, s)).not.toContain('business-short');
    });

    it('stays quiet when the baker has no hands, and a stocked input resets the clock', () => {
      const { s, bakery } = shortBaker();
      const w = new HealthWatch();
      s.tick = SUMMER;
      w.check(s);
      bakery.rt!.input[GRAIN] = 99;
      s.tick = SUMMER + DAY - 1;
      w.check(s);
      bakery.rt!.input[GRAIN] = 0;
      s.tick = SUMMER + DAY + 1;
      expect(kinds(w, s)).not.toContain('business-short');
      bakery.rt!.workers.length = 0;
      s.tick = SUMMER + 3 * DAY;
      expect(kinds(w, s)).not.toContain('business-short');
    });
  });

  describe('demand-unanswered', () => {
    it('fires when Homes is lit three days with no empty home lot', () => {
      const s = hamletFixture().state;
      s.lots = [];
      s.demand.lit = [true, false, false, false];
      const w = new HealthWatch();
      s.tick = 0;
      expect(kinds(w, s)).not.toContain('demand-unanswered');
      s.tick = 3 * DAY - 1;
      expect(kinds(w, s)).not.toContain('demand-unanswered');
      s.tick = 3 * DAY + 1;
      expect(find(w, s, 'demand-unanswered')?.text).toContain('homes');
    });

    it('stays quiet with an empty lot of either home density, or an unlit bar', () => {
      const s = hamletFixture().state;
      s.demand.lit = [true, false, false, false];
      s.lots = [
        {
          id: 900,
          zone: 1,
          x: 70,
          z: 40,
          w: 2,
          d: 3,
          rot: 0,
          frontage: 0,
          desirability: 50,
          style: '',
          buildingId: 0,
          tick: 0,
        },
      ];
      const w = new HealthWatch();
      s.tick = 0;
      w.check(s);
      s.tick = 4 * DAY;
      expect(kinds(w, s)).not.toContain('demand-unanswered');
      s.lots = [];
      s.demand.lit[0] = false;
      expect(kinds(w, s)).not.toContain('demand-unanswered');
    });

    it('skips Shops while the rank cannot paint them yet', () => {
      const s = hamletFixture().state;
      s.lots = [];
      s.demand.lit = [false, true, false, false];
      const w = new HealthWatch();
      s.tick = 0;
      w.check(s);
      s.tick = 5 * DAY;
      expect(kinds(w, s)).not.toContain('demand-unanswered');
    });
  });

  describe('site-rule-broken', () => {
    it('fires when the lodge loses its woods for a day, and clears when they return', () => {
      const f = hamletFixture();
      const s = f.state;
      const lodge = s.buildings.find((b) => b.id === f.b.sawpit)!;
      plant(s, lodge.x, lodge.z, 14);
      const w = new HealthWatch();
      s.tick = 0;
      expect(kinds(w, s)).not.toContain('site-rule-broken');
      s.map.tree.fill(0);
      s.tick = 1;
      w.check(s);
      s.tick = DAY + 2;
      const hit = w.check(s).filter((i) => i.kind === 'site-rule-broken' && i.id === lodge.id);
      expect(hit[0]?.text).toContain('foresters-lodge');
      plant(s, lodge.x, lodge.z, 14);
      const after = w.check(s).filter((i) => i.kind === 'site-rule-broken' && i.id === lodge.id);
      expect(after).toEqual([]);
    });

    it('fires when the road leaves the door of a granary', () => {
      const f = hamletFixture();
      const s = f.state;
      const lodge = s.buildings.find((b) => b.id === f.b.sawpit)!;
      plant(s, lodge.x, lodge.z, 14);
      const w = new HealthWatch();
      s.tick = 0;
      expect(kinds(w, s)).not.toContain('site-rule-broken');
      s.map.road.fill(Road.none);
      s.tick = 1;
      w.check(s);
      s.tick = DAY + 2;
      const hit = w.check(s).filter((i) => i.kind === 'site-rule-broken');
      expect(hit.some((i) => i.id === f.b.granary)).toBe(true);
    });
  });

  describe('guide-dead-end and story-dead-end', () => {
    it('flag a goal nothing can meet, after a whole day', () => {
      const s = hamletFixture().state;
      const step = content.guide.steps[s.guide.step]!;
      const saved = step.goal;
      s.guide.over = false;
      try {
        step.goal = { near: { building: 'no-such-building', of: 'home', within: 3 } } as never;
        const w = new HealthWatch();
        s.tick = 0;
        expect(kinds(w, s)).not.toContain('guide-dead-end');
        s.tick = DAY + 1;
        expect(find(w, s, 'guide-dead-end')?.text).toContain(step.id);
      } finally {
        step.goal = saved;
      }
      expect(kinds(new HealthWatch(), s)).not.toContain('guide-dead-end');
    });

    it('story-dead-end flags a waiting step whose goal cannot be met', () => {
      const s = hamletFixture().state;
      const arc = content.storyById.get('inventor')!;
      s.stories = [{ arc: 'inventor', residentId: 1, step: 0, stepTick: 0 }];
      const saved = arc.steps[0]!.goal;
      try {
        arc.steps[0]!.goal = { near: { building: 'no-such-building', of: 'home', within: 3 } } as never;
        const w = new HealthWatch();
        s.tick = 0;
        w.check(s);
        s.tick = DAY + 1;
        expect(find(w, s, 'story-dead-end')?.text).toContain('inventor');
      } finally {
        arc.steps[0]!.goal = saved;
      }
      expect(kinds(new HealthWatch(), s)).not.toContain('story-dead-end');
    });
  });
});
