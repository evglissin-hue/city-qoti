import { DEBUG } from '../app/debug';
import type { Session } from '../app/session';
import { DebugOverlay, Dialogs, InviteDialog, Toasts } from './Overlays';
import { EmoteBubbles, EmoteWheel } from './Emotes';
import { panels } from './panels';
import { PingMenuView } from './PingMenu';
import { PresenceLabels } from './Presence';
import { RemovalConfirm } from './RemovalConfirm';
import { HelpOverlay, SettingsPanel } from './SettingsPanel';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import './hamlet.css';

/** ?clean hides the debug numbers, for screenshots. */
const CLEAN = new URLSearchParams(location.search).has('clean');

/** Everything drawn over the canvas once a valley is ready. */
export function GameUI({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const open = session.ui.panel.value;
  const book = open ? panels.find((p) => p.id === open && p.side === 'book') : undefined;
  return (
    <div class="game-ui">
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
      <PingMenuView />
      <EmoteWheel session={session} />
      <EmoteBubbles session={session} />
      <HelpOverlay session={session} />
      {panels
        .filter((p) => p.side === 'overlay')
        .map((p) => (
          <p.component key={p.id} session={session} />
        ))}
      {DEBUG && !CLEAN && <DebugOverlay session={session} />}
    </div>
  );
}
