import type { EditionLine, SeatView } from '@qoti/sim';
import type { ComponentChildren } from 'preact';
import type { Session } from '../../app/session';
import { dayDate } from '../format';
import { Glyph } from '../icons';
import { editionTarget, eveningWeatherWords, tallyLine } from '../eveningFeed';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A line's words with each credited seat's name set in that seat's color. */
export function creditedText(text: string, line: EditionLine, seats: readonly SeatView[]): ComponentChildren {
  const names = line.seats
    .map((id) => seats.find((s) => s.seat === id))
    .filter((s): s is SeatView => !!s && s.name.length > 0);
  if (names.length === 0) return text;
  const out: ComponentChildren[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    let best: { i: number; s: SeatView } | null = null;
    for (const s of names) {
      const i = rest.indexOf(s.name);
      if (i >= 0 && (!best || i < best.i)) best = { i, s };
    }
    if (!best) break;
    if (best.i > 0) out.push(rest.slice(0, best.i));
    out.push(
      <b key={key++} class="edition-name" style={{ '--seat': hex(best.s.color) }}>
        {best.s.name}
      </b>,
    );
    rest = rest.slice(best.i + best.s.name.length);
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * The evening edition (docs/spec/17-presentation.md): at 21:00 a slim card of three to five lines
 * about the evening, each crediting the seats whose work it was. A line that points somewhere takes
 * the camera there. It sits low on the screen with no backdrop, so the valley stays in view.
 */
export function EditionPanel({ session }: { session: Session }) {
  const v = session.ui.edition.value;
  if (!v) return null;
  const seats = session.mirror.seats.value;
  const close = () => (session.ui.edition.value = null);
  const go = (line: EditionLine) => {
    for (const ref of line.refs) {
      const target = editionTarget(session.mirror, ref);
      if (!target) continue;
      session.render?.focus(target.x, target.z);
      if (target.place) session.ui.selection.value = { kind: 'place', id: target.place };
      return;
    }
  };
  const tally = tallyLine(v);
  return (
    <div class="edition-slot">
      <div class="edition-card" role="dialog" aria-label="The Evening Edition" data-testid="edition">
        <header class="edition-head">
          <p class="kicker">The Evening Edition</p>
          <p class="edition-date">
            {dayDate(v.tally.day)}. {eveningWeatherWords(v.tally.weather)}.
          </p>
        </header>
        <ul class="edition-lines">
          {v.lines.map((l, i) => {
            const clickable = l.refs.some((r) => editionTarget(session.mirror, r));
            const body = (
              <>
                <span class="edition-mark" aria-hidden="true">
                  {i === 0 ? '★' : '•'}
                </span>
                <span class="edition-text">{creditedText(l.text, l, seats)}</span>
              </>
            );
            return (
              <li key={i}>
                {clickable ? (
                  <button
                    type="button"
                    class="edition-line"
                    title="Have a look"
                    data-testid="edition-line"
                    onClick={() => go(l)}
                  >
                    {body}
                  </button>
                ) : (
                  <p class="edition-line">{body}</p>
                )}
              </li>
            );
          })}
        </ul>
        {tally && <p class="edition-tally small muted">{tally}</p>}
        <div class="actions">
          <button type="button" class="primary" data-testid="edition-close" onClick={close}>
            <Glyph id="chronicle" /> Put it down
          </button>
        </div>
      </div>
    </div>
  );
}
