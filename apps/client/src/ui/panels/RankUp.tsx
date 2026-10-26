import { content } from '@qoti/content';
import type { Session } from '../../app/session';
import { Glyph } from '../icons';
import { RANK_WORD } from '../village';
import { unlockName } from './Charter';

const FLAGS = ['#d07f6c', '#e0b84a', '#7f9c6c', '#5f93b3', '#8a5d78', '#c48a3f'];

/**
 * The rank-up moment (docs/spec/15-progression.md, P40): the County's proclamation on a card under
 * a string of bunting, and what the new rank brings. Calm: no flashing, the bunting just sways.
 */
export function RankUpPanel({ session }: { session: Session }) {
  const up = session.ui.rankUp.value;
  if (!up) return null;
  const close = () => (session.ui.rankUp.value = null);
  const charter = content.charters.find((c) => c.rank === up.rank);
  const town = session.mirror.settings.value.townName;
  const text = up.text || (charter?.proclamation ?? '').split('{town}').join(town);
  return (
    <div class="modal-backdrop letter-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        class="rank-card"
        role="dialog"
        aria-label={`${town} is now a ${RANK_WORD[up.rank]}`}
        data-testid="rank-up"
      >
        <svg class="bunting" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 6 Q150 30 300 6" fill="none" stroke="var(--ink-line)" stroke-width="1.4" />
          {Array.from({ length: 11 }, (_, i) => {
            const x = 14 + i * 27;
            const y = 6 + 24 * (1 - ((x - 150) / 150) ** 2) * 0.5;
            return (
              <path
                key={i}
                class="flag"
                style={{ animationDelay: `${(i % 4) * 0.35}s` }}
                d={`M${x - 9} ${y} L${x + 9} ${y} L${x} ${y + 16} Z`}
                fill={FLAGS[i % FLAGS.length]}
                stroke="var(--ink-line)"
                stroke-width="1"
              />
            );
          })}
        </svg>
        <p class="kicker">By order of the County</p>
        <h2>
          {town} is a {RANK_WORD[up.rank]}
        </h2>
        <p class="proclamation">{text}</p>
        {charter && charter.unlocks.length > 0 && (
          <>
            <p class="small muted">Now open to you both:</p>
            <p class="charter-unlocks">
              {charter.unlocks.map((u) => (
                <span key={u} class="unlock-chip">
                  {unlockName(u)}
                </span>
              ))}
            </p>
          </>
        )}
        <div class="actions">
          <button type="button" class="primary" data-testid="rank-up-close" onClick={close}>
            <Glyph id="rank" /> Hang the bunting
          </button>
        </div>
      </div>
    </div>
  );
}
