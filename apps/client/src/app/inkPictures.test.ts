// @vitest-environment happy-dom
import { h } from 'preact';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { CaptureOptions } from '../render/api';
import { mockSession } from '../ui/mocks/session';
import { mockSeasonCard } from '../ui/mocks/seasons';
import { ChroniclePanel } from '../ui/panels/Chronicle';
import { PatternBookPanel } from '../ui/panels/PatternBook';
import { SeasonCardPanel } from '../ui/panels/SeasonCard';
import { mount, settle, type Mounted } from '../ui/test/dom';
import {
  aimAtTiles,
  aimFor,
  heartAim,
  inkAlbum,
  inkPictureSource,
  PRINT_SIZE,
  SLOT_SIZE,
  type PictureMirror,
  type PictureRef,
} from './inkPictures';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

beforeAll(() => {
  let n = 0;
  URL.createObjectURL ??= () => `blob:ink-${++n}`;
});

/** A mock session whose renderer counts its captures. */
function withCamera() {
  const out = mockSession();
  const captures: CaptureOptions[] = [];
  Object.assign(out.session.render!, {
    capture: (opts: CaptureOptions) => {
      captures.push(opts);
      return Promise.resolve(new Blob(['png'], { type: 'image/png' }));
    },
  });
  return { ...out, captures };
}

describe('V4B: where a picture looks', () => {
  it('frames a set of tiles with a margin, never closer than the least radius', () => {
    const size = 100;
    expect(aimAtTiles([], size)).toBeNull();
    expect(aimAtTiles([5 * size + 10], size)).toEqual({ focus: [10.5, 5.5], radius: 10 });
    const wide = aimAtTiles([10 * size + 10, 10 * size + 40], size)!;
    expect(wide.focus).toEqual([25.5, 10.5]);
    expect(wide.radius).toBe(15.5 + 5);
  });

  it('reads a Chronicle entry, a Pattern Book page and a Town Book page from shared state', () => {
    const { session } = mockSession();
    const m = session.mirror as unknown as PictureMirror;
    const entry = m.chronicle.value.find((e) => e.snapshot);
    if (entry) expect(aimFor(m, { book: 'chronicle', id: String(entry.id) })).toEqual(entry.snapshot);
    expect(aimFor(m, { book: 'chronicle', id: '999999' })).toBeNull();
    // A found page looks at its first site; one not yet found has no picture.
    expect(aimFor(m, { book: 'patternBook', id: 'well-gathering-place' })).toEqual({
      focus: [57.5, 52.5],
      radius: 10,
    });
    expect(aimFor(m, { book: 'patternBook', id: 'lantern-walk' })).toBeNull();
    // R3C's Town Book, structurally: the page's place frames the picture.
    const place = [...m.places.values()][0];
    const townBook: PictureMirror['townBook'] = { value: { pages: [{ id: 7, place: place?.id ?? 'none' }] } };
    const tm = { ...m, townBook } as PictureMirror;
    if (place) expect(aimFor(tm, { book: 'townBook', id: '7' })).not.toBeNull();
    expect(aimFor(tm, { book: 'townBook', id: '8' })).toBeNull();
    expect(aimFor(m, { book: 'townBook', id: '7' })).toBeNull();
  });

  it("puts a season card's picture at the village's heart", () => {
    const { session } = mockSession();
    const a = heartAim(session.mirror as unknown as PictureMirror);
    expect(a.radius).toBeGreaterThanOrEqual(14);
    expect(a.radius).toBeLessThanOrEqual(30);
  });
});

describe('V4B: the picture source (the seam, with the structural PictureRef)', () => {
  it('captures in ink at the slot size once per page, and at print size when asked', async () => {
    const { session, captures } = withCamera();
    const source = inkPictureSource(session);
    const ref: PictureRef = { book: 'patternBook', id: 'well-gathering-place' };
    const url = await source(ref);
    expect(url).toMatch(/^blob:/);
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ style: 'ink', size: SLOT_SIZE, focus: [57.5, 52.5] });
    expect(await source(ref)).toBe(url);
    expect(captures).toHaveLength(1);
    const print = await source(ref, { print: true });
    expect(print).not.toBe(url);
    expect(captures[1]).toMatchObject({ style: 'ink', size: PRINT_SIZE });
    expect(PRINT_SIZE[0] * PRINT_SIZE[1]).toBeGreaterThanOrEqual(1600 * 1200);
    // A page with no place asks for nothing.
    expect(await source({ book: 'patternBook', id: 'lantern-walk' })).toBeNull();
    expect(captures).toHaveLength(2);
  });

  it('answers null with no renderer, and asks again later rather than keeping the miss', async () => {
    const { session } = mockSession();
    const source = inkPictureSource(session);
    expect(await source({ book: 'patternBook', id: 'tree-place' })).toBeNull();
    expect(inkAlbum(session).asked).toBe(0);
  });
});

describe('V4B: nothing is captured while no book is open', () => {
  it('takes no picture until a page with a slot is shown, and keeps it after', async () => {
    const { session, captures } = withCamera();
    // The Pattern Book open on its contents: no slot, no capture.
    view = await mount(h(PatternBookPanel, { session }));
    await settle();
    expect(captures).toHaveLength(0);
    // A found page shows its slot: one ink capture at the slot's size, then the picture.
    await view.click('page-well-gathering-place');
    await settle();
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ style: 'ink', size: SLOT_SIZE });
    expect(view.get('page-picture').querySelector('img')?.getAttribute('src')).toMatch(/^blob:/);
    // A page not yet found shows no slot; going back to the found one reuses the kept picture.
    await view.click('page-lantern-walk');
    await view.click('page-well-gathering-place');
    await settle();
    expect(captures).toHaveLength(1);
  });

  it('takes no picture for the Chronicle panel or a closed season card', async () => {
    const { session, captures } = withCamera();
    view = await mount(h(ChroniclePanel, { session }));
    await settle();
    view.unmount();
    view = await mount(h(SeasonCardPanel, { session }));
    await settle();
    expect(captures).toHaveLength(0);
    // The season card shown: one picture of the village's heart.
    session.ui.almanac.value = { kind: 'card', view: mockSeasonCard };
    await settle();
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ style: 'ink', size: SLOT_SIZE });
  });

  it('waits while its card is queued behind another (hidden), and asks when its turn comes', async () => {
    const { session, captures } = withCamera();
    session.ui.almanac.value = { kind: 'card', view: mockSeasonCard };
    // GameUI mounts a waiting card inside a hidden wrapper.
    view = await mount(h('div', { hidden: true }, h(SeasonCardPanel, { session })));
    await settle();
    expect(view.root.querySelector('[data-testid="season-card-picture"]')).not.toBeNull();
    expect(captures).toHaveLength(0);
    view.unmount();
    view = await mount(h(SeasonCardPanel, { session }));
    await settle();
    expect(captures).toHaveLength(1);
  });

  it('keeps the line drawing where no picture can be taken', async () => {
    const { session } = mockSession();
    view = await mount(h(PatternBookPanel, { session }));
    await view.click('page-well-gathering-place');
    await settle();
    expect(view.root.querySelector('[data-testid="page-picture"]')).toBeNull();
    expect(view.root.querySelector('.vignette')).not.toBeNull();
  });
});
