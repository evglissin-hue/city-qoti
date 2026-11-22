// R3B, story masters (11-residents.md, Story characters): a story character is a master from the
// day they arrive, by their arc, counts for Master of the House and does not use the trade's season.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, ResidentFlags } from '../../src/constants';
import { isMaster } from '../../src/systems/masters/api';
import { mastersMade } from '../../src/systems/masters/api';
import { mastersDay, masterWorld, qualify, res, today } from './masterFixture';

describe('story masters', () => {
  it('names the four arcs’ masteries, and Juniper none', () => {
    const by = (id: string) => content.storyById.get(id)?.mastery;
    expect(by('stonemason')).toBe('quarry');
    expect(by('inventor')).toBe('carpenter');
    expect(by('merchant')).toBe('shop');
    expect(by('herbalist')).toBe('market-garden');
    expect(by('musician')).toBeUndefined();
    for (const arc of content.stories)
      if (arc.mastery) expect(content.masterByOf.has(arc.mastery), arc.id).toBe(true);
  });

  it('makes a story character a master on arrival, with a line and a notice but no letter', () => {
    const w = masterWorld();
    const barnaby = res(w.state, w.crew[2]!);
    barnaby.flags |= ResidentFlags.story;
    w.state.stories.push({ arc: 'stonemason', residentId: barnaby.id, step: -1, stepTick: 0 });
    const events = mastersDay(w.state, false);
    expect(isMaster(barnaby)).toBe(true);
    expect(barnaby.mastery).toBe('quarry');
    expect(mastersMade(w.state)).toBe(1);
    expect(
      w.state.chronicle.some((c) => c.kind === 'master-arrived' && c.text.includes('master quarryman')),
    ).toBe(true);
    expect(events.some((e) => e.e === 'life.event' && e.kind === 'master')).toBe(true);
    expect(events.some((e) => e.e === 'notify' && e.kind === 'letter')).toBe(false);
    // Once: another night changes nothing.
    mastersDay(w.state, false);
    expect(mastersMade(w.state)).toBe(1);
  });

  it('does not use the trade’s season: a story master and a made one in the same trade and season', () => {
    const w = masterWorld();
    const pippa = res(w.state, w.crew[2]!);
    pippa.flags |= ResidentFlags.story;
    // Pippa is the carpenter's; the baker's season is untouched by her, and so is the carpenter's.
    w.state.stories.push({ arc: 'inventor', residentId: pippa.id, step: 0, stepTick: 0 });
    qualify(res(w.state, w.crew[1]!), 'baker');
    mastersDay(w.state, false);
    expect(mastersMade(w.state)).toBe(2);
    expect(w.state.masters.lastMade).toEqual([['baker', Math.floor(today(w.state) / DAYS_PER_SEASON)]]);
  });

  it('a story character without a mastery (Juniper) stays as they are', () => {
    const w = masterWorld();
    const j = res(w.state, w.crew[2]!);
    j.flags |= ResidentFlags.story;
    w.state.stories.push({ arc: 'musician', residentId: j.id, step: -1, stepTick: 0 });
    mastersDay(w.state, false);
    expect(isMaster(j)).toBe(false);
  });
});
