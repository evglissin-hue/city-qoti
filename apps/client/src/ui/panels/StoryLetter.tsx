import type { LetterView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { shortDate } from '../format';
import { fillLetter, letterKey, stepWord } from '../letters';
import { Portrait } from '../Portrait';

/**
 * A story character's letter, on its own sheet over the valley (docs/spec/11-residents.md, Story
 * characters): their words, a postage stamp with their face, and the open step's hint as a P.S.
 */
export function StoryLetterPanel({ session }: { session: Session }) {
  const letter = session.ui.storyLetter.value;
  if (!letter) return null;
  const m = session.mirror;
  const story = m.stories.get(letter.arc);
  const r = m.residents.get(letter.residentId);
  const me = m.seats.value.find((s) => s.seat === session.seat);
  const reader = me?.name || 'neighbor';
  const town = m.settings.value.townName;
  const lines = fillLetter(letter.text, town, reader)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  // A letter that opens with its own "Dear ..." keeps it; the rest get one.
  const salutation = lines[0] && /^dear\b/i.test(lines[0]) ? lines.shift()! : `Dear ${reader},`;
  const close = () => {
    session.ui.storyLetter.value = null;
  };
  const visit = () => {
    close();
    if (!r) return;
    session.ui.selection.value = { kind: 'resident', id: r.id };
    const home = m.buildings.get(r.homeId);
    if (home) session.render?.focus(home.x, home.z);
  };
  const hint = story && letter.step >= 0 && letter.step === story.step ? story.hint : undefined;
  const given = letter.from.split(' ')[0] ?? letter.from;
  return (
    <div class="modal-backdrop letter-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        class="away-letter story-letter"
        role="dialog"
        aria-label={`A letter from ${letter.from}`}
        data-testid="story-letter"
      >
        <span class="postage" aria-hidden="true">
          {r ? (
            <Portrait species={r.species} look={r.look} stage={r.stage} size={50} mood={r.moodBand} />
          ) : (
            <span class="postage-initial">{letter.from.slice(0, 1)}</span>
          )}
          <Postmark town={town} />
        </span>
        <p class="letter-meta">
          {stepWord(letter.step, story?.steps ?? 0)}
          {letter.tick >= 0 && <span>, {shortDate(letter.tick)}</span>}
        </p>
        <p class="letter-salutation">{salutation}</p>
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
        <p class="letter-signoff">
          Yours,
          <br />
          <span class="signature">{letter.from}</span>
        </p>
        {hint && (
          <p class="letter-ps" data-testid="letter-ps">
            P.S. {hint}
          </p>
        )}
        <div class="actions">
          {r && (
            <button type="button" data-testid="letter-visit" onClick={visit}>
              Look in on {given}
            </button>
          )}
          <button type="button" class="primary" data-testid="story-letter-close" onClick={close}>
            Back to it
          </button>
        </div>
      </div>
    </div>
  );
}

/** Puts a letter on the desk and marks it read. */
export function openLetter(session: Session, letter: LetterView): void {
  session.ui.storyLetter.value = letter;
  const key = letterKey(letter);
  if (!session.ui.lettersRead.value.has(key)) {
    session.ui.lettersRead.value = new Set([...session.ui.lettersRead.value, key]);
  }
}

/** A round postmark with the town's name, and the wavy cancel lines across the stamp. */
function Postmark({ town }: { town: string }) {
  const name = town.toUpperCase().slice(0, 18);
  return (
    <svg class="postmark" viewBox="0 0 120 64" aria-hidden="true">
      <defs>
        <path id="postmark-arc" d="M12 32a20 20 0 1 1 40 0a20 20 0 1 1-40 0" />
      </defs>
      <circle cx="32" cy="32" r="25" />
      <circle cx="32" cy="32" r="14.5" />
      <text>
        <textPath href="#postmark-arc" startOffset="2">
          {name}
        </textPath>
      </text>
      <path
        class="cancel"
        d="M60 22c8-5 14 5 22 0s14 5 22 0 10 4 14 1M60 32c8-5 14 5 22 0s14 5 22 0 10 4 14 1M60 42c8-5 14 5 22 0s14 5 22 0 10 4 14 1"
      />
    </svg>
  );
}
