// I3 (C5F): what the session does with the season events of an update. The season card and report
// go on the desk one at a time (a report waiting under the morning's card), raid and festival results
// get their cards, first sightings and together moments a quiet line, and notable Chronicle entries
// a snapshot (app/snapshots.ts).
import type { FestivalResultView } from '@qoti/sim';
import type { MirrorChange } from '../state/mirror';
import type { Almanac, UiState } from '../ui/state';
import { speciesName } from '../ui/seasons';

/** A together moment's note stays this long. */
const TOGETHER_MS = 45_000;

const TOGETHER_TEXT: Record<string, string> = {
  dance: 'You are both here: stay for the closing dance.',
  fireworks: 'You are both here: fireworks over the green, for the two of you.',
  stroll: 'You are both here: an evening stroll is on, if you fancy it.',
};

export function togetherText(kind: string): string {
  return TOGETHER_TEXT[kind] ?? 'You are both here: something nice is happening. Have a look round.';
}

interface Hooked {
  ui: UiState;
  toast(text: string): void;
  mirror: { festivalResult: { value: FestivalResultView | null } };
}

const queues = new WeakMap<UiState, Almanac[]>();
const lastFestival = new WeakMap<UiState, FestivalResultView | null>();
const togetherTimers = new WeakMap<UiState, ReturnType<typeof setTimeout>>();

/** Puts a page on the desk, or under the one already there. */
export function showAlmanac(ui: UiState, a: Almanac): void {
  if (!ui.almanac.value) {
    ui.almanac.value = a;
    return;
  }
  const q = queues.get(ui) ?? [];
  q.push(a);
  queues.set(ui, q);
}

/** Closes the page on the desk and brings up the next one waiting. */
export function closeAlmanac(ui: UiState): void {
  const q = queues.get(ui) ?? [];
  ui.almanac.value = q.shift() ?? null;
}

export function seasonsAfterUpdate(s: Hooked, change: MirrorChange): void {
  const ui = s.ui;
  if (change.seasonReport) showAlmanac(ui, { kind: 'report', view: change.seasonReport, page: 0 });
  if (change.seasonCard) showAlmanac(ui, { kind: 'card', view: change.seasonCard });
  if (change.raidResult) ui.raidCard.value = change.raidResult;
  const fr = s.mirror.festivalResult.value;
  if (change.full) lastFestival.set(ui, fr);
  else if (fr && fr !== lastFestival.get(ui)) {
    lastFestival.set(ui, fr);
    ui.festivalCard.value = fr;
  }
  for (const g of change.sightings) {
    s.toast(`${speciesName(g.species, g.name)} seen! The Field Guide has a new page.`);
  }
  const kind = change.together[change.together.length - 1];
  if (kind) {
    ui.together.value = togetherText(kind);
    clearTimeout(togetherTimers.get(ui));
    togetherTimers.set(
      ui,
      setTimeout(() => (ui.together.value = null), TOGETHER_MS),
    );
  }
}

/** Esc on a season card, a result card or photo mode: closes it first. */
export function seasonsEscape(ui: UiState): boolean {
  if (ui.photo.value) {
    ui.photo.value = false;
    return true;
  }
  if (ui.almanac.value) {
    closeAlmanac(ui);
    return true;
  }
  if (ui.raidCard.value || ui.festivalCard.value) {
    ui.raidCard.value = null;
    ui.festivalCard.value = null;
    return true;
  }
  return false;
}
