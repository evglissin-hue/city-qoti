import { content } from '@qoti/content';
import type { InnovationView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { shortDate } from '../format';
import { Glyph } from '../icons';
import { RANK_WORD, rankAtLeast } from '../village';
import { unlockName } from './Charter';
import { Frame, Meter } from './parts';

/** What sets each idea going, in the notebook's own words (the sim names its conditions in code). */
const NUDGE: Record<string, string> = {
  'brick-kiln': 'Keep a clay pit dug for a couple of days and someone will want to bake it.',
  carts: 'Once the village saws twenty planks a day, somebody is bound to put wheels on it.',
  cobbles: 'Cut twenty stone a day and the streets start to suggest themselves.',
  'water-wheel': 'A sawpit near the river, and a word from a certain inventor.',
  wheelbarrows: 'Keep the porters run off their feet for three days running.',
};

/**
 * The inventor's notebook (docs/spec/15-progression.md, Innovations): ideas the town is working
 * toward, each with a bar that fills as the conditions come true, and what it brings.
 */
export function NotebookPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.villageRevision.value;
  const rank = m.town.value?.rank ?? m.charter.value?.rank;
  const close = () => (session.ui.panel.value = null);
  const ideas = content.innovations.map((def) => {
    const v: InnovationView = m.innovations.get(def.id) ?? {
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      progress: 0,
      unlocked: false,
    };
    return { def, v, ready: rankAtLeast(rank, def.rank) };
  });
  // Brewing first (most progress first), then those that wait for a rank, then the ones in hand.
  const order = (x: (typeof ideas)[number]) => (x.v.unlocked ? 2 : x.ready ? 0 : 1);
  ideas.sort(
    (a, b) => order(a) - order(b) || b.v.progress - a.v.progress || a.def.id.localeCompare(b.def.id),
  );
  const done = ideas.filter((i) => i.v.unlocked).length;
  return (
    <Frame
      id="notebook"
      class="book-panel notebook"
      icon="notebook"
      kicker="Innovations"
      title="The inventor's notebook"
      onClose={close}
    >
      <p class="intro muted small">
        {done} of {ideas.length} worked out. The rest are scribbles, coffee rings and a lot of arrows.
      </p>
      <ul class="ideas">
        {ideas.map(({ def, v, ready }) => (
          <li
            key={def.id}
            class={`idea ${v.unlocked ? 'unlocked' : ready ? 'brewing' : 'waiting'}`}
            data-testid={`idea-${def.id}`}
          >
            <div class="idea-head">
              <span class="idea-mark" aria-hidden="true">
                {v.unlocked ? <Glyph id="check" /> : <Glyph id="notebook" />}
              </span>
              <h4>{v.name}</h4>
              {v.unlocked && v.tick !== undefined && (
                <span class="muted small">since {shortDate(v.tick)}</span>
              )}
            </div>
            <p class="idea-blurb">{v.blurb}</p>
            {!v.unlocked &&
              (ready ? (
                <>
                  <Meter value={v.progress / 100} note={`${Math.round(v.progress)}%`} tone="ochre" />
                  {NUDGE[def.id] && <p class="idea-nudge small">{NUDGE[def.id]}</p>}
                </>
              ) : (
                <p class="idea-nudge small muted">Waits until the town is a {RANK_WORD[def.rank]}.</p>
              ))}
            <p class="idea-unlocks small">
              <span class="label">{v.unlocked ? 'Brought' : 'Brings'}</span>
              {def.unlocks.map((u) => (
                <span key={u} class="unlock-chip">
                  {unlockName(u)}
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
      <p class="charter-foot">
        <button
          type="button"
          class="link"
          data-testid="open-charter"
          onClick={() => (session.ui.panel.value = 'charter')}
        >
          <Glyph id="charter" /> The Charter board
        </button>
      </p>
    </Frame>
  );
}
