// The playability audit's health kinds (view/health.ts): each one fires on the state it is meant
// for and stays quiet on a healthy valley.
import { BuildingStatus, DAYS_PER_SEASON, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { insertBuilding } from '../../src/state/place';
import { HealthWatch, quietSeasons } from '../../src/view/health';
import { hamletFixture } from '../fixtures/hamlet';
import { run } from '../helpers';

const kinds = (w: HealthWatch, s: Parameters<HealthWatch['check']>[0]) => w.check(s).map((i) => i.kind);

describe('the playability health kinds', () => {
  it('stay quiet on a healthy hamlet', () => {
    const f = hamletFixture();
    const w = new HealthWatch();
    for (let d = 0; d < 8; d++) {
      f.state.tick = d * TICKS_PER_DAY;
      const k = kinds(w, f.state).filter((x) => x !== 'resident-stuck');
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

  it('idle-for-input: short of an input through a whole season', () => {
    const f = hamletFixture();
    const s = f.state;
    // R1: the windmill makes nothing of its own; the baker's workshop in its reach waits on grain.
    const mill = s.buildings.find((b) => b.id === f.b.bakery)!;
    mill.rt!.input[content.goodIndex.get('grain')!] = 0;
    mill.rt!.status |= BuildingStatus.missingInput;
    const w = new HealthWatch();
    // From the first day of summer, when the fields are cut (the owner's playtest: "a built windmill
    // useless in summer"; in R1 the baker beside it).
    const summer = DAYS_PER_SEASON * TICKS_PER_DAY;
    s.tick = summer;
    expect(kinds(w, s)).not.toContain('idle-for-input');
    s.tick = summer + (DAYS_PER_SEASON - 1) * TICKS_PER_DAY;
    expect(kinds(w, s)).not.toContain('idle-for-input');
    s.tick = summer + DAYS_PER_SEASON * TICKS_PER_DAY;
    const issue = w.check(s).find((i) => i.kind === 'idle-for-input');
    expect(issue?.text).toContain('workshop');
    expect(issue?.text).toContain('grain');
    // A clear look resets the clock.
    mill.rt!.status &= ~BuildingStatus.missingInput;
    expect(kinds(w, s)).not.toContain('idle-for-input');
  });

  it('idle-for-input: waiting on grain through winter and spring is the year, not a dead end', () => {
    expect([...quietSeasons('grain')].sort()).toEqual([0, 3]);
    expect([...quietSeasons('bread')].sort()).toEqual([0, 3]);
    expect(quietSeasons('timber').size).toBe(0);
    const f = hamletFixture();
    const s = f.state;
    const mill = s.buildings.find((b) => b.id === f.b.bakery)!;
    mill.rt!.input[content.goodIndex.get('grain')!] = 0;
    mill.rt!.status |= BuildingStatus.missingInput;
    const w = new HealthWatch();
    // Winter day 1 of the first year to the last hour of spring in the second: never flagged.
    for (let d = 3 * DAYS_PER_SEASON; d <= 5 * DAYS_PER_SEASON; d++) {
      s.tick = d * TICKS_PER_DAY - 1;
      expect(kinds(w, s)).not.toContain('idle-for-input');
    }
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
