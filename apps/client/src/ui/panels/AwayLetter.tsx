import type { Session } from '../../app/session';
import { seatLabel } from '../format';

/** On arrival after a day or more away: a letter on paper with what happened meanwhile. */
export function AwayLetterPanel({ session }: { session: Session }) {
  const letter = session.ui.letter.value;
  if (!letter) return null;
  const m = session.mirror;
  const seats = m.seats.value;
  const me = seats.find((s) => s.seat === session.seat);
  const partner = seats.find((s) => s.seat !== session.seat);
  const town = m.settings.value.townName;
  const close = () => (session.ui.letter.value = null);
  const changed = letter.stats.filter(([, before, after]) => before !== after);
  const days = letter.days === 1 ? 'a day' : `${letter.days} days`;
  return (
    <div class="modal-backdrop letter-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="away-letter" role="dialog" aria-label="While you were away" data-testid="away-letter">
        <span class="letter-stamp" aria-hidden="true">
          {town.slice(0, 1)}
        </span>
        <p class="letter-salutation">Dear {me?.name || 'friend'},</p>
        <p>
          You were away for {days}. {town} did not stop to wait, but it did save you a seat. Here is what you
          missed.
        </p>
        {changed.length > 0 && (
          <ul class="letter-stats">
            {changed.map(([label, before, after]) => (
              <li key={label}>
                <span>{label}</span>
                <span class="from">{before}</span>
                <span class="arrow" aria-hidden="true">
                  →
                </span>
                <b>{after}</b>
              </li>
            ))}
          </ul>
        )}
        {letter.entries.length > 0 ? (
          <ul class="letter-news">
            {letter.entries.slice(-8).map((e) => (
              <li key={e.id}>{e.text}</li>
            ))}
          </ul>
        ) : (
          <p class="muted">Not much made the papers. A quiet stretch, by the look of it.</p>
        )}
        {letter.notes.length > 0 && (
          <>
            <p class="letter-notes-head">Notes left for you:</p>
            <ul class="letter-notes">
              {letter.notes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    class="link"
                    onClick={() => {
                      close();
                      session.render?.focus(n.x, n.z);
                      session.ui.selection.value = { kind: 'note', id: n.id };
                    }}
                  >
                    "{n.text}"
                  </button>{' '}
                  <span class="muted">from {seatLabel(seats, n.by, session.seat)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p class="letter-signoff">
          Yours, with mud on its boots,
          <br />
          <span class="signature">{partner ? `${partner.name} and the valley` : 'The valley'}</span>
        </p>
        <div class="actions">
          <button type="button" class="primary" data-testid="letter-close" onClick={close}>
            Back to it
          </button>
        </div>
      </div>
    </div>
  );
}
