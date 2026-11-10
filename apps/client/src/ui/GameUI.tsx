import { DEBUG } from '../app/debug';
import type { Session } from '../app/session';
import { DebugOverlay, Dialogs, InviteDialog, Toasts } from './Overlays';
import { EmoteBubbles, EmoteWheel } from './Emotes';
import { minimapShown } from './Minimap';
import { panels } from './panels';
import { storesShowing } from './panels/Stores';
import { PresenceLabels } from './Presence';
import { RemovalConfirm } from './RemovalConfirm';
import { HelpOverlay, SettingsPanel } from './SettingsPanel';
import { Toolbar } from './Toolbar';
import { StockStrip, TopBar } from './TopBar';
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
  const season = seasonKey(session.mirror.tick.value);
  return (
    <div class={`game-ui season-${season} ${minimapShown(session) ? 'with-minimap' : ''}`}>
      {panels
        .filter((p) => p.side === 'world')
        .map((p) => (
          <p.component key={p.id} session={session} />
        ))}
      <PresenceLabels session={session} />
      <TopBar session={session} onLeave={onLeave} />
      {/* The lane is the gap between whatever is open on either side; the strip keeps to it. P1:
          the Ledger's strip steps aside while the Stores panel says the same, larger. */}
      {!storesShowing(session, !!book) && (
        <div class="strip-lane">
          <StockStrip session={session} />
        </div>
      )}
      {/* The left feed steps aside while a book is open, so only one thing talks at a time. */}
      {!book && (
        <aside class="side left">
          {panels
            .filter((p) => p.side === 'left')
            // The stores sit at the top of the column, above the alerts and notes.
            .sort((a, b) => Number(b.id === 'stores') - Number(a.id === 'stores'))
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
        .map((p) => (
          <p.component key={p.id} session={session} />
        ))}
      {DEBUG && !CLEAN && <DebugOverlay session={session} />}
    </div>
  );
}
