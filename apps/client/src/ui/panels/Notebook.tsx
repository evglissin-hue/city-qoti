import { content } from '@qoti/content';
import type { InnovationView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { shortDate } from '../format';
import { Glyph } from '../icons';
import { RANK_WORD, rankAtLeast } from '../village';
import { unlockName } from './Charter';
import { Frame } from './parts';

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
              {v.unlocked ? (
                v.tick !== undefined && <span class="muted small">since {shortDate(v.tick)}</span>
              ) : ready ? (
                <Gauge value={v.progress} />
              ) : (
                <Glyph id="lock" class="idea-lock" />
              )}
            </div>
            {!v.unlocked && <p class="idea-blurb">{v.blurb}</p>}
            {!v.unlocked && (
              <p class="idea-nudge small">
                {ready ? (NUDGE[def.id] ?? '') : `Waits until the town is a ${RANK_WORD[def.rank]}.`}
              </p>
            )}
            <p class="idea-unlocks small">
              <span class="muted">{v.unlocked ? 'Brought' : 'Brings'}</span>
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

/** A little pencil ring that fills as the idea comes together. */
function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span class="idea-gauge" title={`${Math.round(v)}% of the way`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r={r} class="track" />
        <circle
          cx="12"
          cy="12"
          r={r}
          class="fill"
          stroke-dasharray={`${((v / 100) * c).toFixed(2)} ${c.toFixed(2)}`}
          transform="rotate(-90 12 12)"
        />
      </svg>
      <b>{Math.round(v)}%</b>
    </span>
  );
}
