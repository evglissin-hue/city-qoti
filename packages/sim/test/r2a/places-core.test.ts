// R2A: the place index's sources by example and its determinism rule (a pure function of saved state).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TILE_FP } from '../../src/constants';
import { insertBuilding } from '../../src/state/place';
import { deserialize, serialize } from '../../src/state/serialize';
import { invalidatePlaces, placeIndex } from '../../src/systems/places';
import { placeById } from '../../src/systems/places/api';
import { flatWorld, run, S } from '../helpers';

const fp = (t: number) => t * TILE_FP + TILE_FP / 2;

function place(def: string, x: number, z: number, w = flatWorld()) {
  run(w, { t: 'decor.place', def, fx: fp(x), fz: fp(z), rot: 0 });
  return w;
}

describe('the place index', () => {
  it('finds a bench as a sitting spot with its seats, standing room and kind', () => {
    const w = place('bench', 40, 40);
    const [p] = placeIndex(w).places;
    expect(p).toBeDefined();
    expect(p!.source).toBe('seats');
    expect(p!.id).toBe(`seats:${w.decor[0]!.id}`);
    expect(p!.seats).toBe(2);
    expect(p!.childSeats).toBe(0);
    expect(p!.standing).toBe(content.places.standingMin);
    expect(p!.kinds).toEqual(['sit']);
    expect(p!.tile).toBe(40 * S + 40);
  });

  it('groups seat pieces within spotRadius, up to spotMaxPieces, and starts another spot beyond', () => {
    const w = flatWorld();
    for (let i = 0; i < 5; i++) place('bench', 40 + i, 40, w);
    const ps = placeIndex(w).places;
    expect(ps.length).toBe(2);
    expect(ps[0]!.members.length).toBe(content.places.spotMaxPieces);
    expect(ps[0]!.seats).toBe(2 * content.places.spotMaxPieces);
    expect(ps[1]!.members.length).toBe(1);
  });

  it('gives a swing child seats and the play kind', () => {
    const w = place('swing', 40, 40);
    const [p] = placeIndex(w).places;
    expect(p!.childSeats).toBe(2);
    expect(p!.kinds).toContain('play');
    expect(p!.kinds).not.toContain('sit');
  });

  it('a fire near a bench warms it; a fire alone is a place of its own', () => {
    const w = place('bench', 40, 40);
    place('brazier', 41, 40, w);
    place('brazier', 60, 60, w);
    const ps = placeIndex(w).places;
    const spot = ps.find((p) => p.source === 'seats')!;
    expect(spot.warm).toBe(true);
    expect(spot.standing).toBe(8 + content.places.standingMin);
    const fire = ps.find((p) => p.id.startsWith('fire:'))!;
    expect(fire.standing).toBe(8 + content.places.standingMin);
    expect(fire.warm).toBe(true);
  });

  it('a built tavern is a host with its seats, standing share, shelter and warmth', () => {
    const w = flatWorld();
    const b = insertBuilding(w, null, content.buildingById.get('tavern')!, 50, 50, 0, 0, { site: false });
    const p = placeById(w, `host:${b.id}`)!;
    expect(p).toBeDefined();
    expect(p.seats).toBe(12);
    expect(p.standing).toBe(6);
    expect(p.sheltered).toBe(true);
    expect(p.warm).toBe(true);
    expect(p.kinds).toEqual(['sit', 'eat', 'meet']);
  });

  it('sees a piece placed this turn and one pulled down, and is the same after a round trip through a save', () => {
    const w = place('bench', 40, 40);
    expect(placeIndex(w).places.length).toBe(1);
    place('bench', 70, 70, w);
    expect(placeIndex(w).places.length).toBe(2);
    run(w, { t: 'decor.remove', ids: [w.decor[0]!.id] });
    expect(placeIndex(w).places.length).toBe(1);
    const copy = deserialize(serialize(w));
    expect(JSON.stringify(placeIndex(copy).places)).toBe(JSON.stringify(placeIndex(w).places));
    invalidatePlaces(w);
    expect(JSON.stringify(placeIndex(copy).places)).toBe(JSON.stringify(placeIndex(w).places));
  });

  it('draws from the charm over its tiles, capped, and a view of water', () => {
    const w = place('bench', 97, 40);
    const p = placeIndex(w).places[0]!;
    expect(p.kinds).toContain('view');
    expect(p.parts.water).toBe(content.places.waterBonus);
    for (const t of p.tiles) w.map.charm[t] = 90;
    w.tick += 1;
    const q = placeIndex(w).places[0]!;
    expect(q.parts.charm).toBe(content.places.charmCap);
    expect(q.draw).toBe(content.places.charmCap + q.parts.pieces + q.parts.water);
  });
});
