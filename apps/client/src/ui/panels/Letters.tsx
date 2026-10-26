import type { StoryView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { shortDate } from '../format';
import { Glyph } from '../icons';
import { letterKey, lettersOf, stepWord } from '../letters';
import { Portrait } from '../Portrait';
import { LIFE_ICON } from '../village';
import { Empty, Frame } from './parts';
import { openLetter } from './StoryLetter';

/**
 * The Hearth's letter box: each story character with where their story stands and their letters
 * as envelopes, then the thank-you notes residents sent this visit.
 */
export function LettersPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.villageRevision.value;
  void m.letters.value;
  const stories = [...m.stories.values()].filter((s) => s.step >= 0 || s.residentId);
  const all = [...session.ui.letters.value].reverse();
  const notes = all.filter((l) => !l.kind.startsWith('life-'));
  const news = all.filter((l) => l.kind.startsWith('life-'));
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame
      id="letters"
      class="book-panel letters"
      icon="letter"
      kicker="The Hearth"
      title="Letters"
      onClose={close}
    >
      {stories.length === 0 ? (
        <Empty>
          No letters yet. Interesting people tend to turn up once a place has a little something going on.
        </Empty>
      ) : (
        <div class="story-list">
          {stories.map((s) => (
            <StoryCard key={s.arc} session={session} s={s} />
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <>
          <h4 class="flourish">
            <span>Thank-you notes</span>
          </h4>
          <ul class="thank-notes" data-testid="thank-notes">
            {notes.slice(0, 8).map((n) => (
              <li key={n.key}>
                <Glyph id="heart" />
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {news.length > 0 && (
        <>
          <h4 class="flourish">
            <span>News of the neighbors</span>
          </h4>
          <ul class="thank-notes life-news" data-testid="life-news">
            {news.slice(0, 8).map((n) => (
              <li key={n.key}>
                <Glyph id={LIFE_ICON[n.kind.slice(5)] ?? 'heart'} />
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Frame>
  );
}

function StoryCard({ session, s }: { session: Session; s: StoryView }) {
  const m = session.mirror;
  const r = m.residents.get(s.residentId);
  const me = m.seats.value.find((x) => x.seat === session.seat);
  const letters = lettersOf(m, s, me?.name || 'neighbor');
  const read = session.ui.lettersRead.value;
  const finished = s.steps > 0 && s.step >= s.steps;
  const visit = () => {
    if (!r) return;
    session.ui.selection.value = { kind: 'resident', id: r.id };
    const home = m.buildings.get(r.homeId);
    if (home) session.render?.focus(home.x, home.z);
  };
  return (
    <article class="story-card" data-testid={`story-${s.arc}`}>
      <header>
        <button type="button" class="story-face" title="Look in on them" onClick={visit} disabled={!r}>
          {r ? (
            <Portrait species={r.species} look={r.look} stage={r.stage} size={46} mood={r.moodBand} />
          ) : (
            <span class="postage-initial">{s.name.slice(0, 1)}</span>
          )}
        </button>
        <div>
          <h4>{s.name}</h4>
          <p class="small muted">{finished ? 'Their story is told.' : stepWord(s.step, s.steps)}</p>
          {s.steps > 0 && (
            <span class="story-pips" aria-hidden="true">
              {Array.from({ length: s.steps }, (_, i) => (
                <i key={i} class={i < s.step ? 'done' : i === s.step ? 'now' : ''} />
              ))}
            </span>
          )}
        </div>
      </header>
      {s.hint && !finished && (
        <p class="story-hint">
          <Glyph id="wishes" /> {s.hint}
        </p>
      )}
      <ul class="envelopes">
        {[...letters].reverse().map((l) => {
          const unread = l.tick >= 0 && !read.has(letterKey(l));
          return (
            <li key={letterKey(l)}>
              <button
                type="button"
                class={`envelope ${unread ? 'unread' : ''}`}
                data-testid={`envelope-${l.arc}-${l.step}`}
                onClick={() => openLetter(session, l)}
              >
                <Glyph id="letter" />
                <span class="envelope-line">{firstLine(l.text)}</span>
                <span class="muted small">{l.tick >= 0 ? shortDate(l.tick) : stepWord(l.step, s.steps)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/** The first line that is not a greeting, trimmed for an envelope. */
function firstLine(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^dear\b/i.test(l));
  const line = lines[0] ?? text;
  return line.length > 64 ? `${line.slice(0, 62).trimEnd()}...` : line;
}
