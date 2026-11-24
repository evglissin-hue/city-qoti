// @vitest-environment happy-dom
import { content } from '@qoti/content';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { eveningMocks } from '../mocks/evening';
import { r3Mocks } from '../mocks/r3';
import { mockVillageSession } from '../mocks/session';
import { setPictureSource } from '../pictures';
import { mount, type Mounted } from '../test/dom';
import { booksFor, panels } from './index';
import { tallyWords, townBookOrder, TownBookPanel } from './TownBook';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  setPictureSource(null);
});

function withBook() {
  const out = mockVillageSession();
  const m = out.session.mirror;
  m.setPlaces({ places: eveningMocks(m).places });
  const mocks = r3Mocks(m);
  m.townBook.value = mocks.townBook;
  return { ...out, mocks };
}

describe('the Town Book panel', () => {
  it('is a shared book on the shelf with a key of its own', () => {
    const def = panels.find((p) => p.id === 'town-book')!;
    expect(def).toMatchObject({ side: 'book', lens: 'shared', label: 'Town Book', wide: true });
    expect(booksFor('hearth', 'standard').some((p) => p.id === 'town-book')).toBe(true);
    expect(booksFor('ledger', 'standard').some((p) => p.id === 'town-book')).toBe(true);
    const keyed = panels.filter((p) => p.key === def.key);
    expect(keyed).toHaveLength(1);
  });

  it('shows an honest empty book', async () => {
    const { session } = mockVillageSession();
    view = await mount(h(TownBookPanel, { session }));
    const text = view.text();
    expect(text).toContain('Town Book');
    expect(text).toContain('No pages yet');
    expect(text).toContain('Nothing is written yet');
    expect(view.root.querySelectorAll('[data-testid="town-book-page"]')).toHaveLength(0);
    expect(text).toContain('Industry: 0 of 3 toward Mill Town');
    expect(view.get('town-book-note').textContent).toContain(
      '3 pages of one leaning and the town earns a calling',
    );
  });

  it('lists found pages by leaning, the hints and the callings on the cover', async () => {
    const { session, mocks } = withBook();
    view = await mount(h(TownBookPanel, { session }));
    const text = view.text();
    expect(text).toContain('4 pages found');
    const contents = view.root.querySelector('.tb-contents')!;
    const heads = [...contents.querySelectorAll('h4')].map((e) => e.textContent);
    expect(heads).toEqual(['Industry', 'Gardens']);
    expect(view.root.querySelectorAll('[data-testid="town-book-hint"]')).toHaveLength(3);
    expect(text).toContain('Not yet found');
    for (const e of view.root.querySelectorAll('[data-testid="town-book-hint"]')) {
      // The leaning is its own tag, never run into the hint's words.
      expect(e.querySelector('.tb-hint-words')!.textContent).not.toMatch(/(Industry|Gardens|Pilgrimage)$/);
      expect(e.querySelector('.tb-hint-leaning')).not.toBeNull();
    }
    expect(view.root.querySelectorAll('[data-testid="town-book-calling"]')).toHaveLength(1);
    expect(text).toContain('Mill Town, earned');
    expect(text).toContain('Gardens: 1 of 3 toward Garden Village');
    expect(text).toContain('Every town has habits');
    for (const p of mocks.townBook.pages) expect(text).toContain(p.name);
  });

  it('opens a page with its slot, its name in the empty frame and its facts', async () => {
    const { session, mocks } = withBook();
    view = await mount(h(TownBookPanel, { session }));
    const order = townBookOrder(mocks.townBook.pages);
    const first = order[0]!;
    await view.click(`town-book-link-${first.id}`);
    expect(view.root.querySelectorAll('[data-testid="town-book-page"]')).toHaveLength(1);
    const slot = view.get('town-book-picture');
    expect(slot.textContent).toBe(first.name);
    const text = view.text();
    expect(text).toContain(first.text.slice(0, 30));
    expect(text).toContain('Where');
    expect(text).toContain(first.placeName);
    expect(text).toContain('Credit');
    expect(text).toContain('Leaning');
  });

  it('names both seats on a Made Together page and takes a click on Where to the place', async () => {
    const { session, mocks } = withBook();
    view = await mount(h(TownBookPanel, { session }));
    const together = mocks.townBook.pages.find((p) => p.together)!;
    await view.click(`town-book-link-${together.id}`);
    const text = view.text();
    expect(text).toContain('Made Together');
    const seats = session.mirror.seats.value;
    const named = [...view.root.querySelectorAll('.tb-seat')].map((e) => e.textContent ?? '');
    expect(named).toHaveLength(2);
    for (const s of seats) expect(named.some((n) => n.includes(s.name))).toBe(true);
    await view.click('town-book-where');
    expect(session.ui.selection.value).toEqual({ kind: 'place', id: together.place });
  });

  it('shows a picture from the seam when one resolves', async () => {
    const { session, mocks } = withBook();
    setPictureSource(async () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
    view = await mount(h(TownBookPanel, { session }));
    await view.click(`town-book-link-${mocks.townBook.pages[0]!.id}`);
    expect(view.get('town-book-picture').querySelector('img')).not.toBeNull();
  });

  it('closes with its button', async () => {
    const { session } = withBook();
    session.ui.panel.value = 'town-book';
    view = await mount(h(TownBookPanel, { session }));
    await view.click('town-book-close');
    expect(session.ui.panel.value).toBeNull();
  });

  it('counts toward a calling in words', () => {
    const { mocks } = withBook();
    expect(tallyWords(mocks.townBook, 'industry')).toBe('Mill Town, earned');
    expect(tallyWords({ ...mocks.townBook, callings: [] }, 'industry')).toBe(
      `${content.townBook.pagesForCalling} of ${content.townBook.pagesForCalling} toward Mill Town`,
    );
  });
});
