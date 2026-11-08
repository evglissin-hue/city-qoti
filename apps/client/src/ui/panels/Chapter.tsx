import { useEffect } from 'preact/hooks';
import type { Session } from '../../app/session';
import { chapterDone, chapterOpen, chapterSeen, chapterStory, markChapterSeen } from '../chapter';
import { Glyph } from '../icons';

const FLAGS = ['#d07f6c', '#e0b84a', '#7f9c6c', '#5f93b3', '#8a5d78', '#c48a3f'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The Village chapter (playtest item 13): once the First Winter has been weathered, a card in the
 * rank-up style with the story so far, what is still open, and the way to a new valley. Each seat
 * sees it once on its own (remembered per valley and seat); the Charter board reads it again.
 */
export function ChapterPanel({ session }: { session: Session }) {
  const m = session.mirror;
  const done = chapterDone(m);
  const open = session.ui.chapter.value;
  const { valleyId } = session.target;
  useEffect(() => {
    if (!done || session.ui.chapter.value || chapterSeen(valleyId, session.seat)) return;
    markChapterSeen(valleyId, session.seat);
    session.ui.chapter.value = true;
  }, [done, valleyId]);
  if (!open || !done) return null;
  const close = () => (session.ui.chapter.value = false);
  const story = chapterStory(m);
  const more = chapterOpen(m);
  const found = () => {
    close();
    session.onNewValley?.();
  };
  return (
    <div class="modal-backdrop letter-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        class="rank-card chapter-card"
        role="dialog"
        aria-label={`The Village chapter of ${story.town}`}
        data-testid="chapter"
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
        <p class="kicker">The Village chapter</p>
        <h2>{story.town} stood its first winter</h2>
        <p class="proclamation">
          The County has counted the chimneys and sealed the Charter. Here is what the two of you made in{' '}
          {story.valley}.
        </p>

        <h4 class="chapter-head">The story so far</h4>
        <ul class="chapter-story" data-testid="chapter-story">
          <li>
            Founded in {story.founded}; it is {story.now} now.
          </li>
          <li data-testid="chapter-people">
            {plural(story.residents, 'resident', 'residents')} in{' '}
            {plural(story.households, 'household', 'households')}, under{' '}
            {plural(story.homes, 'roof', 'roofs')}.
          </li>
          <li data-testid="chapter-festivals">
            {story.festivalsHeld === 0
              ? 'No festivals yet; the bunting has been patient.'
              : `${plural(story.festivalsHeld, 'festival', 'festivals')} held, the best of them at ${plural(story.bestStars, 'star', 'stars')}.`}
          </li>
          <li data-testid="chapter-found">
            {plural(story.species, 'creature', 'creatures')} in the Field Guide,{' '}
            {plural(story.patterns, 'pattern', 'patterns')} found,{' '}
            {plural(story.plaques, 'plaque', 'plaques')} on the wall.
          </li>
          <li data-testid="chapter-wishes">
            {plural(story.wishes, 'wish', 'wishes')} granted. Renown: {story.renownName}, with{' '}
            {plural(story.renownPoints, 'point', 'points')}.
          </li>
        </ul>
        {story.headline && (
          <p class="chapter-quote small muted" data-testid="chapter-headline">
            From the Chronicle: {story.headline}
          </p>
        )}

        <h4 class="chapter-head">Keep going</h4>
        <ul class="chapter-story" data-testid="chapter-open">
          <li>
            {more.renownToNext === null
              ? 'Renown has nowhere higher to go.'
              : `${plural(more.renownToNext, 'point', 'points')} of renown to ${more.renownNext ?? 'the next level'}.`}
          </li>
          <li>
            Plaques: {more.plaques.have} of {more.plaques.of}. Field Guide: {more.species.have} of{' '}
            {more.species.of}. Patterns: {more.patterns.have} of {more.patterns.of}.
          </li>
          <li>
            {more.commissionsOpen === 0
              ? 'No commissions waiting; visitors turn up with them now and then.'
              : `${plural(more.commissionsOpen, 'commission', 'commissions')} still open.`}
          </li>
        </ul>
        <p class="small muted">
          The Town Charter comes in a later update, and we would rather say so than invent a goal. Until then
          the valley is yours.
        </p>

        <h4 class="chapter-head">Found a new valley</h4>
        <p class="small">
          Every valley&apos;s land is new: other hills, another river, different places to put the bakery.
          Yours stays right here, and you can come back to it.
        </p>
        <div class="actions">
          <button type="button" class="primary" data-testid="chapter-close" onClick={close}>
            <Glyph id="rank" /> Keep going
          </button>
          <button type="button" data-testid="chapter-new-valley" onClick={found}>
            <Glyph id="charter" /> Found a new valley
          </button>
        </div>
      </div>
    </div>
  );
}
