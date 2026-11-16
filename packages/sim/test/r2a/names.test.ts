// R2A: place names by example, one per source, and what happens when a name is taken.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TILE_FP } from '../../src/constants';
import type { Place, WorldState } from '../../src/contracts';
import { rngFromSeed } from '../../src/rng/streams';
import { insertBuilding } from '../../src/state/place';
import { placeIndex } from '../../src/systems/places';
import { placeNameFor } from '../../src/systems/places/names';
import { createHousehold } from '../../src/systems/residents/generate';
import { flatWorld, run, S } from '../helpers';

const fp = (t: number) => t * TILE_FP + TILE_FP / 2;
const NONE: ReadonlySet<string> = new Set();

/** A cottage at (x, z) with a family in it. */
function cottage(w: WorldState, x: number, z: number, family = 'Underbank') {
  const b = insertBuilding(w, null, content.buildingById.get('cottage')!, x, z, 0, 0, { site: false });
  const { household } = createHousehold(w, rngFromSeed('names', 'residents'), {
    species: 'human',
    stages: ['adult'],
    homeId: b.id,
    tile: z * S + x,
    inside: 0,
    activity: { kind: 'home' },
  });
  household.family = family;
  return b;
}

function fake(
  id: string,
  source: Place['source'],
  def: string,
  tile: number,
  extra: Partial<Place> = {},
): Place {
  return {
    id,
    source,
    def,
    tile,
    tiles: [tile],
    members: [],
    seats: 0,
    childSeats: 0,
    standing: 0,
    kinds: [],
    sheltered: false,
    warm: false,
    outlets: [],
    draw: 0,
    parts: { charm: 0, site: 0, pieces: 0, water: 0, lit: 0, treats: 0, winter: 0 },
    ...extra,
  };
}

describe('place names', () => {
  it('names a bench by the nearest family', () => {
    const w = flatWorld();
    cottage(w, 44, 44);
    run(w, { t: 'decor.place', def: 'bench', fx: fp(40), fz: fp(40), rot: 0 });
    const [p] = placeIndex(w).places;
    expect(placeNameFor(w, p!, NONE)).toBe('the bench by the Underbank cottage');
  });

  it('gives two benches by one cottage different names', () => {
    const w = flatWorld();
    cottage(w, 44, 44);
    run(w, { t: 'decor.place', def: 'bench', fx: fp(40), fz: fp(40), rot: 0 });
    run(w, { t: 'decor.place', def: 'bench', fx: fp(40), fz: fp(48), rot: 0 });
    const [a, b] = placeIndex(w).places;
    const first = placeNameFor(w, a!, NONE);
    const second = placeNameFor(w, b!, new Set([first]));
    expect(second).toBe('the other bench by the Underbank cottage');
    const third = placeNameFor(w, b!, new Set([first, second]));
    expect(third).toBe('the third bench by the Underbank cottage');
  });

  it('falls back to the water, then the edge of town', () => {
    const w = flatWorld();
    const wet = fake('seats:1', 'seats', 'bench', 98 * S + 50);
    wet.parts.water = 5;
    expect(placeNameFor(w, wet, NONE)).toBe('the bench by the water');
    expect(placeNameFor(w, fake('seats:2', 'seats', 'bench', 60 * S + 60), NONE)).toBe(
      'the bench at the edge of town',
    );
  });

  it('names a porch for its family', () => {
    const w = flatWorld();
    const b = cottage(w, 44, 44);
    const p = fake(`porch:${b.id}`, 'porch', 'cottage', 44 * S + 44, { members: [b.id] });
    expect(placeNameFor(w, p, NONE)).toBe("the Underbanks' porch");
  });

  it('names sites, hosts, fires, the ice and the festival', () => {
    const w = flatWorld();
    cottage(w, 44, 44);
    const t = 46 * S + 46;
    const site = fake('site:lantern-walk:1', 'site', 'lantern-walk', t);
    expect(placeNameFor(w, site, NONE)).toBe('the Lantern Walk');
    expect(placeNameFor(w, site, new Set(['the Lantern Walk']))).toBe(
      'the Lantern Walk by the Underbank cottage',
    );
    expect(placeNameFor(w, fake('host:9', 'host', 'well', t), NONE)).toBe('the well');
    expect(placeNameFor(w, fake('fire:9', 'host', 'brazier', t), NONE)).toBe(
      'the brazier by the Underbank cottage',
    );
    expect(placeNameFor(w, fake('ice:9', 'host', 'ice', t), NONE)).toBe('the ice by the Underbank cottage');
    expect(placeNameFor(w, fake('festival:9', 'host', 'lantern-night', t), NONE)).toBe(
      `the ${content.festivalById.get('lantern-night')!.name} grounds`,
    );
  });

  it('runs out of variants gracefully and never repeats', () => {
    const w = flatWorld();
    const p = fake('seats:2', 'seats', 'bench', 60 * S + 60);
    const taken = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const n = placeNameFor(w, p, taken);
      expect(taken.has(n)).toBe(false);
      expect(n.length).toBeLessThan(60);
      taken.add(n);
    }
  });
});
