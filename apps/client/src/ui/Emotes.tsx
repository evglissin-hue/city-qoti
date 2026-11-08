import type { Session } from '../app/session';
import { copy } from './copy';

const glyph = (id: string) => copy.emotes.list.find(([e]) => e === id)?.[1] ?? '\u{2728}';

/** Eight emotes in a ring; V toggles it. */
export function EmoteWheel({ session }: { session: Session }) {
  if (!session.ui.emoteOpen.value) return null;
  const close = () => (session.ui.emoteOpen.value = false);
  const n = copy.emotes.list.length;
  return (
    <div class="emote-backdrop" onPointerDown={close}>
      <div class="emote-wheel" data-testid="emote-wheel" onPointerDown={(e) => e.stopPropagation()}>
        {copy.emotes.list.map(([id, g, label], i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={id}
              type="button"
              class="emote"
              title={label}
              data-testid={`emote-${id}`}
              style={{ left: `${50 + Math.cos(a) * 38}%`, top: `${50 + Math.sin(a) * 38}%` }}
              onClick={() => {
                session.sendEmote(id);
                close();
              }}
            >
              {g}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Recent emotes as small bubbles under the top bar, tagged with who sent them. */
export function EmoteBubbles({ session }: { session: Session }) {
  const list = session.ui.emotes.value;
  if (list.length === 0) return null;
  const seats = session.mirror.seats.value;
  return (
    <div class="emote-bubbles" aria-live="polite">
      {list.map((e) => {
        const s = seats.find((v) => v.seat === e.seat);
        return (
          <span key={e.key} class="panel emote-bubble" data-testid="emote-bubble">
            <b>{glyph(e.id)}</b> {s ? s.name : copy.presence.partner}
          </span>
        );
      })}
    </div>
  );
}
