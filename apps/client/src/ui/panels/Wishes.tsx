import type { WishView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { untilText } from '../format';
import { Portrait } from '../Portrait';
import { Empty, Frame } from './parts';

/** Every wish in the valley. Selecting one highlights its target area as a soft ghost. */
export function WishesPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.hamletRevision.value;
  const now = m.tick.value;
  const focus = session.ui.wishFocus.value;
  const wishes = [...m.wishes.values()].sort((a, b) => a.expiresTick - b.expiresTick);
  const granted = m.town.value?.wishesGranted ?? 0;
  const close = () => {
    session.ui.panel.value = null;
    unfocus(session);
  };

  const pick = (w: WishView) => {
    if (focus === w.id) {
      unfocus(session);
      return;
    }
    session.ui.wishFocus.value = w.id;
    if (w.area) {
      session.render?.highlight?.({ x: w.area.x, z: w.area.z, radius: w.area.radius, tone: w.lane });
      session.render?.focus(w.area.x, w.area.z);
    } else {
      session.render?.highlight?.(null);
      const home = m.buildings.get(w.homeId);
      if (home) session.render?.focus(home.x, home.z);
    }
  };

  return (
    <Frame
      id="wishes"
      class="book-panel wishes"
      icon="wishes"
      kicker="What the valley would like"
      title="Wishes"
      onClose={close}
    >
      <p class="muted small intro">
        {wishes.length === 0
          ? 'Nobody is wishing for anything right now. Enjoy it while it lasts.'
          : `${wishes.length} ${wishes.length === 1 ? 'wish' : 'wishes'} open, ${granted} granted so far. Pick one to see where it wants to happen.`}
      </p>
      {wishes.length === 0 ? (
        <Empty>New wishes arrive in the morning, with the bread.</Empty>
      ) : (
        <ul class="wish-list">
          {wishes.map((w) => {
            const r = m.residents.get(w.residentId);
            const left = untilText(w.expiresTick, now);
            return (
              <li key={w.id} class={`wish lane-${w.lane} ${focus === w.id ? 'focused' : ''}`}>
                <button type="button" class="wish-pick" data-testid={`wish-${w.id}`} onClick={() => pick(w)}>
                  {r && (
                    <Portrait species={r.species} look={r.look} stage={r.stage} size={40} mood={r.moodBand} />
                  )}
                  <span class="wish-body">
                    <span class="wish-text">{w.text}</span>
                    <span class="wish-meta">
                      <span class={`lane-tag ${w.lane}`}>{w.lane === 'hearth' ? 'Hearth' : 'Ledger'}</span>
                      <span class="muted">{left}</span>
                    </span>
                  </span>
                </button>
                {r && (
                  <button
                    type="button"
                    class="link who"
                    onClick={() => (session.ui.selection.value = { kind: 'resident', id: r.id })}
                  >
                    {r.given}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Frame>
  );
}

function unfocus(session: Session): void {
  session.ui.wishFocus.value = null;
  session.render?.highlight?.(null);
}
