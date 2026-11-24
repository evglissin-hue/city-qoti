import { useEffect, useState } from 'preact/hooks';
import { DEBUG } from './debugFlag';
import type { GameView as GameViewType } from './GameView';
import { createFixtureValley, FIXTURE, FIXTURE_KINDS, type FixtureKind } from './fixture';
import { readPlayHash, setPlayHash, takeInviteFromUrl } from './invite';
import { findRecent } from './recent';
import type { SessionTarget } from './session';
import { Title } from './Title';

// P3D: the game (Three.js, the renderer, the debug showcases) loads when a valley opens, not with the
// title, so the menu's entry chunk stays small. The debug hook still installs at load under ?debug.
if (DEBUG) {
  void Promise.all([import('./debug'), import('./GameView')]).then(([d, g]) =>
    d.installDebugHook(g.currentSession),
  );
}
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

  // P3D: the game's chunk, fetched when the first valley opens.
  const [Game, setGame] = useState<typeof GameViewType | null>(null);
  useEffect(() => {
    if (!play || Game) return;
    void import('./GameView').then((m) => setGame(() => m.GameView));
  }, [play, Game]);

  // P1: set by the chapter card's "Found a new valley", so the title opens on a fresh seed.
  const [fresh, setFresh] = useState(false);

  // ?debug&fixture=hamlet (=village, =winter, =raid): straight into a fresh copy of the sim's fixture.
  useEffect(() => {
    if (play || !DEBUG || !FIXTURE_KINDS.includes(FIXTURE as FixtureKind)) return;
    void createFixtureValley('Thistlecombe', FIXTURE as FixtureKind).then((v) => {
      setPlayHash(v.valleyId);
      setPlay({
        target: { valleyId: v.valleyId, seat: v.seat, token: v.token, mode: v.mode },
        invite: false,
      });
    });
  }, []);

  if (!play) {
    return (
      <Title
        fresh={fresh}
        onStart={(target, opts) => {
          setFresh(false);
          setPlayHash(target.valleyId);
          setPlay({ target, invite: opts?.invite ?? false });
        }}
      />
    );
  }
  if (!Game) return <div class="viewport" aria-busy="true" />;
  return (
    <Game
      key={play.target.valleyId}
      target={play.target}
      openInvite={play.invite}
      onLeave={() => {
        setFresh(false);
        setPlayHash(null);
        setPlay(null);
      }}
      onNewValley={() => {
        setFresh(true);
        setPlayHash(null);
        setPlay(null);
      }}
      onMove={(target) => {
        setPlayHash(target.valleyId);
        setPlay({ target, invite: true });
      }}
    />
  );
}
