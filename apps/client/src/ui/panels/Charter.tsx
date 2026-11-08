import { content } from '@qoti/content';
import type { CharterView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { seatList, shortDate } from '../format';
import { Glyph } from '../icons';
import { RANK_WORD } from '../village';
import { Empty, Frame, Meter } from './parts';
import { LaneTag } from './villageParts';

/** Readable names for what a Charter unlocks: content names, or a word for capabilities. */
const UNLOCK_WORD: Record<string, string> = {
  zoning: 'Zoning',
  'market-prices': 'Market prices',
  craftsfolk: 'Craftsfolk',
  loans: 'The County Bank',
  carts: 'Carts',
  'porter-carry-6': 'Porters carry six',
};

export function unlockName(id: string): string {
  return (
    UNLOCK_WORD[id] ??
    content.buildingById.get(id)?.name ??
    content.roads.find((r) => r.id === id)?.name ??
    content.decorById.get(id)?.name ??
    content.innovationById.get(id)?.name ??
    id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
  );
}

/**
 * The Charter board (docs/spec/15-progression.md): the County's goals for the next rank, each
 * tagged with the lane that usually gets it done, and the claim once they are all met.
 */
export function CharterPanel({ session }: { session: Session }) {
  const m = session.mirror;
  const c = m.charter.value;
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame
      id="charter"
      class="book-panel charter"
      icon="charter"
      kicker={c ? `${m.settings.value.townName}, a ${RANK_WORD[c.rank].toLowerCase()}` : 'The County'}
      title="The Charter"
      onClose={close}
    >
      {!c ? (
        <Empty>No Charter for a creative valley. Rank is whatever you say it is.</Empty>
      ) : (
        <Board session={session} c={c} />
      )}
      <p class="charter-foot">
        <button
          type="button"
          class="link"
          data-testid="open-notebook"
          onClick={() => (session.ui.panel.value = 'notebook')}
        >
          <Glyph id="notebook" /> The inventor&apos;s notebook
        </button>
      </p>
    </Frame>
  );
}

function Board({ session, c }: { session: Session; c: CharterView }) {
  if (!c.next) {
    return (
      <div class="charter-board done" data-testid="charter-board">
        <p class="proclamation">
          The County has nothing more to ask of {session.mirror.settings.value.townName} for now. Enjoy it.
        </p>
        <History session={session} c={c} />
      </div>
    );
  }
  const def = content.charterById.get(c.charter);
  const done = c.goals.filter((g) => g.done).length;
  return (
    <div class="charter-board" data-testid="charter-board">
      <div class="charter-doc">
        <p class="charter-title">The {RANK_WORD[c.next]} Charter</p>
        <p class="charter-lede">
          To be made a <b>{RANK_WORD[c.next]}</b>, the County would like to see:
        </p>
        <ol class="charter-goals">
          {c.goals.map((g) => (
            <li key={g.id} class={`goal ${g.done ? 'done' : ''}`} data-testid={`goal-${g.id}`}>
              <span class="goal-check" aria-label={g.done ? 'Done' : 'Not yet'}>
                {g.done && <Glyph id="check" />}
              </span>
              <div class="goal-body">
                <p>
                  <span class="goal-text">{g.text}</span> <LaneTag lane={g.lane} />
                </p>
                {!g.done && (
                  <Meter
                    value={g.value / Math.max(1, g.target)}
                    note={`${Math.min(g.value, g.target)} of ${g.target}`}
                    tone={g.lane === 'hearth' ? 'sage' : g.lane === 'ledger' ? 'ochre' : 'river'}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
        <p class="muted small charter-count">
          {done} of {c.goals.length} met.{' '}
          {c.ready
            ? 'Every box is ticked.'
            : done === 0
              ? 'Early days.'
              : 'The lane tags say who usually gets each one done; nobody is checking.'}
        </p>
        <span class={`wax-seal ${c.ready ? 'ready' : ''}`} aria-hidden="true">
          {session.mirror.settings.value.townName.slice(0, 1)}
        </span>
      </div>
      {def && def.unlocks.length > 0 && (
        <p class="charter-unlocks small">
          <span class="label">Brings</span>
          {def.unlocks.map((u) => (
            <span key={u} class="unlock-chip">
              {unlockName(u)}
            </span>
          ))}
        </p>
      )}
      <button
        type="button"
        class={`primary claim ${c.ready ? 'ready' : ''}`}
        disabled={!c.ready}
        data-testid="charter-claim"
        title={c.ready ? undefined : 'Not every goal is met yet'}
        onClick={() => session.submit({ t: 'charter.claim' })}
      >
        <Glyph id="charter" /> {c.ready ? `Claim the ${RANK_WORD[c.next]} Charter` : 'Not ready to claim yet'}
      </button>
      <History session={session} c={c} />
      {c.history.length === 0 && (
        <p class="muted small">Either of you can claim it, though it is nicer together.</p>
      )}
    </div>
  );
}

function History({ session, c }: { session: Session; c: CharterView }) {
  if (!c.history.length) return null;
  const seats = session.mirror.seats.value;
  return (
    <ul class="rank-history">
      {[...c.history].reverse().map((h) => (
        <li key={h.rank}>
          <Glyph id="rank" />
          <span>
            Made a <b>{RANK_WORD[h.rank]}</b> on {shortDate(h.tick)}
            {/* The comma stays in the date's run so the font kerns it against the tabular "1". */}
            {h.seats.length > 0 && (
              <>
                , <span class="muted">with {seatList(seats, h.seats, session.seat)} there</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
