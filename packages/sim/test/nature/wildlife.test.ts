// C5C: every species can be sighted in a fixture built for it (one test per content row, thresholds
// read from content), never outside its seasons or hours or below its habitat; the first sighting
// writes a Field Guide page, credits the right seats and unlocks the two achievements.
import { content, type WildlifeDef } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { checkAchievements } from '../../src/systems/achievements';
import { hoursOf, refreshHints, rollSightings } from '../../src/systems/nature/wildlife';
import { createTickCtx } from '../../src/turn';
import { addDecorAt, placeFree, tickAt } from '../fixtures/seasonsPlace';
import { EMPTY_CHUNK, EX, EZ, natureFixture, setHabitats } from '../fixtures/nature';

const S = MAP_SIZE;

/** The village with the species' habitat in the empty chunk, watched as it needs, at its time. */
function builtFor(
  def: WildlifeDef,
  opts: { season?: number; hour?: number; short?: boolean } = {},
): WorldState {
  const s = natureFixture().state;
  const scores: Record<string, number> = {};
  def.habitats.forEach(([h, min], i) => (scores[h] = opts.short && i === 0 ? min - 1 : min));
  setHabitats(s, EMPTY_CHUNK, scores);
  // Somebody lives here to notice.
  placeFree(s, 'cottage', EX + 10, EZ + 10);
  if (def.needs === 'hive') placeFree(s, 'apiary', EX + 4, EZ + 4);
  else if (def.needs === 'fisher') placeFree(s, 'fishery', EX + 4, EZ + 4).rt!.present = 1;
  else for (let x = EX; x < EX + 6; x++) s.map.road[(EZ + 8) * S + x] = Road.path;
  s.tick = tickAt(0, opts.season ?? def.seasons[0]!, 2, opts.hour ?? hoursOf(def)[0]!);
  return s;
}

function sightedWithin(s: WorldState, id: string, tries: number): boolean {
  const ctx = createTickCtx(s);
  for (let k = 0; k < tries; k++) {
    rollSightings(s, ctx);
    if (s.nature.guide.some((e) => e.species === id)) return true;
  }
  return false;
}

describe('wildlife', () => {
  for (const def of content.wildlife) {
    it(`${def.id}: sighted where its habitat is, never out of season, hours or habitat`, () => {
      expect(sightedWithin(builtFor(def), def.id, 600)).toBe(true);
      expect(sightedWithin(builtFor(def, { short: true }), def.id, 200)).toBe(false);
      const off = [0, 1, 2, 3].find((x) => !def.seasons.includes(x));
      if (off !== undefined) expect(sightedWithin(builtFor(def, { season: off }), def.id, 200)).toBe(false);
      const late = [...Array(24).keys()].find((h) => !hoursOf(def).includes(h))!;
      expect(sightedWithin(builtFor(def, { hour: late }), def.id, 200)).toBe(false);
    });
  }

  it('fish need a fisher at work and open water', () => {
    const trout = content.wildlifeById.get('trout')!;
    const s = builtFor(trout);
    for (const b of s.buildings) if (b.def === 'fishery') b.rt!.present = 0;
    expect(sightedWithin(s, 'trout', 200)).toBe(false);
    const frozen = builtFor(trout);
    frozen.weather.river = { frozen: true, frozenTick: 0 };
    expect(sightedWithin(frozen, 'trout', 200)).toBe(false);
  });

  it('wild country far from homes keeps its secrets', () => {
    const def = content.wildlifeById.get('mallard')!;
    const s = builtFor(def);
    s.buildings = s.buildings.filter((b) => b.def !== 'cottage' || b.x !== EX + 10);
    expect(sightedWithin(s, def.id, 300)).toBe(false);
  });

  it('honeybees need an apiary', () => {
    const bee = content.wildlifeById.get('honeybee')!;
    const s = builtFor(bee);
    s.buildings = s.buildings.filter((b) => b.def !== 'apiary');
    for (let x = EX; x < EX + 6; x++) s.map.road[(EZ + 8) * S + x] = Road.path;
    expect(sightedWithin(s, 'honeybee', 300)).toBe(false);
  });

  it('a first sighting writes a page for both seats, credited to who made the habitat', () => {
    const def = content.wildlifeById.get('bumblebee')!;
    const s = builtFor(def);
    const flower = content.decor.find((d) => d.tags.includes('flower') && !d.festival)!.id;
    const id = addDecorAt(s, flower, EX + 2.5, EZ + 2.5);
    s.decor.find((d) => d.id === id)!.builtBy = 1;
    const ctx = createTickCtx(s);
    for (let k = 0; k < 600 && !s.nature.guide.some((e) => e.species === def.id); k++) rollSightings(s, ctx);
    const entry = s.nature.guide.find((e) => e.species === def.id)!;
    expect(entry.seats).toEqual([1]);
    expect(entry.count).toBe(1);
    const ev = ctx.events.find((e) => e.e === 'species.sighted');
    expect(ev && ev.e === 'species.sighted' && ev.s.species).toBe(def.id);
    const line = s.chronicle.find((c) => c.kind === 'first-sighting');
    expect(line?.snapshot).toBeTruthy();
    expect(s.nature.hints).not.toContain(def.id);
    expect(s.nature.hints).toHaveLength(3);
    // Later sightings only count.
    const pages = s.nature.guide.length;
    for (let k = 0; k < 50; k++) rollSightings(s, ctx);
    expect(s.nature.guide.length).toBeGreaterThanOrEqual(pages);
    expect(s.nature.guide.find((e) => e.species === def.id)!.count).toBeGreaterThan(1);
    expect(ctx.events.filter((e) => e.e === 'species.sighted' && e.s.species === def.id)).toHaveLength(1);
  });

  it("a wild place with nobody's pieces credits the seats connected", () => {
    const def = content.wildlifeById.get('mallard')!;
    const s = builtFor(def);
    sightedWithin(s, def.id, 600);
    expect(s.nature.guide.find((e) => e.species === def.id)!.seats).toEqual([0, 1]);
  });

  it('a kingfisher brings The River Runs Clean, ten species Field Notes', () => {
    const s = builtFor(content.wildlifeById.get('kingfisher')!);
    expect(sightedWithin(s, 'kingfisher', 800)).toBe(true);
    const ctx = createTickCtx(s);
    expect(checkAchievements(s, ctx)).toContain('the-river-runs-clean');
    expect(s.nature.guide.length).toBeLessThan(10);
    for (const w of content.wildlife.slice(0, 10)) {
      if (!s.nature.guide.some((e) => e.species === w.id))
        s.nature.guide.push({ species: w.id, firstTick: s.tick, seats: [0], count: 1 });
    }
    expect(checkAchievements(s, ctx)).toContain('field-notes');
  });

  it('hints are the three commonest species not yet found', () => {
    const s = natureFixture().state;
    refreshHints(s);
    expect(s.nature.hints).toHaveLength(3);
    const top = Math.max(...content.wildlife.map((w) => w.rarity));
    expect(s.nature.hints.some((id) => content.wildlifeById.get(id)!.rarity === top)).toBe(true);
  });
});
