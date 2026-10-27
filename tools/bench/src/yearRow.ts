// The tune's year view (C5.0): one line per in-game day with the season, the weather, how many
// households were cold, the festival's stars, the threat band and how a raid went. The I3 state it
// reads (`weather`, `festival`, `threats`, `raid`, `Household.warmth`) lands with C5.0's contracts
// and fills in with C5A to C5D, so it is read through a local, all-optional view and anything
// missing prints as '-'. Nothing here changes the valley.
import { calendar, SEASON_NAMES, type WorldState } from '@qoti/sim';

/** The I3 state the year view reads, as loosely as it may arrive. */
interface SeasonsView {
  weather?: {
    today?: string | { kind?: string };
    kind?: string;
    river?: { frozen?: boolean };
  } | null;
  festival?: {
    outcome?: { stars?: number } | null;
    history?: readonly { stars?: number }[];
  } | null;
  threats?: {
    band?: string;
    scheduled?: { band?: string } | null;
    history?: readonly { outcome?: string; result?: string; day?: number }[];
  } | null;
  raid?: { raiders?: readonly unknown[] } | null;
  households: readonly {
    warmth?: { coldHours?: number; coldDays?: number; cold?: boolean } | null;
  }[];
}

const DASH = '-';

function text(v: unknown): string {
  return typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : DASH;
}

function weather(s: SeasonsView): string {
  const w = s.weather;
  if (!w) return DASH;
  const today = typeof w.today === 'string' ? w.today : (w.today?.kind ?? w.kind);
  const kind = text(today);
  return w.river?.frozen ? `${kind}*` : kind;
}

/** Households cold today, or '-' while no household carries warmth. */
function cold(s: SeasonsView): string {
  let seen = false;
  let n = 0;
  for (const h of s.households) {
    const warmth = h.warmth;
    if (!warmth) continue;
    seen = true;
    if (warmth.cold || (warmth.coldHours ?? 0) > 0) n++;
  }
  return seen ? String(n) : DASH;
}

function stars(s: SeasonsView): string {
  const f = s.festival;
  if (!f) return DASH;
  const outcome = f.outcome?.stars;
  if (typeof outcome === 'number') return text(outcome);
  return text(f.history?.[f.history.length - 1]?.stars);
}

function band(s: SeasonsView): string {
  const t = s.threats;
  return t ? text(t.scheduled?.band ?? t.band) : DASH;
}

/** 'live' while raiders are on the map, else the last raid's result. */
function raid(s: SeasonsView): string {
  if (s.raid) return `live${s.raid.raiders ? `:${s.raid.raiders.length}` : ''}`;
  const history = s.threats?.history;
  const last = history?.[history.length - 1];
  return last ? text(last.outcome ?? last.result) : DASH;
}

/** Column heads for `yearRow`. */
export const YEAR_HEAD = 'day  yr season    weather  cold stars threat     raid';

/** One day of the year view (call at the day's end). */
export function yearRow(state: WorldState, day: number): string {
  const s = state as unknown as SeasonsView;
  const c = calendar(state.tick);
  return [
    String(day).padStart(3),
    String(c.year).padStart(3),
    `${SEASON_NAMES[c.season]} ${c.day}`.padEnd(9),
    weather(s).padEnd(8),
    cold(s).padStart(4),
    stars(s).padStart(5),
    band(s).padEnd(10),
    raid(s),
  ].join(' ');
}
