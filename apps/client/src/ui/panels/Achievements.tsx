import { content } from '@qoti/content';
import type { Session } from '../../app/session';
import { seatList, shortDate } from '../format';
import { Frame } from './parts';

/** Plaques on the town hall wall: earned ones in brass, the rest as faint outlines. */
export function AchievementsPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.hamletRevision.value;
  const seats = m.seats.value;
  const list = content.achievements.map((def) => ({ def, view: m.achievements.get(def.id) }));
  const earned = list
    .filter((a) => a.view?.unlocked)
    .sort((a, b) => (a.view!.tick ?? 0) - (b.view!.tick ?? 0));
  const waiting = list.filter((a) => !a.view?.unlocked);
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame
      id="achievements"
      class="book-panel achievements"
      icon="achievements"
      kicker="On the town hall wall"
      title="Plaques"
      onClose={close}
    >
      <p class="muted small intro">
        {earned.length} of {list.length} earned.
      </p>
      <ul class="plaques">
        {[...earned, ...waiting].map(({ def, view }) => {
          const on = !!view?.unlocked;
          return (
            <li
              key={def.id}
              class={`plaque ${on ? 'earned' : 'waiting'} lane-${def.lane}`}
              data-testid={`plaque-${def.id}`}
            >
              <span class="plaque-rivets" aria-hidden="true" />
              <strong>{def.name}</strong>
              <span class="plaque-desc">{def.description}</span>
              {on && view && (
                <span class="plaque-date">
                  {view.tick !== undefined ? shortDate(view.tick) : ''}
                  {view.seats?.length ? `, ${seatList(seats, view.seats, session.seat)}` : ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}
