// Chronicle API (C3.0 contract; C3B owns it). Any system writes history through chronicle():
// it renders the kind's template with params, stores the entry and emits chronicle.added. The
// variant is picked with the 'misc' stream, so both laptops write the same words.
//
// The founding entry always comes first: if another kind is written before it in a standard
// valley's first hour (households arriving on tick 0, say), the founding is written just ahead.
import { content } from '@qoti/content';
import { SEASON_NAMES, TICKS_PER_HOUR } from '../../constants';
import type { ChronicleEntry, EntityId, SeatId, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { chronicleView, fillText } from '../../view/hamlet';
import { calendar } from '../clock/calendar';
import { listJoin, pick } from './text';

export interface ChronicleParams {
  /** Placeholder values, for example [['family', 'Thistledown'], ['place', 'Mill Lane']]. */
  text: [name: string, value: string][];
  refs?: EntityId[];
  seats?: SeatId[];
  /** I2 (C4D): a chosen variant (taken modulo the template count) instead of a random pick. */
  variant?: number;
  /**
   * I3 (C5.0): a notable entry (festival, raid, trial, first sighting, flood, rank-up, first
   * winter) the lowest connected seat's client photographs (C5E captures, C5F stores).
   */
  snapshot?: { focus: [number, number]; radius: number };
}

export function chronicle(state: WorldState, ctx: TickCtx, kind: string, params: ChronicleParams): void {
  if (
    kind !== 'founding' &&
    state.chronicle.length === 0 &&
    isStandard(state) &&
    state.tick <= TICKS_PER_HOUR
  ) {
    writeFounding(state, ctx);
  }
  const t = content.chronicleByKind.get(kind);
  const base: [string, string][] = [
    ['town', state.settings.townName],
    ['valley', state.settings.valleyName],
  ];
  const entry: ChronicleEntry = {
    id: state.nextId++,
    tick: state.tick,
    kind,
    text: fillText(chosen(ctx, t?.text ?? [kind], params.variant), [...params.text, ...base]),
    refs: [...(params.refs ?? [])],
    seats: [...(params.seats ?? [])],
    ...(params.snapshot && {
      snapshot: { focus: [...params.snapshot.focus], radius: params.snapshot.radius },
    }),
  };
  state.chronicle.push(entry);
  const view = chronicleView(entry);
  ctx.events.push(
    entry.snapshot
      ? { e: 'chronicle.added', c: view, snapshot: entry.snapshot }
      : { e: 'chronicle.added', c: view },
  );
}

function chosen(ctx: TickCtx, list: readonly string[], variant: number | undefined): string {
  if (variant === undefined || list.length === 0) return pick(ctx, list);
  return list[((variant % list.length) + list.length) % list.length]!;
}

/** The first page: the season and the names of the seats that founded the town. */
export function writeFounding(state: WorldState, ctx: TickCtx): void {
  const names = state.seats.map((s) => s.name).filter((n) => n.length > 0);
  chronicle(state, ctx, 'founding', {
    text: [
      ['season', SEASON_NAMES[calendar(state.tick).season].toLowerCase()],
      ['founders', names.length > 0 ? listJoin(names) : 'the founders'],
    ],
    seats: state.seats.map((s) => s.seat),
  });
}
