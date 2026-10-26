import { useEffect, useRef, useState } from 'preact/hooks';
import { GameUI } from '../ui/GameUI';
import { DEBUG } from './debug';
import { MOCK_OVERLAY, overlayMocks } from './fixture';
import { Session, type SessionTarget } from './session';

let current: Session | null = null;

/** The session on screen, for the debug hook. */
export function currentSession(): Session | null {
  return current;
}

export function GameView({
  target,
  openInvite,
  onLeave,
}: {
  target: SessionTarget;
  openInvite: boolean;
  onLeave: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [session] = useState(() => new Session(target));

  useEffect(() => {
    current = session;
    if (openInvite) session.ui.inviteOpen.value = true;
    if (container.current) void session.start(container.current);
    return () => {
      session.close();
      if (current === session) current = null;
    };
  }, [session, openInvite]);

  const phase = session.phase.value;
  useEffect(() => {
    if (phase === 'ready' && DEBUG && MOCK_OVERLAY) void overlayMocks(session);
  }, [phase === 'ready']);
  return (
    <div class="game">
      <div class="viewport" ref={container} />
      {phase === 'ready' && <GameUI session={session} onLeave={onLeave} />}
      {phase !== 'ready' && (
        <div class="loading">
          <div class="panel loading-card">
            {phase === 'failed' ? (
              <>
                <p class="error">{session.error.value}</p>
                <button type="button" onClick={onLeave}>
                  Back to the title
                </button>
              </>
            ) : (
              <p>{phase === 'connecting' ? 'Knocking on the valley gate...' : 'Unpacking the valley...'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
