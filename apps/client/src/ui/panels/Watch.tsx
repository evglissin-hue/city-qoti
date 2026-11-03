// I3 (C5F): the Watch, a duty roster pinned to a board. Who is on it and who is on duty today, how
// many the town wants and what it spends a day, training and morale with what lifts it, and the
// posture: up to three guard points placed on the map. The Ledger also sees the pressure.
import { WATCH_POSTURE_MAX, type MoodBand } from '@qoti/sim';
import type { Session } from '../../app/session';
import { CompassArrow } from '../art';
import { personName } from '../format';
import { MOOD_WORD } from '../hamlet';
import { BAND_WORD, moraleWord, SIDE_WORD, signWord, starsText, trainingWord, whenWord } from '../seasons';
import { Empty, Frame, Meter } from './parts';

/** The panel's caps match the commands' (watch.setTarget and watch.setBudget). */
const TARGET_MAX = 40;
const BUDGET_MAX = 50;

/** What lifts or lowers Watch morale, in words (C5D computes the number; this explains it). */
export function moraleParts(
  session: Session,
  members: number[],
): { label: string; note: string; good: boolean }[] {
  const m = session.mirror;
  let mood = 0;
  let n = 0;
  for (const r of m.residents.values()) {
    mood += r.moodBand;
    n++;
  }
  const band = n ? Math.round(mood / n) : 2;
  const fest = m.festivalResult.value;
  const last = m.raidResult.value;
  const paired = members.filter((id) => {
    const r = m.residents.get(id);
    return r?.partner !== undefined && members.includes(r.partner);
  }).length;
  return [
    { label: 'Town mood', note: MOOD_WORD[band as MoodBand], good: band >= 2 },
    {
      label: 'Recent festivals',
      note: fest ? starsText(fest.stars) : 'None yet',
      good: (fest?.stars ?? 0) >= 3,
    },
    {
      label: 'Friends on the roster',
      note: members.length > 1 ? `${members.length} who know each other` : 'Too few to tell',
      good: members.length > 1 || paired > 0,
    },
    {
      label: 'Past victories',
      note: last ? (last.repelled ? 'Saw the last lot off' : 'Lost the last one') : 'Untested',
      good: !!last?.repelled,
    },
  ];
}

export function WatchPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.hamletRevision.value;
  const w = m.watch.value;
  const t = m.threat.value;
  const close = () => {
    session.ui.panel.value = null;
    session.ui.postureDraft.value = null;
    session.render?.setGhost(null);
  };
  const house = [...m.buildings.values()].some((b) => b.def === 'watch-house' && b.stage === 'built');
  if (!w) {
    return (
      <Frame id="watch" class="book-panel watch-board" onClose={close} title="The Watch">
        <Empty>No Watch yet. A Watch House at Village rank, and volunteers will come.</Empty>
      </Frame>
    );
  }
  const draft = session.ui.postureDraft.value;
  const guards = draft ?? w.posture;
  const duty = new Set(w.duty);
  const ledger = session.ui.lens.value === 'ledger';
  const sendPosture = () => {
    session.submit({ t: 'watch.setPosture', guards: guards.map(([x, z]) => [x, z] as [number, number]) });
    session.ui.postureDraft.value = null;
  };
  return (
    <Frame
      id="watch"
      class="book-panel watch-board"
      icon="watch"
      kicker="Pinned to the board"
      title="The Watch"
      onClose={close}
    >
      {!house && <p class="small muted">No Watch House stands yet: the roster is on paper only.</p>}
      {t?.band && t.side && (
        <section class="board-note threat-note" data-testid="watch-threat">
          <CompassArrow side={t.side} />
          <p>
            {BAND_WORD[t.band]} from {SIDE_WORD[t.side]}, {whenWord(t.daysLeft ?? 0)}.{' '}
            {t.signs.map(signWord).join('. ')}
            {t.signs.length ? '.' : ''}
          </p>
        </section>
      )}
      {ledger && t?.pressure !== undefined && (
        <Meter
          label="Bandits' interest in the town"
          value={t.pressure / 1000}
          note={t.pressure >= 1000 ? 'Tempting' : 'Mild'}
          tone="ochre"
          testid="watch-pressure"
        />
      )}

      <section class="board-card roster" data-testid="watch-roster">
        <h4>
          The roster{' '}
          <span class="muted small">
            {w.members.length} of {w.target} wanted
          </span>
        </h4>
        {w.members.length === 0 ? (
          <p class="muted small">
            Nobody has signed up yet. Volunteers are adults with a bond of two or more.
          </p>
        ) : (
          <ul>
            {w.members.map((id) => {
              const r = m.residents.get(id);
              return (
                <li key={id} class={duty.has(id) ? 'on-duty' : ''} data-testid={`watch-member-${id}`}>
                  <button
                    type="button"
                    class="link-button"
                    onClick={() => (session.ui.selection.value = { kind: 'resident', id })}
                  >
                    {r ? personName(r) : `Member ${id}`}
                  </button>
                  {duty.has(id) && <span class="duty-tag">on duty</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div class="board-pair">
        <section class="board-card" data-testid="watch-target">
          <h4>How many</h4>
          <span class="stepper">
            <button
              type="button"
              aria-label="Fewer"
              onClick={() => session.submit({ t: 'watch.setTarget', size: Math.max(0, w.target - 1) })}
            >
              −
            </button>
            <b>{w.target}</b>
            <button
              type="button"
              aria-label="More"
              data-testid="watch-target-more"
              onClick={() =>
                session.submit({ t: 'watch.setTarget', size: Math.min(TARGET_MAX, w.target + 1) })
              }
            >
              +
            </button>
          </span>
          <p class="small muted">Each spends one day in four on duty, away from work.</p>
        </section>
        <section class="board-card" data-testid="watch-budget">
          <h4>Coins a day</h4>
          <span class="stepper">
            <button
              type="button"
              aria-label="Less"
              onClick={() => session.submit({ t: 'watch.setBudget', coins: Math.max(0, w.budget - 1) })}
            >
              −
            </button>
            <b>{w.budget}</b>
            <button
              type="button"
              aria-label="More"
              data-testid="watch-budget-more"
              onClick={() =>
                session.submit({ t: 'watch.setBudget', coins: Math.min(BUDGET_MAX, w.budget + 1) })
              }
            >
              +
            </button>
          </span>
          <p class="small muted">Slings, staffs, nets and lantern oil. Training rises with it.</p>
        </section>
      </div>

      <section class="board-card" data-testid="watch-strength">
        <h4>
          Strength <b class="strength">{w.strength}</b>
        </h4>
        <Meter
          label="Training"
          value={(w.training - 100) / 60}
          note={trainingWord(w.training)}
          tone="river"
        />
        <Meter
          label="Morale"
          value={w.morale / 100}
          note={moraleWord(w.morale)}
          tone="sage"
          testid="watch-morale"
        />
        <ul class="morale-parts" data-testid="morale-parts">
          {moraleParts(session, w.members).map((p) => (
            <li key={p.label} class={p.good ? 'up' : 'down'}>
              <span>{p.label}</span>
              <span class="muted">{p.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section class="board-card posture" data-testid="watch-posture">
        <h4>
          Guard points{' '}
          <span class="muted small">
            {guards.length} of {WATCH_POSTURE_MAX}
          </span>
        </h4>
        {guards.length === 0 ? (
          <p class="small muted">None set: the Watch will mind the storehouses as best it can.</p>
        ) : (
          <ol>
            {guards.map(([x, z], i) => (
              <li key={`${x},${z}`}>
                <button type="button" class="link-button" onClick={() => session.render?.focus(x, z)}>
                  Point {i + 1}, near {x}, {z}
                </button>
              </li>
            ))}
          </ol>
        )}
        <div class="row-actions">
          <button
            type="button"
            class="ghost-button"
            data-testid="watch-place-guards"
            onClick={() => {
              session.ui.postureDraft.value = guards.map(([x, z]) => [x, z]);
              // The board steps aside while the points are placed; each click brings it back.
              session.ui.panel.value = null;
              session.tools?.select('guard');
            }}
          >
            Place on the map
          </button>
          {draft && (
            <button type="button" class="primary" data-testid="watch-send-posture" onClick={sendPosture}>
              Post the orders
            </button>
          )}
        </div>
      </section>
    </Frame>
  );
}
