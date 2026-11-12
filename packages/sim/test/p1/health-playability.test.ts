// The playability audit's health kinds (view/health.ts): each one fires on the state it is meant
// for and stays quiet on a healthy valley.
import { MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import { TREE_SPECIES, treeValue } from '../../src/map/layers';
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { insertBuilding } from '../../src/state/place';
import { HealthWatch, quietSeasons } from '../../src/view/health';
import { hamletFixture } from '../fixtures/hamlet';
import { run } from '../helpers';

const kinds = (w: HealthWatch, s: Parameters<HealthWatch['check']>[0]) => w.check(s).map((i) => i.kind);

describe('the playability health kinds', () => {
  it('quietSeasons: waiting on grain through winter and spring is the year, not a dead end', () => {
    expect([...quietSeasons('grain')].sort()).toEqual([0, 3]);
    expect([...quietSeasons('bread')].sort()).toEqual([0, 3]);
    expect(quietSeasons('timber').size).toBe(0);
  });

  it('stay quiet on a healthy hamlet', () => {
    const f = hamletFixture();
    // The fixture's lodge stands in a thin wood; give it the twelve trees its site rule asks for.
    const lodge = f.state.buildings.find((b) => b.id === f.b.sawpit)!;
    for (let i = 0; i < 14; i++)
      f.state.map.tree[(lodge.z + 3) * MAP_SIZE + lodge.x - 6 + i] = treeValue(TREE_SPECIES.oak, 3);
    const w = new HealthWatch();
    for (let d = 0; d < 8; d++) {
      f.state.tick = d * TICKS_PER_DAY;
      // The fixture's baker stands within the windmill's open ground (R1B owns the fixture).
      const k = w.check(f.state).filter((i) => i.kind !== 'resident-stuck' && !i.text.startsWith('windmill'));
      expect(k).toEqual([]);
    }
  });

  it('no-builders: a site waits and nothing built can raise it', () => {
    const f = hamletFixture();
    const s = f.state;
    s.settings.mode = 'sandbox';
    run(s, { t: 'build.remove', ids: [f.b.townHall] });
    s.settings.mode = 'standard';
    insertBuilding(s, null, content.buildingById.get('well')!, 60, 56, 0, 0, { site: true });
    const w = new HealthWatch();
    s.tick = 0;
    expect(kinds(w, s)).not.toContain('no-builders');
    s.tick = TICKS_PER_DAY + 1;
    expect(kinds(w, s)).toContain('no-builders');
  });

  it('festival-no-show: a plan that was current on the day and never started', () => {
    const f = hamletFixture();
    const s = f.state;
    // Day 6 of spring (index 5) at 19:00; tick 0 is 06:00.
    s.tick = 5 * TICKS_PER_DAY + 13 * TICKS_PER_HOUR;
    s.festival.plan = {
      festival: 'spring-fair',
      season: 0,
      year: 0,
      site: null,
      menu: [],
      reserved: [],
      twist: '',
      music: 'none',
      musician: 0,
      by: 0,
      tick: 0,
    };
    const w = new HealthWatch();
    expect(kinds(w, s)).toContain('festival-no-show');
    s.festival.live = true;
    expect(kinds(new HealthWatch(), s)).not.toContain('festival-no-show');
  });
});
