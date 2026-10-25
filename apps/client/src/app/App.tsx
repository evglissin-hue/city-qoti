import { useState } from 'preact/hooks';
import { installDebugHook } from './debug';
import { currentSession, GameView } from './GameView';
import { readPlayHash, setPlayHash, takeInviteFromUrl } from './invite';
import { findRecent } from './recent';
import type { SessionTarget } from './session';
import { Title } from './Title';

installDebugHook(currentSession);
takeInviteFromUrl();

function resumeTarget(): SessionTarget | null {
  const id = readPlayHash();
  const v = id ? findRecent(id) : undefined;
  if (!v) return null;
  return {
    valleyId: v.valleyId,
    seat: v.seat,
    token: v.token,
    mode: v.mode,
    ...(v.invite ? { invite: v.invite } : {}),
  };
}

/** Title screen or a valley. The valley id rides in the fragment so a reload resumes it. */
export function App() {
  const [play, setPlay] = useState<{ target: SessionTarget; invite: boolean } | null>(() => {
    const target = resumeTarget();
    return target ? { target, invite: false } : null;
  });

  if (!play) {
    return (
      <Title
        onStart={(target, opts) => {
          setPlayHash(target.valleyId);
          setPlay({ target, invite: opts?.invite ?? false });
        }}
      />
    );
  }
  return (
    <GameView
      key={play.target.valleyId}
      target={play.target}
      openInvite={play.invite}
      onLeave={() => {
        setPlayHash(null);
        setPlay(null);
      }}
    />
  );
}
