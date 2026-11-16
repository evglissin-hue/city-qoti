import { buildView, createWorld, defaultSettings, Flags, MAP_SIZE, type SimEvent } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../state/mirror';
import { mockPlace } from '../ui/mocks/evening';
import { overlays } from '../ui/lenses';
import {
  contrast,
  footfallWash,
  hexToRgb,
  inkStrength,
  simulate,
  TOWN_COLORS,
  townInk,
  townLens,
} from './overlayTown';

const N = MAP_SIZE;

function mirror(): Mirror {
  const m = new Mirror();
  m.load(buildView(createWorld('r2d-town', defaultSettings())));
  return m;
}

const apply = (m: Mirror, events: SimEvent[]) => m.apply({ t: m.lastTurn.value + 1, events, patches: [] });

describe('townInk', () => {
  it('is empty over a valley with no evening', () => {
    const ink = townInk(mirror());
    expect(ink.eve.every((v) => v === 0)).toBe(true);
    expect(ink.routes).toEqual([]);
    expect(ink.glints).toEqual([]);
    expect(ink.evening).toEqual([]);
    expect(ink.gaps).toEqual([]);
    expect(ink.places).toEqual([]);
  });

  it('washes footfall softly: normalized, spread to neighbors, never finer than a tile', () => {
    const m = mirror();
    const eve = new Uint16Array(N * N);
    eve[20 * N + 20] = 30;
    eve[20 * N + 21] = 10;
    apply(m, [{ e: 'footfall.updated', f: { day: new Uint16Array(N * N), eve } }]);
    const { eve: wash } = townInk(m);
    expect(Math.max(...wash)).toBeLessThanOrEqual(1);
    expect(wash[20 * N + 20]).toBeGreaterThan(wash[20 * N + 21]!);
    // The wash spills onto tiles that had no footfall, and fades with distance.
    expect(wash[20 * N + 19]).toBeGreaterThan(0);
    expect(wash[20 * N + 19]).toBeGreaterThan(wash[20 * N + 18]!);
    expect(wash[20 * N + 18]).toBe(0);
  });

  it('does not glow for a quiet town', () => {
    const eve = new Uint16Array(N * N);
    eve[5 * N + 5] = 1;
    expect(Math.max(...footfallWash(eve))).toBeLessThan(0.3);
  });

  it('reads evening streets, gaps, places, glints and routes from the Mirror', () => {
    const m = mirror();
    const flags = m.layers.flags as Uint8Array;
    flags[7 * N + 9] |= Flags.evening;
    const a = mockPlace({ id: 'seats:2', tile: 5 * N + 5, tiles: [5 * N + 6, 5 * N + 5] });
    const b = mockPlace({ id: 'seats:1', tile: 6 * N + 5, tiles: [5 * N + 6, 6 * N + 5] });
    apply(m, [
      { e: 'places.updated', p: { places: [a, b] } },
      {
        e: 'gaps.updated',
        g: {
          open: [
            {
              id: 1,
              kind: 'untreated',
              subject: 'seats:1',
              tile: 6 * N + 5,
              lane: 'ledger',
              text: '',
              closes: '',
              openedDay: 1,
              n: 1,
            } as never,
          ],
          closed: [],
          closedCount: 0,
          closedBySeat: [0, 0],
        },
      },
    ]);
    const ink = townInk(m, [
      [1, 2, 5],
      [3, 3, 9],
    ]);
    expect(ink.evening).toEqual([7 * N + 9]);
    expect(ink.places).toEqual([5 * N + 5, 5 * N + 6, 6 * N + 5]);
    expect(ink.gaps).toEqual([6 * N + 5]);
    expect(ink.routes).toEqual([[1, 2, 5]]);
  });

  it('puts a glint at the middle of each outlet serving a place, once', () => {
    const m = mirror();
    m.buildings.set(77, {
      id: 77,
      def: 'shop',
      x: 30,
      z: 40,
      rot: 0,
      builtBy: 0,
      handmade: false,
      stage: 'built',
      foundation: false,
    } as never);
    apply(m, [
      {
        e: 'places.updated',
        p: {
          places: [
            mockPlace({ id: 'seats:90', serves: [77, 99] }),
            mockPlace({ id: 'seats:91', serves: [77] }),
          ],
        },
      },
    ]);
    const ink = townInk(m);
    // Building 99 is not in the Mirror: no glint for it; 77 once, though two places name it.
    expect(ink.glints).toHaveLength(1);
    expect(ink.glints[0]![0]).toBeGreaterThan(30);
    expect(ink.glints[0]![1]).toBeGreaterThan(40);
  });
});

describe('the two inks', () => {
  it('lens decides which ink is stronger', () => {
    const h = inkStrength('hearth');
    const l = inkStrength('ledger');
    expect(h.sage).toBeGreaterThan(h.ochre);
    expect(l.ochre).toBeGreaterThan(l.sage);
    expect(h.sage).toBeGreaterThan(l.sage);
    expect(l.ochre).toBeGreaterThan(h.ochre);
  });

  it('reads the lens from the overlay kind the toolbar sends', () => {
    expect(townLens('town:hearth')).toBe('hearth');
    expect(townLens('town:ledger')).toBe('ledger');
    expect(townLens('town')).toBeNull();
    expect(townLens('flows')).toBeNull();
    expect(townLens(null)).toBeNull();
  });

  it('is in both lenses View lists, as one overlay id', () => {
    expect(overlays.filter((o) => o.id === 'town').map((o) => o.lens)).toEqual(['hearth', 'ledger']);
  });

  it('keeps sage and ochre apart in lightness, and under deuteranopia and protanopia', () => {
    const sage = hexToRgb(TOWN_COLORS.sage);
    const ochre = hexToRgb(TOWN_COLORS.ochre);
    expect(contrast(sage, ochre)).toBeGreaterThan(2);
    for (const kind of ['deuteranopia', 'protanopia'] as const) {
      const a = simulate(sage, kind);
      const b = simulate(ochre, kind);
      expect(contrast(a, b), kind).toBeGreaterThan(1.8);
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      expect(dist, kind).toBeGreaterThan(0.3);
    }
    // The gap's umber and the deeper street sage stay darker than the wash they sit on.
    expect(contrast(hexToRgb(TOWN_COLORS.gap), sage)).toBeGreaterThan(3);
    expect(contrast(hexToRgb(TOWN_COLORS.street), sage)).toBeGreaterThan(1.5);
  });
});
