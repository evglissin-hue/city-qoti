// The Town Book's view (R3.0; R3C fills it): `townBook.updated` and the snapshot's `townBook`, read by
// the Town Book panel in both lenses, the Charter board's callings and the storybook (R3D).
// docs/spec/19-evenings.md, The Town Book. Pure: reads saved state only.
import { content, townBookPhrases } from '@qoti/content';
import { LEANINGS } from '../constants';
import type {
  CallingView,
  TownBookHintView,
  TownBookPage,
  TownBookPageView,
  TownBookView,
  WorldState,
} from '../contracts';
import { placeState, shownName } from '../state/evenings';
import { fillText } from './hamlet';

/**
 * A page's words with {place} and {day} filled: the place's name now, and the day of its season in
 * the town's voice ("the third evening of each season"). Pure: reads saved state only.
 */
export function pageText(state: WorldState, p: TownBookPage): string {
  const def = p.kind === 'specialty' ? content.specialtyById.get(p.def) : content.customById.get(p.def);
  if (!def) return '';
  const row = placeState(state, p.place);
  const day = p.dayOfSeason === undefined ? undefined : townBookPhrases.days[p.dayOfSeason - 1];
  return fillText(def.text, [
    ['place', row ? shownName(row) : townBookPhrases.anyPlace],
    ['day', day ?? townBookPhrases.anyDay],
  ]);
}

/** The Town Book as both lenses show it. */
export function townBookView(state: WorldState): TownBookView {
  const book = state.townBook;
  const pages: TownBookPageView[] = book.pages.map((p) => {
    const row = placeState(state, p.place);
    const view: TownBookPageView = {
      ...p,
      placeName: row ? shownName(row) : '',
      text: pageText(state, p),
      together: p.seats.length >= 2,
    };
    if (p.good !== undefined) view.goodId = content.goods[p.good]?.id;
    return view;
  });
  const hints: TownBookHintView[] = [];
  for (const id of book.hints) {
    const s = content.specialtyById.get(id);
    if (s) {
      hints.push({ def: id, kind: 'specialty', hint: s.hint, leaning: s.leaning });
      continue;
    }
    const c = content.customById.get(id);
    if (c) hints.push({ def: id, kind: 'custom', hint: c.hint, leaning: c.leaning });
  }
  const callings: CallingView[] = [];
  for (const id of book.callings) {
    const def = content.callingById.get(id);
    if (!def) continue;
    // The day it was earned: the page of its leaning that made the count.
    let seen = 0;
    let day = -1;
    for (const p of book.pages) {
      if (p.leaning !== def.leaning) continue;
      seen++;
      if (seen === content.townBook.pagesForCalling) {
        day = p.day;
        break;
      }
    }
    callings.push({
      id,
      name: def.name,
      blurb: def.blurb,
      icon: def.icon,
      leaning: def.leaning,
      effectLines: [...def.effectLines],
      day,
    });
  }
  const leanings = LEANINGS.map((l) => book.pages.filter((p) => p.leaning === l).length);
  return { pages, hints, callings, leanings };
}
