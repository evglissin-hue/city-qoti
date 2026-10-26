// Chronicle API (C3.0 contract; C3B owns it). Any system writes history through chronicle():
// it renders the kind's template with params, stores the entry and emits chronicle.added.
// C3.0 baseline: picks the variant with the 'misc' stream and fills {placeholders}.
import { content } from '@qoti/content';
import type { EntityId, SeatId, TickCtx, WorldState } from '../../contracts';
import { chronicleView, fillText } from '../../view/hamlet';

export interface ChronicleParams {
  /** Placeholder values, for example [['family', 'Thistledown'], ['place', 'Mill Lane']]. */
  text: [name: string, value: string][];
  refs?: EntityId[];
  seats?: SeatId[];
}

export function chronicle(state: WorldState, ctx: TickCtx, kind: string, params: ChronicleParams): void {
  const t = content.chronicleByKind.get(kind);
  const variants = t?.text ?? [kind];
  const pick = variants.length > 1 ? ctx.rng('misc').int(variants.length) : 0;
  const base: [string, string][] = [
    ['town', state.settings.townName],
    ['valley', state.settings.valleyName],
  ];
  const entry = {
    id: state.nextId++,
    tick: state.tick,
    kind,
    text: fillText(variants[pick]!, [...params.text, ...base]),
    refs: [...(params.refs ?? [])],
    seats: [...(params.seats ?? [])],
  };
  state.chronicle.push(entry);
  ctx.events.push({ e: 'chronicle.added', c: chronicleView(entry) });
}
