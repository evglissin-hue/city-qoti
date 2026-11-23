// @vitest-environment happy-dom
import { content } from '@qoti/content';
import { Flags, MAP_SIZE, RoundFlags, type ResidentDetail } from '@qoti/sim';
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { mockPlace, mockRound } from '../mocks/evening';
import { mockSession } from '../mocks/session';
import { mockCharter } from '../mocks/village';
import { mount, settle, type Mounted } from '../test/dom';
import { Day, manhattan, needWords, roundTiles, scoreWords, stopWords } from './Day';
import { InspectorPanel } from './Inspector';
import { drawParts, drawSum, restingWords, seatsWords, suppliesWords, tookWords } from './PlaceCard';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const N = MAP_SIZE;
const tile = (x: number, z: number) => z * N + x;

describe('the place card words', () => {
  it('adds the draw parts up to the draw, showing only the nonzero ones', () => {
    const p = mockPlace({ id: 'seats:12' });
    const parts = drawParts(p);
    expect(parts.map(([, label]) => label)).toEqual(['charm', 'pieces', 'lanterns lit', 'treats']);
    expect(parts.reduce((t, [v]) => t + v, 0)).toBe(p.draw);
    expect(drawSum(p)).toBe('38 charm + 4 pieces + 5 lanterns lit + 4 treats = 51');
    const winter = mockPlace({
      id: 'seats:13',
      parts: { charm: 40, site: 0, pieces: 2, water: 0, lit: 0, treats: 0, winter: -20 },
    });
    expect(drawSum(winter)).toBe('40 charm + 2 pieces - 20 winter = 22');
  });

  it('says seats, child seats and what was taken, with nothing invented', () => {
    expect(seatsWords({ seats: 4, childSeats: 2, standing: 2 })).toBe(
      '4 seats, 2 for children only, room for 2 more on their feet',
    );
    expect(seatsWords({ seats: 0, childSeats: 0, standing: 4 })).toBe(
      'No seats, room for 4 more on their feet',
    );
    expect(tookWords(0, 0)).toBe('');
    expect(tookWords(120, 3)).toBe('3 treats sold, 1 coin taken');
    expect(tookWords(40, 1)).toBe('1 treat sold, a few pennies taken');
    expect(tookWords(0, 2)).toContain('no coin changed hands');
  });
});

describe('the place card', () => {
  it('opens from a place selection, highlights its tiles and clears them on close', async () => {
    const { session, calls, submitted } = mockSession();
    session.mirror.setPlaces({
      places: [
        mockPlace({
          id: 'seats:12',
          tiles: [tile(10, 10), tile(11, 10)],
          renamedBy: 1,
          wants: ['a stall would sell to the 14 who come'],
          present: 2,
          childSeats: 2,
        }),
      ],
    });
    session.ui.selection.value = { kind: 'place', id: 'seats:12' };
    view = await mount(h(InspectorPanel, { session }));
    const text = view.text();
    expect(text).toContain('The bench by the Hollybush cottage');
    expect(text).toContain('2 for children only');
    expect(text).toContain('2 here now');
    expect(text).toContain('Named by Bo');
    expect(text).toContain('A stall would sell to the 14 who come.');
    expect(view.get('place-draw-sum').textContent).toBe(
      '38 charm + 4 pieces + 5 lanterns lit + 4 treats = 51',
    );
    expect(view.get('place-visitors').textContent).toContain('12 visitors');
    expect(view.get('place-took').textContent).toBe('3 treats sold, 1 coin taken');
    expect(calls.find((c) => c.method === 'highlight')?.args[0]).toEqual({
      tiles: [
        [10, 10],
        [11, 10],
      ],
      tone: 'hearth',
      outline: true,
    });

    const input = view.get('place-rename-input') as HTMLTextAreaElement;
    expect(input.maxLength).toBe(40);
    input.value = 'Bo’s Bench';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await view.click('place-rename-save');
    expect(submitted).toContainEqual({ t: 'place.rename', id: 'seats:12', name: 'Bo’s Bench' });

    await act(() => {
      view!.unmount();
    });
    view = null;
    expect(calls.filter((c) => c.method === 'highlight').pop()?.args[0]).toBeNull();
  });

  it('says a porch is the household own, and that a bare place has nothing to sell', async () => {
    const { session } = mockSession();
    session.mirror.setPlaces({
      places: [
        mockPlace({
          id: 'porch:3',
          name: 'the Thistledown porch',
          source: 'porch',
          seats: 2,
          household: 4,
          visitors: [2, 2, 1],
          takings: [0, 0, 0],
          sold: [0, 0, 0],
          parts: { charm: 24, site: 0, pieces: 0, water: 0, lit: 0, treats: 0, winter: 0 },
        }),
        mockPlace({ id: 'seats:9', name: 'the bench by the mill', takings: [0, 0, 0], sold: [0, 0, 0] }),
      ],
    });
    session.ui.selection.value = { kind: 'place', id: 'porch:3' };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('place-porch').textContent).toContain("household's own");
    expect(view.find('place-took')).toBeNull();
    view.unmount();
    session.ui.selection.value = { kind: 'place', id: 'seats:9' };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('place-serves').textContent).toBe('Nothing to sell here');
    expect(view.find('place-took')).toBeNull();
    expect(view.find('place-porch')).toBeNull();
  });
});

describe('routing', () => {
  it('opens the place card from a decor piece that belongs to a place, with its Remove', async () => {
    const { session, submitted } = mockSession();
    session.mirror.decor.set(501, { id: 501, def: 'bench', fx: 40.5, fz: 41.5, rot: 0, builtBy: 0 });
    const bench = session.mirror.decor.get(501);
    expect(bench).toBeDefined();
    session.mirror.setPlaces({
      places: [mockPlace({ id: 'seats:77', name: 'the bench by the mill', members: [bench!.id] })],
    });
    session.ui.selection.value = { kind: 'decor', id: bench!.id };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('place-card')).not.toBeNull();
    await view.click('place-remove');
    expect(submitted).toContainEqual({ t: 'decor.remove', ids: [bench!.id] });
  });

  it('opens the place card from a tile inside a place', async () => {
    const { session } = mockSession();
    session.mirror.setPlaces({ places: [mockPlace({ id: 'seats:5', tiles: [tile(20, 21)] })] });
    session.ui.selection.value = { kind: 'tile', x: 20, z: 21 };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('place-card')).not.toBeNull();
  });

  it('a building that hosts a place keeps its inspector and offers the card', async () => {
    const { session } = mockSession();
    const b = [...session.mirror.buildings.values()][0]!;
    session.mirror.setPlaces({
      places: [mockPlace({ id: `host:${b.id}`, name: 'the well', members: [b.id] })],
    });
    session.ui.selection.value = { kind: 'building', id: b.id };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('building-inspector')).not.toBeNull();
    await view.click(view.get('building-place').querySelector('button')!);
    expect(session.ui.selection.value).toEqual({ kind: 'place', id: `host:${b.id}` });
  });

  it('shows a named street on a road tile, whether it is kept for strolling, and renames it', async () => {
    const { session, submitted } = mockSession();
    const m = session.mirror;
    const rx = 60;
    const rz = 61;
    m.layers.road[tile(rx, rz)] = 1;
    m.setStreets([
      {
        id: 9001,
        name: 'Mill Lane',
        generated: 'Mill Lane',
        renamedBy: 0,
        anchor: tile(rx, rz),
        tiles: [tile(rx, rz)],
      },
    ]);
    session.ui.selection.value = { kind: 'tile', x: rx, z: rz };
    view = await mount(h(InspectorPanel, { session }));
    const text = view.text();
    expect(text).toContain('Mill Lane');
    expect(text).toContain('Named by you');
    expect(text).not.toContain('Kept for strolling');
    m.layers.flags[tile(rx, rz)] = Flags.evening;
    session.ui.selection.value = { kind: 'tile', x: rx, z: rz + 0 };
    await settle();
    view.unmount();
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('street-evening').textContent).toContain('Kept for strolling from 17:00 to 21:00');
    const input = view.get('street-rename-input') as HTMLTextAreaElement;
    input.value = 'Honey Row';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await view.click('street-rename-save');
    expect(submitted).toContainEqual({ t: 'road.rename', id: 9001, name: 'Honey Row' });
  });
});

describe('a resident day', () => {
  it('has words for every band and every flag', () => {
    expect(needWords(58)).toBe('middling');
    expect(scoreWords(64)).toBe('a good one');
    for (const n of [0, 19, 20, 39, 40, 59, 60, 79, 80, 100]) expect(needWords(n).length).toBeGreaterThan(2);
    for (const n of [0, 29, 30, 49, 50, 59, 60, 79, 80, 100]) expect(scoreWords(n).length).toBeGreaterThan(2);
    expect(stopWords(RoundFlags.arrived | RoundFlags.seated | RoundFlags.friend, 1)).toBe(
      'Seated, a friend there.',
    );
    expect(stopWords(RoundFlags.arrived | RoundFlags.standing | RoundFlags.treat, 1)).toBe(
      'Stood, no seat left, bought a treat.',
    );
    expect(stopWords(RoundFlags.turnedAway, 1)).toBe('Turned away: no room.');
    expect(stopWords(0, -1)).toBe('Still ahead of them.');
    expect(stopWords(RoundFlags.rained, -1)).toBe('Rain kept them in.');
  });

  it('draws a Manhattan line, both ends in', () => {
    expect(manhattan(tile(1, 1), tile(3, 2))).toEqual([tile(1, 1), tile(2, 1), tile(3, 1), tile(3, 2)]);
    expect(roundTiles(tile(0, 0), [{ tile: tile(2, 0) }])).toEqual([tile(0, 0), tile(1, 0), tile(2, 0)]);
  });

  async function detailOf(session: ReturnType<typeof mockSession>['session']): Promise<ResidentDetail> {
    return (await session.inspect('resident', 12)) as ResidentDetail;
  }

  it('lists the stops and draws them on the ground, clearing on close', async () => {
    const { session, calls } = mockSession();
    session.mirror.setPlaces({
      places: [
        mockPlace({ id: 'seats:1', tile: tile(30, 30), name: 'the bench by the mill', kinds: ['sit'] }),
        mockPlace({ id: 'host:2', tile: tile(34, 33), name: 'the well by the lane', kinds: ['meet'] }),
      ],
    });
    const detail = { ...(await detailOf(session)), evening: { need: 58, score: 64 } };
    detail.round = mockRound(session.mirror, 12);
    view = await mount(h(Day, { session, detail }));
    const text = view.text();
    expect(detail.round.length).toBe(2);
    expect(text).toContain('17:24');
    expect(text).toContain('Seated, a friend there.');
    expect(text).toContain('Stood, no seat left, bought a treat.');
    expect(text).toContain('Evenings: middling');
    expect(text).toContain('Last evening: a good one');
    const drawn = calls.find((c) => c.method === 'highlight')?.args[0] as { tiles: [number, number][] };
    expect(drawn.tiles).toContainEqual([30, 30]);
    expect(drawn.tiles).toContainEqual([34, 33]);
    await act(() => {
      view!.unmount();
    });
    view = null;
    expect(calls.filter((c) => c.method === 'highlight').pop()?.args[0]).toBeNull();
  });

  it('titles a round from an earlier day as their last evening, its missed stops behind them (R2X)', async () => {
    const { session } = mockSession();
    session.mirror.setPlaces({
      places: [
        mockPlace({ id: 'seats:1', tile: tile(30, 30), name: 'the bench by the mill', kinds: ['sit'] }),
        mockPlace({ id: 'host:2', tile: tile(34, 33), name: 'the well by the lane', kinds: ['meet'] }),
      ],
    });
    const base = await detailOf(session);
    const round = mockRound(session.mirror, 12).map((s, i) =>
      i === 1 ? { ...s, arrived: -1, flags: 0 } : s,
    );
    view = await mount(
      h(Day, { session, detail: { ...base, round, roundEarlier: true, evening: { need: 58, score: 64 } } }),
    );
    const text = view.text();
    expect(text).toContain('Their last evening');
    expect(text).toContain('They never got there.');
    expect(text).not.toContain('Still ahead of them.');
    expect(text).not.toContain('later');
  });

  it('says they stayed in when the round is empty, and shows nothing without a round', async () => {
    const { session, calls } = mockSession();
    const base = await detailOf(session);
    view = await mount(h(Day, { session, detail: { ...base, round: [], evening: { need: 30, score: 20 } } }));
    expect(view.get('day-stayed').textContent).toBe('Stayed in.');
    view.unmount();
    view = await mount(h(Day, { session, detail: { ...base, round: undefined, evening: undefined } }));
    expect(view.find('resident-day')).toBeNull();
    expect(calls.filter((c) => c.method === 'highlight')).toEqual([]);
  });
});

describe('the place card, supplies (R3D)', () => {
  function rig(
    rank: 'hamlet' | 'village',
    defs: string[],
    extra: Partial<Parameters<typeof mockPlace>[0]> = {},
  ) {
    const out = mockSession();
    const m = out.session.mirror;
    m.charter.value = { ...mockCharter, rank };
    defs.forEach((def, i) =>
      m.decor.set(900 + i, { id: 900 + i, def, fx: 40.5, fz: 41.5, rot: 0, builtBy: 0 }),
    );
    m.setPlaces({
      places: [
        mockPlace({ id: 'seats:5', name: 'the Promenade', members: defs.map((_, i) => 900 + i), ...extra }),
      ],
    });
    out.session.ui.selection.value = { kind: 'place', id: 'seats:5' };
    return out;
  }

  it('shows no control with no supplied piece, and none in a Hamlet', async () => {
    let { session } = rig('village', ['bench']);
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('place-priority')).toBeNull();
    view.unmount();
    ({ session } = rig('hamlet', ['lantern']));
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('place-priority')).toBeNull();
  });

  it('shows three options with the chosen one checked, and sends a change once', async () => {
    const { session, submitted } = rig('village', ['lantern']);
    view = await mount(h(InspectorPanel, { session }));
    const group = view.get('place-priority');
    expect(group.getAttribute('role')).toBe('radiogroup');
    const radios = [...group.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.textContent)).toEqual(['Keep first', 'As it comes', 'Let it rest']);
    expect(view.get('place-priority-normal').getAttribute('aria-checked')).toBe('true');
    expect(view.get('place-priority-keep').getAttribute('aria-checked')).toBe('false');
    expect(group.parentElement?.getAttribute('title')).toContain('run short');
    expect(view.find('place-supplies')).toBeNull();
    await view.click('place-priority-normal');
    expect(submitted.filter((c) => c.t === 'place.setPriority')).toEqual([]);
    await view.click('place-priority-rest');
    expect(submitted).toContainEqual({ t: 'place.setPriority', id: 'seats:5', priority: 'rest' });
  });

  it('reads a saved priority', async () => {
    const { session } = rig('village', ['lantern'], { priority: 'keep' });
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('place-priority-keep').getAttribute('aria-checked')).toBe('true');
  });

  it('says what the supplied pieces draw and what rests tonight', async () => {
    const { session } = rig('village', ['lantern', 'lantern', 'lantern', 'brazier'], {
      supplies: [
        { kind: 'nightly', good: 'candles', pieces: 3, wants: 1, resting: 2 },
        { kind: 'evening', good: 'firewood', pieces: 1, wants: 1, resting: 1 },
      ],
      resting: [
        { id: 900, kind: 'unlit' },
        { id: 901, kind: 'unlit' },
        { id: 903, kind: 'cold' },
      ],
    });
    view = await mount(h(InspectorPanel, { session }));
    const text = view.get('place-supplies').textContent!;
    expect(text).toContain('Its 3 lanterns take a candle a night.');
    expect(text).toContain('Its brazier takes firewood on an evening someone comes.');
    expect(text).toContain('Resting tonight: 2 lanterns unlit, the brazier cold.');
  });

  it('gets singular and plural right, and says when everything is supplied', () => {
    const { session } = rig('village', []);
    const p = mockPlace({
      id: 'x',
      members: [900, 901, 902, 903, 904],
      supplies: [
        { kind: 'nightly', good: 'candles', pieces: 1, wants: 1, resting: 0 },
        { kind: 'season', good: 'cloth', pieces: 2, wants: 4, resting: 0 },
        { kind: 'outlet', pieces: 1, wants: 0, resting: 0 },
        { kind: 'well', pieces: 1, wants: 0, resting: 0 },
      ],
    });
    const defs = ['lantern', 'bunting', 'bunting', 'cafe-table', 'fountain'].map((def, i) => ({
      id: String(900 + i),
      name: def === 'cafe-table' ? 'cafe table' : def,
      supply: content.decorById.get(def)!.supply!,
    }));
    const words = suppliesWords(p, defs as never);
    expect(words).toContain('Its lantern takes a candle a night.');
    expect(words).toContain('Its 2 bunting take 4 cloth a season.');
    expect(words).toContain('Its cafe table is served by a stall or shop within 3 tiles.');
    expect(words).toContain('Its fountain needs a well within 8 tiles.');
    expect(restingWords(session, { resting: [] })).toBe('Everything is supplied tonight.');
  });
});
