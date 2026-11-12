import { DEBUG } from '../app/debug';
import type { Session } from '../app/session';
import { CARD_PANELS, cardQueue, lamplit, waitingWords } from './cards';
import { DebugOverlay, Dialogs, InviteDialog, Toasts } from './Overlays';
import { EmoteBubbles, EmoteWheel } from './Emotes';
import { minimapShown } from './Minimap';
import { panels } from './panels';
import { PresenceLabels } from './Presence';
import { RemovalConfirm } from './RemovalConfirm';
import { HelpOverlay, SettingsPanel } from './SettingsPanel';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import './hamlet.css';
import './village.css';
import './seasons.css';
import { seasonKey } from './seasons';

/** ?clean hides the debug numbers, for screenshots. */
const CLEAN = new URLSearchParams(location.search).has('clean');

/** Everything drawn over the canvas once a valley is ready. */
export function GameUI({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const open = session.ui.panel.value;
  const book = open ? panels.find((p) => p.id === open && p.side === 'book') : undefined;
  // I3 (C5F): photo mode hides everything but its own strip.
  if (session.ui.photo.value) {
    const strip = panels.find((p) => p.id === 'photo');
    return <div class="game-ui photo-mode">{strip && <strip.component session={session} />}</div>;
  }
  // I3 (C5F): the paper takes a faint tint of the season.
  const tick = session.mirror.tick.value;
  const season = seasonKey(tick);
  // R1 (R1C): cards wait their turn; the first to arrive is the one on show.
  const queue = cardQueue(session);
  const front = queue[0];
  /** A waiting card stays mounted but hidden; the guide waits behind any card. */
  // The raid panel also holds the live raid bar, so it handles its own card's turn.
  const waits = (id: string) =>
    (CARD_PANELS.has(id) && id !== front && id !== 'raid') || (id === 'guide' && !!front);
  return (
    <div
      class={`game-ui season-${season} ${lamplit(tick) ? 'lamplight' : ''} ${minimapShown(session) ? 'with-minimap' : ''}`}
    >
      {panels
        .filter((p) => p.side === 'world')
        .map((p) => (
          <p.component key={p.id} session={session} />
        ))}
      <PresenceLabels session={session} />
      <TopBar session={session} onLeave={onLeave} />
      {/* The left feed steps aside while a book is open, so only one thing talks at a time. */}
      {!book && (
        <aside class="side left">
          {panels
            .filter((p) => p.side === 'left')
            .map((p) => (
              <p.component key={p.id} session={session} />
            ))}
        </aside>
      )}
      {book && (
        <aside class={`book-slot ${book.wide ? 'wide' : ''}`} data-panel={book.id}>
          <book.component key={book.id} session={session} />
        </aside>
      )}
      <aside class="side right">
        {panels
          .filter((p) => p.side === 'right')
          .map((p) => (
            <p.component key={p.id} session={session} />
          ))}
      </aside>
      <Toolbar session={session} />
      <Toasts session={session} />
      <Dialogs session={session} />
      <InviteDialog session={session} />
      <RemovalConfirm />
      <SettingsPanel session={session} />
      <EmoteWheel session={session} />
      <EmoteBubbles session={session} />
      <HelpOverlay session={session} />
      {panels
        .filter((p) => p.side === 'overlay')
        .map((p) =>
          waits(p.id) ? (
            <div key={p.id} class="card-waiting" hidden>
              <p.component session={session} />
            </div>
          ) : (
            <p.component key={p.id} session={session} />
          ),
        )}
      {queue.length > 1 && (
        <div class="card-stack" data-testid="card-stack" title="Each opens when you close the one before it.">
          <span class="card-stack-sheets" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>{waitingWords(queue.length - 1)}</span>
        </div>
      )}
      {DEBUG && !CLEAN && <DebugOverlay session={session} />}
    </div>
  );
}
