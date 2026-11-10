// Playtest round seven ("overall goal should be clearer"): the next thing the County asks, in words
// with a slim progress bar, beside the rank pennant in both lenses. It follows the Charter goals,
// then the trial that seals the Charter, then rests. Hover lists every goal; a click opens the
// board (or the trial card).
import { calendar, DAYS_PER_SEASON, type CharterView, type TrialView } from '@qoti/sim';
import type { Session } from '../app/session';
import { Glyph } from './icons';
import { RANK_WORD } from './village';

export interface GoalLine {
  /** Words for the pill: "Village Charter: 22 of 30 residents". */
  text: string;
  /** Short count for the second line: "3 of 5 goals". */
  count: string;
  /** 0 to 1. */
  progress: number;
  /** Everything the hover lists, one line each. */
  detail: string[];
  ready: boolean;
  /** Where a click goes. */
  opens: 'charter' | 'trial' | 'chapter';
  tone: 'charter' | 'trial' | 'rest';
}

const TRIAL_KEEP: Record<TrialView['kind'], string> = {
  winter: 'keep every home warm and fed',
  raid: 'keep the stores and the Watch ready',
  flood: 'keep to the high ground',
};

/** "22 of 30 residents" from a goal whose text already carries its target. */
function goalWords(g: CharterView['goals'][number]): string {
  const value = Math.min(g.value, g.target);
  return g.text.startsWith(`${g.target} `) ? `${value} of ${g.text}` : g.text;
}

/** The goal closest to done (ties in content order); null when every goal is met. */
export function nextGoal(c: CharterView): CharterView['goals'][number] | null {
  let best: CharterView['goals'][number] | null = null;
  let bestFrac = -1;
  for (const g of c.goals) {
    if (g.done) continue;
    const frac = Math.min(1, g.value / Math.max(1, g.target));
    if (frac > bestFrac) {
      best = g;
      bestFrac = frac;
    }
  }
  return best;
}

/** What the pill says, from the Charter and the trial. Pure, so it can be tested. */
export function goalLine(
  c: CharterView | null,
  trial: TrialView | null,
  tick: number,
): GoalLine | null {
  if (!c) return null;
  if (c.next) {
    const done = c.goals.filter((g) => g.done).length;
    const detail = c.goals.map(
      (g) =>
        `${g.done ? '✓' : '○'} ${g.text}${g.done ? '' : ` (${Math.min(g.value, g.target)} of ${g.target})`}`,
    );
    const name = `${RANK_WORD[c.next]} Charter`;
    const count = `${done} of ${c.goals.length} goals`;
    if (c.ready) {
      return {
        text: 'The Charter is ready to sign',
        count,
        progress: 1,
        detail,
        ready: true,
        opens: 'charter',
        tone: 'charter',
      };
    }
    const g = nextGoal(c);
    return {
      text: g ? `${name}: ${goalWords(g)}` : name,
      count,
      progress: g ? g.value / Math.max(1, g.target) : 1,
      detail,
      ready: false,
      opens: 'charter',
      tone: 'charter',
    };
  }
  // P1 (playtest item 13): the First Winter weathered closes the Village chapter; the pill reopens it.
  if (trial && trial.status === 'passed') {
    return {
      text: 'Village chapter complete',
      count: 'Read it again',
      progress: 1,
      detail: [`${trial.name} is weathered and the Charter is sealed.`],
      ready: false,
      opens: 'chapter',
      tone: 'rest',
    };
  }
  if (trial && trial.status !== 'failed') {
    const cal = calendar(tick);
    const running = trial.status === 'running';
    const day = running && cal.season === trial.season ? Math.min(DAYS_PER_SEASON, cal.day) : 0;
    const text = running
      ? `${trial.name}: day ${Math.max(1, day)} of ${DAYS_PER_SEASON}, ${TRIAL_KEEP[trial.kind]}`
      : `${trial.name}: comes with the snow`;
    return {
      text,
      count: 'The trial',
      progress: running ? day / DAYS_PER_SEASON : 0,
      detail: [trial.blurb],
      ready: false,
      opens: 'trial',
      tone: 'trial',
    };
  }
  if (trial && trial.status === 'failed') {
    return {
      text: `${trial.name}: not this time, it comes round again`,
      count: 'The trial',
      progress: 0,
      detail: [trial.blurb],
      ready: false,
      opens: 'trial',
      tone: 'trial',
    };
  }
  return {
    text: 'The County has nothing more to ask, for now',
    count: '',
    progress: 1,
    detail: [],
    ready: false,
    opens: 'charter',
    tone: 'rest',
  };
}

export function GoalPill({ session }: { session: Session }) {
  const m = session.mirror;
  const line = goalLine(m.charter.value, m.trial.value, m.tick.value);
  if (!line) return null;
  const open =
    line.opens === 'chapter' ? session.ui.chapter.value : session.ui.panel.value === line.opens;
  const title = [line.text + (line.count ? ` (${line.count})` : ''), ...line.detail].join('\n');
  return (
    <button
      type="button"
      class={`goal-pill tone-${line.tone} ${line.ready ? 'ready' : ''} ${open ? 'open' : ''}`}
      data-testid="goal-pill"
      title={`${title}\nClick for the ${line.opens === 'trial' ? 'trial' : line.opens === 'chapter' ? 'chapter' : 'Charter board'}.`}
      onClick={() => {
        if (line.opens === 'chapter') session.ui.chapter.value = !open;
        else session.ui.panel.value = open ? null : line.opens;
      }}
    >
      <Glyph id={line.tone === 'trial' ? 'trial' : 'charter'} />
      <span class="goal-body">
        <span class="goal-text">{line.text}</span>
        <span class="goal-meter">
          <span class="goal-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(Math.min(1, Math.max(0, line.progress)) * 100)}%` }} />
          </span>
          {line.count && <span class="goal-count">{line.count}</span>}
        </span>
      </span>
    </button>
  );
}
