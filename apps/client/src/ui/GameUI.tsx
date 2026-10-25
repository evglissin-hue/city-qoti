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

/** Everything drawn over the canvas once a valley is ready. */
export function GameUI({ session, onLeave }: { session: Session; onLeave: () => void }) {
  return (
    <div class="game-ui">
      <PresenceLabels session={session} />
      <TopBar session={session} onLeave={onLeave} />
      <aside class="side left">
        {panels
          .filter((p) => p.side === 'left')
          .map((p) => (
            <p.component key={p.id} session={session} />
          ))}
      </aside>
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
      {DEBUG && <DebugOverlay session={session} />}
    </div>
  );
}
