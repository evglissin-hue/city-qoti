import type { Session } from '../../app/session';

/** Every pinned note; click one to fly there. Playtest round five: hidden until there is a note. */
export function NotesPanel({ session }: { session: Session }) {
  void session.mirror.revision.value;
  const open = session.ui.notesOpen.value;
  const notes = [...session.mirror.notes.values()].sort((a, b) => b.id - a.id);
  const seats = session.mirror.seats.value;
  if (notes.length === 0) return null;
  return (
    <section class="panel notes" data-testid="notes">
      <header>
        <h3>Notes</h3>
        <button type="button" class="close" onClick={() => (session.ui.notesOpen.value = !open)}>
          {open ? '−' : '+'}
        </button>
      </header>
      {open && (
        <ul>
          {notes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  session.renderer?.focus(n.x, n.z);
                  session.ui.selection.value = { kind: 'note', id: n.id };
                }}
              >
                <span class="note-text">{n.text}</span>
                <span class="muted">{seats.find((s) => s.seat === n.by)?.name ?? 'Someone'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
