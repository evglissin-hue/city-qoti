import { content, type CallingDef } from '@qoti/content';
import type { CallingView, SeatView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { Glyph } from '../icons';

/** Two seats share the valley and one is away: the choice waits for both. */
export function choiceWaits(c: CallingView, seats: readonly SeatView[]): boolean {
  return c.together && seats.filter((s) => s.connected).length < 2;
}

/** Everything the card says about a calling: the effects in plain words, then what it unlocks. */
export function callingLines(def: CallingDef): string[] {
  return def.effectLines;
}

/**
 * The Calling card (docs/spec/15-progression.md, Callings): once the Village Charter is claimed the
 * County asks what the village means to be known for and the valley suggests two, each with the
 * reason the map gave and what it does. Either seat chooses, together in a valley for two. After
 * the choice the card only reminds you what was chosen. Opens from the goal pill.
 */
export function CallingPanel({ session }: { session: Session }) {
  const m = session.mirror;
  const c = m.charter.value?.calling;
  if (!session.ui.calling.value || !c) return null;
  const town = m.settings.value.townName;
  const close = () => (session.ui.calling.value = false);
  const waits = choiceWaits(c, m.seats.value);
  const chosen = c.chosen ? content.callingById.get(c.chosen) : undefined;
  return (
    <div class="modal-backdrop letter-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        class="rank-card calling-card"
        role="dialog"
        aria-label={`What ${town} is known for`}
        data-testid="calling-card"
      >
        <p class="kicker">A letter from the County</p>
        <h2>{chosen ? `${town} is known for it` : `What is ${town} known for?`}</h2>
        <p class="proclamation">
          {chosen
            ? `${chosen.name}, by your own choice. The County has made a note, and it does not change its notes.`
            : 'The County only asks once. The valley suggests two, and here is why.'}
        </p>
        <div class="calling-options">
          {c.offered.map((o) => {
            const def = content.callingById.get(o.id);
            if (!def) return null;
            const picked = c.chosen === def.id;
            return (
              <section
                key={def.id}
                class={`calling-option ${picked ? 'picked' : ''} ${chosen && !picked ? 'passed' : ''}`}
                data-testid={`calling-${def.id}`}
              >
                <h3>
                  <Glyph id={def.icon} /> {def.name}
                </h3>
                <p class="calling-blurb">{def.blurb}</p>
                <p class="calling-reason" data-testid={`calling-reason-${def.id}`}>
                  <span class="label">The map says</span> {o.reason}
                </p>
                <ul class="calling-effects">
                  {callingLines(def).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {picked ? (
                  <p class="calling-picked" data-testid={`calling-picked-${def.id}`}>
                    <Glyph id="check" /> Chosen
                  </p>
                ) : (
                  !chosen && (
                    <button
                      type="button"
                      class="primary"
                      data-testid={`calling-choose-${def.id}`}
                      disabled={waits}
                      title={waits ? 'Both of you need to be here to choose' : undefined}
                      onClick={() => session.submit({ t: 'calling.choose', id: def.id })}
                    >
                      {waits ? 'Choose this together' : 'Choose'}
                    </button>
                  )
                )}
              </section>
            );
          })}
        </div>
        <div class="actions">
          <button type="button" data-testid="calling-close" onClick={close}>
            {chosen ? 'Close' : 'Decide later'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The Charter board's word on the calling: what was chosen, or the way to the open question. */
export function CallingNote({ session, calling }: { session: Session; calling: CallingView | undefined }) {
  if (!calling) return null;
  const chosen = calling.chosen ? content.callingById.get(calling.chosen) : undefined;
  const town = session.mirror.settings.value.townName;
  const open = () => (session.ui.calling.value = true);
  return (
    <p class="charter-calling" data-testid="charter-calling">
      {chosen ? (
        <>
          <Glyph id={chosen.icon} /> Known for <b>{chosen.name}</b>{' '}
          <button type="button" class="link" data-testid="open-calling" onClick={open}>
            Read it again
          </button>
        </>
      ) : (
        <button type="button" class="link" data-testid="open-calling" onClick={open}>
          <Glyph id="charter" /> Choose what {town} is known for
        </button>
      )}
    </p>
  );
}
