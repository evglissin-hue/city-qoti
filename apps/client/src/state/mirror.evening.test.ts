import { buildView, createWorld, defaultSettings, Flags, MAP_SIZE, type SimEvent } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { eveningMocks, mockPlace } from '../ui/mocks/evening';
import { Mirror } from './mirror';

// R2D: the Mirror keeps the evening round's views from the snapshot and their events.
function mirror(): Mirror {
  const m = new Mirror();
  m.load(buildView(createWorld('r2d-mirror', defaultSettings())));
  return m;
}

const apply = (m: Mirror, events: SimEvent[]) => m.apply({ t: m.lastTurn.value + 1, events, patches: [] });

describe('the Mirror keeps the evening', () => {
  it('replaces places whole, bumps their revision and finds them by tile and member', () => {
    const m = mirror();
    const rev = m.placesRevision.value;
    const a = mockPlace({
      id: 'seats:12',
      tile: 5 * MAP_SIZE + 5,
      tiles: [5 * MAP_SIZE + 5, 5 * MAP_SIZE + 6],
      members: [12],
    });
    const change = apply(m, [{ e: 'places.updated', p: { places: [a] } }]);
    expect(change.places).toBe(true);
    expect(m.placesRevision.value).toBe(rev + 1);
    expect(m.placeAt(5 * MAP_SIZE + 6)?.id).toBe('seats:12');
    expect(m.placeOf(12)?.id).toBe('seats:12');
    apply(m, [{ e: 'places.updated', p: { places: [mockPlace({ id: 'host:40', tile: 9, tiles: [9] })] } }]);
    expect(m.places.has('seats:12')).toBe(false);
    expect(m.placeAt(5 * MAP_SIZE + 6)).toBeUndefined();
    expect(m.placeAt(9)?.id).toBe('host:40');
  });

  it('keeps gaps, streets, footfall and the edition, and says which arrived', () => {
    const m = mirror();
    const day = new Uint16Array(MAP_SIZE * MAP_SIZE);
    const eve = new Uint16Array(MAP_SIZE * MAP_SIZE);
    eve[3] = 7;
    const v = eveningMocks(m).evening;
    const change = apply(m, [
      { e: 'gaps.updated', g: { open: [], closed: [], closedCount: 2, closedBySeat: [1, 1] } },
      {
        e: 'streets.updated',
        s: [{ id: 3, name: 'Mill Lane', generated: 'Mill Lane', anchor: 4, tiles: [4, 5] }],
      },
      { e: 'footfall.updated', f: { day, eve } },
      { e: 'evening.closed', v },
    ]);
    expect(change.gaps && change.streets && change.footfall).toBe(true);
    expect(change.evening).toBe(v);
    expect(m.gaps.value?.closedCount).toBe(2);
    expect(m.streetAt(5)?.name).toBe('Mill Lane');
    expect(m.footfall.value?.eve[3]).toBe(7);
    expect(m.evening.value).toBe(v);
  });

  it('reads the evening street bit from the flags layer', () => {
    const m = mirror();
    m.layers.flags[2 * MAP_SIZE + 3] = Flags.evening;
    expect(m.eveningStreet(3, 2)).toBe(true);
    expect(m.eveningStreet(4, 2)).toBe(false);
  });

  it('starts empty from a snapshot without R2 views', () => {
    const m = mirror();
    expect(m.places.size).toBe(0);
    expect(m.evening.value).toBeNull();
    expect(m.streetAt(0)).toBeUndefined();
  });
});
